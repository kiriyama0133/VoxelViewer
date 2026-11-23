import {
  esdfDistanceToRgb,
  VOXEL_CELL_STATE_OCCUPIED,
  VOXEL_MAP_FLAG_COLOR_BY_ESDF,
  VOXEL_MAP_FLAG_ESDF,
  VOXEL_MAP_FLAG_OCCUPANCY,
  VOXEL_MAP_VERSION,
  type VoxelGridFrame
} from '@shared/grpc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeVoxelMapBuffer } from '../../../mock/generate-mock'
import {
  decodeVoxelMapBuffer,
  disposeGrpcHook,
  type GrpcTransport,
  readMockVoxelMapBin,
  setGrpcTransportFactory,
  setMockMode
} from '../../hooks'
import { createTestContext } from '../../test/context'
import { grpcRouter } from './grpc'

describe('grpc router and main/hooks/grpc + voxel_map.bin mock', () => {
  let caller: ReturnType<typeof grpcRouter.createCaller>
  let emitVoxel: ((frame: VoxelGridFrame) => void) | null = null

  const mockTransport: GrpcTransport = {
    handshake: vi.fn(async () => ({
      serverName: 'VoxelPythonGrpc',
      serverVersion: '1.0.0',
      serverTimestampNs: 1000000n
    })),
    startVoxelStream: vi.fn((_req, onFrame) => {
      emitVoxel = onFrame
      return () => {
        emitVoxel = null
      }
    }),
    close: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setMockMode(false)
    disposeGrpcHook()
    setGrpcTransportFactory(async () => mockTransport)
    caller = grpcRouter.createCaller(createTestContext())
  })

  afterEach(() => {
    disposeGrpcHook()
    setGrpcTransportFactory(null)
    setMockMode(null)
  })

  it('connects and performs handshake', async () => {
    const status = await caller.connect({ host: '127.0.0.1', port: 50051 })

    expect(status.state).toBe('connected')
    expect(status.isMock).toBe(false)
    expect(status.endpoint).toBe('127.0.0.1:50051')
    expect(status.serverInfo).toEqual({
      serverName: 'VoxelPythonGrpc',
      serverVersion: '1.0.0'
    })
  })

  it('starts voxel stream and updates telemetry on incoming frames', async () => {
    await caller.connect()
    const streamStatus = await caller.startStream()
    expect(streamStatus.state).toBe('streaming')

    const frame: VoxelGridFrame = {
      frameId: 1n,
      timestampNs: BigInt(Date.now()) * 1_000_000n,
      coordinateFrame: 'world',
      voxelSizeM: 0.02,
      bounds: {
        minBound: { x: -0.5, y: -0.5, z: 0 },
        maxBound: { x: 0.5, y: 0.5, z: 1 }
      },
      voxelCount: 1200,
      encoding: 'VOXEL_ENCODING_OCCUPANCY_ESDF',
      compression: 'PAYLOAD_COMPRESSION_ZSTD',
      isDelta: false,
      positionsBuffer: new Uint8Array(12),
      colorsBuffer: new Uint8Array(4)
    }

    emitVoxel?.(frame)
    expect(await caller.latestVoxelFrame()).toEqual(frame)

    const currentStatus = await caller.status()
    expect(currentStatus.telemetry.receivedVoxelFrames).toBe(1)
    expect(currentStatus.telemetry.lastVoxelCount).toBe(1200)

    const stopped = await caller.stopStream()
    expect(stopped.state).toBe('connected')
  })

  it('disconnects cleanly', async () => {
    await caller.connect()
    const status = await caller.disconnect()
    expect(status.state).toBe('disconnected')
    expect(mockTransport.close).toHaveBeenCalledTimes(1)
  })

  it('encodes and decodes Occupancy + ESDF VoxelMap binary buffer and loads voxel_map.bin in Mock mode', async () => {
    const cOccupied = esdfDistanceToRgb(-0.02, 0.24)
    const cFree = esdfDistanceToRgb(0.24, 0.24)

    // Collision surface (d <= 0) is Red-dominant; far free space (d = truncation) is Blue/Cyan-dominant
    expect(cOccupied.r).toBeGreaterThan(200)
    expect(cFree.b).toBeGreaterThan(200)

    const customBuf = encodeVoxelMapBuffer(
      {
        version: VOXEL_MAP_VERSION,
        flags: VOXEL_MAP_FLAG_OCCUPANCY | VOXEL_MAP_FLAG_ESDF | VOXEL_MAP_FLAG_COLOR_BY_ESDF,
        voxelSizeM: 0.03,
        voxelCount: 1,
        truncationDistanceM: 0.24,
        occupancyThreshold: 0.5
      },
      [
        {
          x: 0.12,
          y: -0.06,
          z: 0.18,
          occupancy: 0.92,
          esdfDistanceM: -0.015,
          r: cOccupied.r,
          g: cOccupied.g,
          b: cOccupied.b,
          state: VOXEL_CELL_STATE_OCCUPIED
        }
      ]
    )

    const decoded = decodeVoxelMapBuffer(customBuf)
    expect(decoded.header.voxelCount).toBe(1)
    expect(decoded.occupiedCount).toBe(1)
    expect(decoded.cells[0].x).toBeCloseTo(0.12, 4)
    expect(decoded.cells[0].occupancy).toBeCloseTo(0.92, 4)
    expect(decoded.cells[0].esdfDistanceM).toBeCloseTo(-0.015, 4)
    expect(decoded.frame.encoding).toBe('VOXEL_ENCODING_OCCUPANCY_ESDF')

    // End-to-end Mock mode reading `src/mock/voxel_map.bin`
    setGrpcTransportFactory(null)
    setMockMode(true)

    const loaded = readMockVoxelMapBin()
    expect(loaded.cells.length).toBeGreaterThan(1000)
    expect(loaded.occupiedCount).toBeGreaterThan(100)
    expect(loaded.esdfCount).toBeGreaterThan(500)

    const status = await caller.connect()
    expect(status.isMock).toBe(true)
    expect(status.endpoint).toBe('mock://src/mock/voxel_map.bin')
    expect(status.state).toBe('streaming')
    expect(status.telemetry.lastVoxelCount).toBe(loaded.cells.length)
    expect(status.telemetry.occupiedVoxelCount).toBe(loaded.occupiedCount)
    expect(status.telemetry.esdfVoxelCount).toBe(loaded.esdfCount)

    const latest = await caller.latestVoxelFrame()
    expect(latest?.encoding).toBe('VOXEL_ENCODING_OCCUPANCY_ESDF')
    expect(latest?.voxelCount).toBe(loaded.cells.length)
  })
})
