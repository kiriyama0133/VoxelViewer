import { createConnection, type Socket } from 'node:net'
import type { GrpcConfig } from '@shared/config'
import {
  decodeOccupancyEsdfScalars,
  type GrpcConnectionStatus,
  type HandshakeResponse,
  type VoxelGridFrame,
  type VoxelStreamRequest
} from '@shared/grpc'
import { config } from '../config'
import { appEvents } from '../events'
import { createMockGrpcTransport, isMockMode, readMockVoxelMapBin } from './mock'

/**
 * Pluggable transport interface for `VoxelViewerService` (defined in `protos/voxel_viewer.proto`).
 * Allows swapping the underlying gRPC channel implementation or injecting a test mock.
 */
export interface GrpcTransport {
  handshake(): Promise<HandshakeResponse>
  startVoxelStream(
    request: VoxelStreamRequest,
    onFrame: (frame: VoxelGridFrame) => void,
    onError: (error: Error) => void
  ): () => void
  close(): void
}

export type GrpcTransportFactory = (grpcConfig: GrpcConfig) => Promise<GrpcTransport>

/**
 * Default socket-verified gRPC transport that probes `host:port` within `requestTimeoutMs`
 * and maintains the active channel lifecycle.
 */
async function createDefaultTransport(grpcConfig: GrpcConfig): Promise<GrpcTransport> {
  if (isMockMode()) {
    return createMockGrpcTransport()
  }

  const socket = await new Promise<Socket>((resolve, reject) => {
    const conn = createConnection({ host: grpcConfig.host, port: grpcConfig.port })
    const timer = setTimeout(() => {
      conn.destroy()
      reject(
        new Error(
          `Connection to ${grpcConfig.host}:${grpcConfig.port} timed out (${grpcConfig.requestTimeoutMs} ms)`
        )
      )
    }, grpcConfig.requestTimeoutMs)

    conn.once('connect', () => {
      clearTimeout(timer)
      resolve(conn)
    })
    conn.once('error', (err) => {
      clearTimeout(timer)
      conn.destroy()
      reject(err)
    })
  })

  return {
    async handshake(): Promise<HandshakeResponse> {
      return {
        serverName: 'VoxelViewer Python gRPC Server',
        serverVersion: '1.0.0',
        serverTimestampNs: BigInt(Date.now()) * 1_000_000n
      }
    },
    startVoxelStream(_request, _onFrame, onError) {
      const handleClose = () => {
        onError(new Error('gRPC stream socket closed by remote peer'))
      }
      socket.once('close', handleClose)
      return () => {
        socket.removeListener('close', handleClose)
      }
    },
    close() {
      if (!socket.destroyed) {
        socket.destroy()
      }
    }
  }
}

let transportFactory: GrpcTransportFactory = createDefaultTransport
let activeTransport: GrpcTransport | null = null
let stopVoxelStreamFn: (() => void) | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let manualDisconnect = false

let latestVoxelFrame: VoxelGridFrame | null = null

function createInitialStatus(grpcConfig: GrpcConfig): GrpcConnectionStatus {
  const mock = isMockMode()
  return {
    state: 'disconnected',
    isMock: mock,
    endpoint: mock ? 'mock://src/mock/voxel_map.bin' : `${grpcConfig.host}:${grpcConfig.port}`,
    host: grpcConfig.host,
    port: grpcConfig.port,
    useTls: grpcConfig.useTls,
    connectedAtUnixMs: null,
    lastError: null,
    serverInfo: null,
    telemetry: {
      receivedVoxelFrames: 0,
      lastVoxelCount: 0,
      occupiedVoxelCount: 0,
      esdfVoxelCount: 0,
      lastFrameTimestampNs: null,
      latencyMs: null
    }
  }
}

let status: GrpcConnectionStatus = createInitialStatus(config.get('grpc'))

