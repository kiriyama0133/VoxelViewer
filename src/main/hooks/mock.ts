import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  esdfDistanceToRgb,
  POINT_RGBXYZ_BYTE_STRIDE,
  type PointRgbXyz,
  VOXEL_CELL_STATE_OCCUPIED,
  VOXEL_MAP_CELL_STRIDE,
  VOXEL_MAP_FLAG_COLOR_BY_ESDF,
  VOXEL_MAP_HEADER_BYTES,
  VOXEL_MAP_MAGIC,
  type VoxelGridFrame,
  type VoxelMapCell,
  type VoxelMapHeader
} from '@shared/grpc'
import { app } from 'electron'
import { writeMockBinFile, writeMockVoxelMapBinFile } from '../../mock/generate-mock'
import { config } from '../config'
import type { GrpcTransport } from './grpc'

let mockModeOverride: boolean | null = null

/**
 * Returns true when the application is launched in Mock mode (`pnpm dev:mock`,
 * `--mock` CLI argument, `VOXEL_MOCK=1`, or test override).
 */
export function isMockMode(): boolean {
  if (mockModeOverride !== null) return mockModeOverride
  return (
    process.env.VOXEL_MOCK === '1' ||
    process.env.VOXEL_MOCK === 'true' ||
    process.argv.includes('--mock')
  )
}

/** Overrides Mock mode flag (for unit tests or runtime switching). */
export function setMockMode(enabled: boolean | null): void {
  mockModeOverride = enabled
}

/** Resolves the path to `src/mock/voxel_map.bin` and ensures the file exists on disk. */
export function resolveMockVoxelMapBinPath(customPath?: string): string {
  if (customPath) return customPath
  const baseDir = app?.getAppPath ? app.getAppPath() : process.cwd()
  const candidate = resolve(baseDir, 'src/mock/voxel_map.bin')
  if (!existsSync(candidate)) {
    writeMockVoxelMapBinFile(candidate)
  }
  return candidate
}

/** Resolves the legacy path to `src/mock/mock.bin` (`PointRGBXYZ` point cloud). */
export function resolveMockBinPath(customPath?: string): string {
  if (customPath) return customPath
  const baseDir = app?.getAppPath ? app.getAppPath() : process.cwd()
  const candidate = resolve(baseDir, 'src/mock/mock.bin')
  if (!existsSync(candidate)) {
    writeMockBinFile(candidate)
  }
  return candidate
}

/**
 * Parses a Node.js `Buffer` formatted in the unified Occupancy + ESDF Voxel Map format
 * (`32-byte` `"VXMP"` header + `24-byte` per-voxel records) using only `Buffer` methods.
 */
export function decodeVoxelMapBuffer(buffer: Buffer): {
  header: VoxelMapHeader
  cells: VoxelMapCell[]
  frame: VoxelGridFrame
  occupiedCount: number
  esdfCount: number
} {
  if (buffer.length < VOXEL_MAP_HEADER_BYTES) {
    throw new Error(`Invalid voxel_map.bin: expected at least ${VOXEL_MAP_HEADER_BYTES} bytes`)
  }

  const magic = buffer.readUInt32LE(0)
  if (magic !== VOXEL_MAP_MAGIC) {
    throw new Error(`Invalid voxel_map.bin magic: 0x${magic.toString(16)}`)
  }

  const version = buffer.readUInt16LE(4)
  const flags = buffer.readUInt16LE(6)
  const voxelSizeM = buffer.readFloatLE(8)
  const headerVoxelCount = buffer.readUInt32LE(12)
  const truncationDistanceM = buffer.readFloatLE(16)
  const occupancyThreshold = buffer.readFloatLE(20)

  const availableCells = Math.floor(
    (buffer.length - VOXEL_MAP_HEADER_BYTES) / VOXEL_MAP_CELL_STRIDE
  )
  const voxelCount = Math.min(headerVoxelCount, availableCells)

  const header: VoxelMapHeader = {
    version,
    flags,
    voxelSizeM,
    voxelCount,
    truncationDistanceM,
    occupancyThreshold
  }

  const cells: VoxelMapCell[] = new Array(voxelCount)
  const positionsFloat32 = new Float32Array(voxelCount * 3)
  const colorsRgba8 = new Uint8Array(voxelCount * 4)
  const scalarsFloat32 = new Float32Array(voxelCount * 2)

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  let occupiedCount = 0
  let esdfCount = 0

  const useEsdfColor = (flags & VOXEL_MAP_FLAG_COLOR_BY_ESDF) !== 0

  for (let i = 0; i < voxelCount; i++) {
    const offset = VOXEL_MAP_HEADER_BYTES + i * VOXEL_MAP_CELL_STRIDE
    const x = buffer.readFloatLE(offset)
    const y = buffer.readFloatLE(offset + 4)
    const z = buffer.readFloatLE(offset + 8)
    const occupancy = buffer.readFloatLE(offset + 12)
    const esdfDistanceM = buffer.readFloatLE(offset + 16)
    let r = buffer.readUInt8(offset + 20)
    let g = buffer.readUInt8(offset + 21)
    let b = buffer.readUInt8(offset + 22)
    const state = buffer.readUInt8(offset + 23)

    if (useEsdfColor && r === 0 && g === 0 && b === 0) {
      const mapped = esdfDistanceToRgb(esdfDistanceM, truncationDistanceM)
      r = mapped.r
      g = mapped.g
      b = mapped.b
    }

    if (state === VOXEL_CELL_STATE_OCCUPIED || occupancy >= occupancyThreshold) {
      occupiedCount++
    } else {
      esdfCount++
    }

    cells[i] = { x, y, z, occupancy, esdfDistanceM, r, g, b, state }

    const posIdx = i * 3
    positionsFloat32[posIdx] = x
    positionsFloat32[posIdx + 1] = y
    positionsFloat32[posIdx + 2] = z

    const colIdx = i * 4
    colorsRgba8[colIdx] = r
    colorsRgba8[colIdx + 1] = g
    colorsRgba8[colIdx + 2] = b
    colorsRgba8[colIdx + 3] = state === VOXEL_CELL_STATE_OCCUPIED ? 255 : 140

    const scalarIdx = i * 2
    scalarsFloat32[scalarIdx] = occupancy
    scalarsFloat32[scalarIdx + 1] = esdfDistanceM

    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  if (voxelCount === 0) {
    minX = minY = minZ = 0
    maxX = maxY = maxZ = 0
  }

  const positionsBuffer = new Uint8Array(
    positionsFloat32.buffer,
    positionsFloat32.byteOffset,
    positionsFloat32.byteLength
  )
  const scalarsBuffer = new Uint8Array(
    scalarsFloat32.buffer,
    scalarsFloat32.byteOffset,
    scalarsFloat32.byteLength
  )

  const frame: VoxelGridFrame = {
    frameId: 1n,
    timestampNs: BigInt(Date.now()) * 1_000_000n,
    coordinateFrame: 'world',
    voxelSizeM,
    bounds: {
      minBound: { x: minX, y: minY, z: minZ },
      maxBound: { x: maxX, y: maxY, z: maxZ }
    },
    voxelCount,
    encoding: 'VOXEL_ENCODING_OCCUPANCY_ESDF',
    compression: 'PAYLOAD_COMPRESSION_NONE',
    isDelta: false,
    positionsBuffer,
    colorsBuffer: colorsRgba8,
    scalarsBuffer,
    truncationDistanceM,
    occupancyThreshold
  }

  return { header, cells, frame, occupiedCount, esdfCount }
}

/**
 * Reads `src/mock/voxel_map.bin` using Node.js `fs.readFileSync` + `Buffer`
 * and decodes the Occupancy + ESDF Voxel Map records into a `VoxelGridFrame`.
 */
export function readMockVoxelMapBin(filePath?: string): {
  filePath: string
  header: VoxelMapHeader
  cells: VoxelMapCell[]
  frame: VoxelGridFrame
  occupiedCount: number
  esdfCount: number
} {
  const resolvedPath = resolveMockVoxelMapBinPath(filePath)
  const rawBuffer = readFileSync(resolvedPath)
  const decoded = decodeVoxelMapBuffer(rawBuffer)
  return { filePath: resolvedPath, ...decoded }
}

/**
 * Parses a legacy `PointRGBXYZ` `Buffer` (`15 bytes` per point:
 * `[R: uint8, G: uint8, B: uint8, X: float32LE, Y: float32LE, Z: float32LE]`).
 */
export function decodePointRgbXyzBuffer(
  buffer: Buffer,
  voxelSizeM = config.get('voxel').defaultVoxelSizeMm / 1000
): {
  points: PointRgbXyz[]
  frame: VoxelGridFrame
} {
  const pointCount = Math.floor(buffer.length / POINT_RGBXYZ_BYTE_STRIDE)
  const points: PointRgbXyz[] = new Array(pointCount)
  const positionsFloat32 = new Float32Array(pointCount * 3)
  const colorsRgba8 = new Uint8Array(pointCount * 4)

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (let i = 0; i < pointCount; i++) {
    const offset = i * POINT_RGBXYZ_BYTE_STRIDE
    const r = buffer.readUInt8(offset)
    const g = buffer.readUInt8(offset + 1)
    const b = buffer.readUInt8(offset + 2)
    const x = buffer.readFloatLE(offset + 3)
    const y = buffer.readFloatLE(offset + 7)
    const z = buffer.readFloatLE(offset + 11)

    points[i] = { r, g, b, x, y, z }

    const posIdx = i * 3
    positionsFloat32[posIdx] = x
    positionsFloat32[posIdx + 1] = y
    positionsFloat32[posIdx + 2] = z

    const colIdx = i * 4
    colorsRgba8[colIdx] = r
    colorsRgba8[colIdx + 1] = g
    colorsRgba8[colIdx + 2] = b
    colorsRgba8[colIdx + 3] = 255

    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  if (pointCount === 0) {
    minX = minY = minZ = 0
    maxX = maxY = maxZ = 0
  }

  const positionsBuffer = new Uint8Array(
    positionsFloat32.buffer,
    positionsFloat32.byteOffset,
    positionsFloat32.byteLength
  )

  const frame: VoxelGridFrame = {
    frameId: 1n,
    timestampNs: BigInt(Date.now()) * 1_000_000n,
    coordinateFrame: 'world',
    voxelSizeM,
    bounds: {
      minBound: { x: minX, y: minY, z: minZ },
      maxBound: { x: maxX, y: maxY, z: maxZ }
    },
    voxelCount: pointCount,
    encoding: 'VOXEL_ENCODING_RAW_FLOAT32_XYZ_RGBA8',
    compression: 'PAYLOAD_COMPRESSION_NONE',
    isDelta: false,
    positionsBuffer,
    colorsBuffer: colorsRgba8
  }

  return { points, frame }
}

export function readMockPointCloudBin(filePath?: string): {
  filePath: string
  points: PointRgbXyz[]
  frame: VoxelGridFrame
} {
  const resolvedPath = resolveMockBinPath(filePath)
  const rawBuffer = readFileSync(resolvedPath)
  const { points, frame } = decodePointRgbXyzBuffer(rawBuffer)
  return { filePath: resolvedPath, points, frame }
}

/**
 * Mock gRPC transport that simulates a successful gRPC server connection
 * and loads the Occupancy + ESDF Voxel Map from `src/mock/voxel_map.bin` on stream start.
 */
export async function createMockGrpcTransport(): Promise<GrpcTransport> {
  return {
    async handshake() {
      return {
        serverName: 'VoxelViewer Mock gRPC Server',
        serverVersion: '1.0.0-mock',
        serverTimestampNs: BigInt(Date.now()) * 1_000_000n
      }
    },
    startVoxelStream(_request, onFrame, onError) {
      try {
        const { frame } = readMockVoxelMapBin()
        onFrame(frame)
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
      return () => {}
    },
    close() {}
  }
}