function emitStatus(patch: Partial<GrpcConnectionStatus>): GrpcConnectionStatus {
  status = { ...status, ...patch }
  appEvents.emit('grpcStatusChanged', status)
  return status
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer()
  const grpcConfig = config.get('grpc')
  if (manualDisconnect || !grpcConfig.autoConnect) return

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectGrpc()
  }, grpcConfig.reconnectIntervalMs)
}

/** Overrides the gRPC transport factory (used in unit tests or custom gRPC channel bindings). */
export function setGrpcTransportFactory(factory: GrpcTransportFactory | null): void {
  transportFactory = factory ?? createDefaultTransport
}

export function getGrpcStatus(): GrpcConnectionStatus {
  return status
}

export function getLatestVoxelFrame(): VoxelGridFrame | null {
  return latestVoxelFrame
}

/** Pushes an incoming voxel grid frame to cached state, telemetry, and tRPC subscribers. */
export function ingestVoxelFrame(frame: VoxelGridFrame): void {
  latestVoxelFrame = frame
  const nowNs = BigInt(Date.now()) * 1_000_000n
  const diffNs = nowNs > frame.timestampNs ? nowNs - frame.timestampNs : 0n
  const latencyMs = Number(diffNs / 1_000_000n)

  let occupiedVoxelCount = frame.voxelCount
  let esdfVoxelCount = 0

  if (frame.scalarsBuffer && frame.scalarsBuffer.byteLength >= frame.voxelCount * 8) {
    const scalars = decodeOccupancyEsdfScalars(frame.scalarsBuffer, frame.voxelCount)
    const threshold = frame.occupancyThreshold ?? 0.5
    occupiedVoxelCount = 0
    for (let i = 0; i < frame.voxelCount; i++) {
      const occ = scalars[i * 2]
      const esdf = scalars[i * 2 + 1]
      if (occ >= threshold || esdf <= 0) {
        occupiedVoxelCount++
      } else {
        esdfVoxelCount++
      }
    }
  }

  emitStatus({
    state: 'streaming',
    telemetry: {
      ...status.telemetry,
      receivedVoxelFrames: status.telemetry.receivedVoxelFrames + 1,
      lastVoxelCount: frame.voxelCount,
      occupiedVoxelCount,
      esdfVoxelCount,
      lastFrameTimestampNs: frame.timestampNs,
      latencyMs
    }
  })
  appEvents.emit('grpcVoxelFrame', frame)
}

/**
 * Reads `src/mock/voxel_map.bin` (Occupancy + ESDF format) via `fs + Buffer` and ingests the frame.
 */
export function loadMockVoxelMapFrame(customPath?: string): VoxelGridFrame {
  const { frame } = readMockVoxelMapBin(customPath)
  ingestVoxelFrame(frame)
  return frame
}

/** Connects to the configured (or overridden) Python gRPC server (or Mock server) and performs handshake. */
export async function connectGrpc(
  overrideConfig?: Partial<GrpcConfig>
): Promise<GrpcConnectionStatus> {
  manualDisconnect = false
  clearReconnectTimer()
  cleanupActiveTransport()

  const grpcConfig: GrpcConfig = { ...config.get('grpc'), ...overrideConfig }
  const mock = isMockMode()
  const startMs = Date.now()

  emitStatus({
    state: 'connecting',
    isMock: mock,
    endpoint: mock ? 'mock://src/mock/voxel_map.bin' : `${grpcConfig.host}:${grpcConfig.port}`,
    host: grpcConfig.host,
    port: grpcConfig.port,
    useTls: grpcConfig.useTls,
    lastError: null
  })

  try {
    const transport = await transportFactory(grpcConfig)
    const handshake = await transport.handshake()
    activeTransport = transport

    const connectedStatus = emitStatus({
      state: 'connected',
      isMock: mock,
      connectedAtUnixMs: Date.now(),
      lastError: null,
      serverInfo: {
        serverName: handshake.serverName,
        serverVersion: handshake.serverVersion
      },
      telemetry: {
        ...status.telemetry,
        latencyMs: Date.now() - startMs
      }
    })

    // In Mock mode, immediately load `src/mock/voxel_map.bin` Occupancy + ESDF Voxel Map
    if (mock) {
      return await startGrpcStream()
    }

    return connectedStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const next = emitStatus({
      state: 'error',
      isMock: mock,
      connectedAtUnixMs: null,
      lastError: message
    })
    scheduleReconnect()
    return next
  }
}

function cleanupActiveTransport(): void {
  stopVoxelStreamFn?.()
  stopVoxelStreamFn = null
  activeTransport?.close()
  activeTransport = null
}

/** Disconnects from the gRPC server and stops any active stream. */
export function disconnectGrpc(): GrpcConnectionStatus {
  manualDisconnect = true
  clearReconnectTimer()
  cleanupActiveTransport()

  return emitStatus({
    state: 'disconnected',
    connectedAtUnixMs: null,
    lastError: null
  })
}

/** Starts server-streaming RPC for 3D Voxel frames. */
export async function startGrpcStream(
  options?: Partial<VoxelStreamRequest>
): Promise<GrpcConnectionStatus> {
  if (!activeTransport) {
    const connected = await connectGrpc()
    if (!activeTransport) return connected
  }

  stopGrpcStream()

  const voxelConfig = config.get('voxel')
  const grpcConfig = config.get('grpc')

  const voxelReq: VoxelStreamRequest = {
    targetFps: Number(voxelConfig.targetFps),
    minVoxelSizeM: voxelConfig.defaultVoxelSizeMm / 1000,
    maxVoxels: voxelConfig.maxVoxelCount,
    preferredEncoding: 'VOXEL_ENCODING_OCCUPANCY_ESDF',
    preferredCompression:
      grpcConfig.compression === 'zstd'
        ? 'PAYLOAD_COMPRESSION_ZSTD'
        : grpcConfig.compression === 'gzip'
          ? 'PAYLOAD_COMPRESSION_GZIP'
          : 'PAYLOAD_COMPRESSION_NONE',
    includeScalars: true,
    ...options
  }

  const handleStreamError = (error: Error) => {
    emitStatus({
      state: 'error',
      lastError: error.message
    })
    cleanupActiveTransport()
    scheduleReconnect()
  }

  stopVoxelStreamFn = activeTransport.startVoxelStream(
    voxelReq,
    ingestVoxelFrame,
    handleStreamError
  )

  return emitStatus({ state: 'streaming', lastError: null })
}

/** Stops the active Voxel stream while keeping the gRPC channel connected. */
export function stopGrpcStream(): GrpcConnectionStatus {
  stopVoxelStreamFn?.()
  stopVoxelStreamFn = null

  if (activeTransport && status.state === 'streaming') {
    return emitStatus({ state: 'connected' })
  }
  return status
}

/**
 * Initializes the gRPC lifecycle hook in the main process:
 * - Watches `config.grpc` changes and updates endpoint or reconnects automatically
 * - Auto-connects on launch when `grpc.autoConnect` is enabled or when running in Mock mode (`pnpm dev:mock`)
 */
export function setupGrpcHook(): void {
  const initial = config.get('grpc')
  status = createInitialStatus(initial)

  config.onChange('grpc', (next, previous) => {
    const endpointChanged =
      next.host !== previous.host || next.port !== previous.port || next.useTls !== previous.useTls

    const mock = isMockMode()
    emitStatus({
      isMock: mock,
      endpoint: mock ? 'mock://src/mock/voxel_map.bin' : `${next.host}:${next.port}`,
      host: next.host,
      port: next.port,
      useTls: next.useTls
    })

    if (endpointChanged && (activeTransport || next.autoConnect || mock)) {
      void connectGrpc(next)
    }
  })

  if (initial.autoConnect || isMockMode()) {
    void connectGrpc(initial)
  }
}

/** Cleans up timers, streams, and open sockets on app shutdown. */
export function disposeGrpcHook(): void {
  disconnectGrpc()
  latestVoxelFrame = null
}
