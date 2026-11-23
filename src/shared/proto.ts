import { z } from 'zod'

/**
 * TypeScript data models, Zod schemas, binary format constants, and zero-copy TypedArray decoders
 * corresponding to `protos/voxel_viewer.proto` (package `voxelviewer.v1`).
 */

export const vec3fSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
})
export type Vec3f = z.infer<typeof vec3fSchema>

/**
 * Legacy `PointRGBXYZ` record layout (`15 bytes` per point in `src/mock/mock.bin`):
 * `[R: uint8, G: uint8, B: uint8, X: float32LE, Y: float32LE, Z: float32LE]`
 */
export const POINT_RGBXYZ_BYTE_STRIDE = 15

export interface PointRgbXyz {
  r: number
  g: number
  b: number
  x: number
  y: number
  z: number
}

/**
 * Unified Occupancy + ESDF Binary Voxel Map format (`src/mock/voxel_map.bin`):
 *
 * 1. **Header (`32 bytes` fixed, 4-byte aligned)**:
 *    - `0..3`   (`uint32LE`): Magic `"VXMP"` (`0x504D5856`)
 *    - `4..5`   (`uint16LE`): Format Version (`1`)
 *    - `6..7`   (`uint16LE`): Feature Flags (`bit 0 = OCCUPANCY`, `bit 1 = ESDF`, `bit 2 = COLOR_BY_ESDF`)
 *    - `8..11`  (`float32LE`): `voxelSizeM` (voxel edge length in meters)
 *    - `12..15` (`uint32LE`): `voxelCount` (number of voxel cells)
 *    - `16..19` (`float32LE`): `truncationDistanceM` (max ESDF collision distance in meters)
 *    - `20..23` (`float32LE`): `occupancyThreshold` (occupied probability threshold, e.g. `0.5`)
 *    - `24..31` (`8 bytes`):  Reserved (`0`)
 *
 * 2. **Per-Voxel Cell Record (`24 bytes` fixed stride, 4-byte aligned)**:
 *    - `0..3`   (`float32LE`): `x` (center X in meters)
 *    - `4..7`   (`float32LE`): `y` (center Y in meters)
 *    - `8..11`  (`float32LE`): `z` (center Z in meters)
 *    - `12..15` (`float32LE`): `occupancy` (`0.0 ~ 1.0` occupancy probability)
 *    - `16..19` (`float32LE`): `esdfDistanceM` (signed Euclidean collision distance in meters)
 *    - `20`     (`uint8`):     `r` (`0..255` collision-distance color R)
 *    - `21`     (`uint8`):     `g` (`0..255` collision-distance color G)
 *    - `22`     (`uint8`):     `b` (`0..255` collision-distance color B)
 *    - `23`     (`uint8`):     `state` (`0 = FREE_ESDF`, `1 = OCCUPIED`, `2 = NEAR_COLLISION`)
 */
export const VOXEL_MAP_MAGIC = 0x504d5856 // "VXMP" in little-endian
export const VOXEL_MAP_VERSION = 1
export const VOXEL_MAP_HEADER_BYTES = 32
export const VOXEL_MAP_CELL_STRIDE = 24

export const VOXEL_MAP_FLAG_OCCUPANCY = 1 << 0
export const VOXEL_MAP_FLAG_ESDF = 1 << 1
export const VOXEL_MAP_FLAG_COLOR_BY_ESDF = 1 << 2

export const VOXEL_CELL_STATE_FREE = 0
export const VOXEL_CELL_STATE_OCCUPIED = 1
export const VOXEL_CELL_STATE_NEAR_COLLISION = 2

export interface VoxelMapHeader {
  version: number
  flags: number
  voxelSizeM: number
  voxelCount: number
  truncationDistanceM: number
  occupancyThreshold: number
}

export interface VoxelMapCell {
  x: number
  y: number
  z: number
  occupancy: number
  esdfDistanceM: number
  r: number
  g: number
  b: number
  state: number
}

/**
 * Maps a signed Euclidean collision distance (`esdfDistanceM`) to an RGB color:
 * - `d <= 0` (Occupied Obstacle / Collision): Red `(239, 68, 68)`
 * - `t = 0.25` (Near-collision warning zone): Orange `(249, 115, 22)`
 * - `t = 0.50` (Medium clearance): Yellow `(234, 179, 8)`
 * - `t = 0.75` (Safe clearance): Emerald Green `(34, 197, 94)`
 * - `t >= 1.0` (`d >= truncationDistanceM`, Far free space): Sky Cyan `(14, 165, 233)`
 */
export function esdfDistanceToRgb(
  esdfDistanceM: number,
  truncationDistanceM = 0.3
): { r: number; g: number; b: number } {
  const safeTrunc = Math.max(1e-4, truncationDistanceM)
  const normalized = Math.min(1, Math.max(0, esdfDistanceM / safeTrunc))

  const stops: [number, [number, number, number]][] = [
    [0.0, [239, 68, 68]],
    [0.25, [249, 115, 22]],
    [0.5, [234, 179, 8]],
    [0.75, [34, 197, 94]],
    [1.0, [14, 165, 233]]
  ]

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (normalized >= t0 && normalized <= t1) {
      const alpha = (normalized - t0) / (t1 - t0)
      return {
        r: Math.round(c0[0] + (c1[0] - c0[0]) * alpha),
        g: Math.round(c0[1] + (c1[1] - c0[1]) * alpha),
        b: Math.round(c0[2] + (c1[2] - c0[2]) * alpha)
      }
    }
  }

  return { r: 14, g: 165, b: 233 }
}

export const aabb3fSchema = z.object({
  minBound: vec3fSchema,
  maxBound: vec3fSchema
})
export type Aabb3f = z.infer<typeof aabb3fSchema>

export const voxelEncodingSchema = z.enum([
  'VOXEL_ENCODING_UNSPECIFIED',
  'VOXEL_ENCODING_RAW_FLOAT32_XYZ_RGBA8',
  'VOXEL_ENCODING_QUANTIZED_UINT16_XYZ_RGBA8',
  'VOXEL_ENCODING_OCCUPANCY_ESDF'
])
export type VoxelEncoding = z.infer<typeof voxelEncodingSchema>

export const payloadCompressionSchema = z.enum([
  'PAYLOAD_COMPRESSION_NONE',
  'PAYLOAD_COMPRESSION_LZ4',
  'PAYLOAD_COMPRESSION_ZSTD',
  'PAYLOAD_COMPRESSION_GZIP'
])
export type PayloadCompression = z.infer<typeof payloadCompressionSchema>

export interface VoxelGridFrame {
  frameId: bigint
  timestampNs: bigint
  coordinateFrame: string
  voxelSizeM: number
  bounds: Aabb3f
  voxelCount: number
  encoding: VoxelEncoding
  compression: PayloadCompression
  isDelta: boolean
  positionsBuffer: Uint8Array
  colorsBuffer: Uint8Array
  /** Packed Float32Array `[occupancy_0, esdfDistanceM_0, occupancy_1, esdfDistanceM_1, ...]` */
  scalarsBuffer?: Uint8Array
  truncationDistanceM?: number
  occupancyThreshold?: number
}

export const handshakeRequestSchema = z.object({
  clientName: z.string().default('VoxelViewer'),
  clientVersion: z.string().default('0.1.0'),
  supportedEncodings: z
    .array(voxelEncodingSchema)
    .default([
      'VOXEL_ENCODING_OCCUPANCY_ESDF',
      'VOXEL_ENCODING_RAW_FLOAT32_XYZ_RGBA8',
      'VOXEL_ENCODING_QUANTIZED_UINT16_XYZ_RGBA8'
    ]),
  supportedCompressions: z
    .array(payloadCompressionSchema)
    .default(['PAYLOAD_COMPRESSION_NONE', 'PAYLOAD_COMPRESSION_ZSTD', 'PAYLOAD_COMPRESSION_GZIP'])
})
export type HandshakeRequest = z.infer<typeof handshakeRequestSchema>

export const handshakeResponseSchema = z.object({
  serverName: z.string(),
  serverVersion: z.string(),
  serverTimestampNs: z.bigint()
})
export type HandshakeResponse = z.infer<typeof handshakeResponseSchema>

export const voxelStreamRequestSchema = z.object({
  targetFps: z.number().min(1).max(240).default(60),
  minVoxelSizeM: z.number().positive().default(0.02),
  maxVoxels: z.number().int().min(1000).max(5000000).default(500000),
  preferredEncoding: voxelEncodingSchema.default('VOXEL_ENCODING_OCCUPANCY_ESDF'),
  preferredCompression: payloadCompressionSchema.default('PAYLOAD_COMPRESSION_ZSTD'),
  includeScalars: z.boolean().default(true)
})
export type VoxelStreamRequest = z.infer<typeof voxelStreamRequestSchema>

/**
 * Unpacks a `positionsBuffer` into a `Float32Array` (`length = voxelCount * 3`)
 * without copying when 4-byte aligned.
 */
export function decodeRawFloat32Positions(buffer: Uint8Array, voxelCount: number): Float32Array {
  const floatCount = voxelCount * 3
  if (buffer.byteOffset % 4 === 0) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, floatCount)
  }
  const aligned = buffer.slice(0, floatCount * 4)
  return new Float32Array(aligned.buffer, aligned.byteOffset, floatCount)
}

/**
 * Unpacks an `OCCUPANCY_ESDF` `scalarsBuffer` into a `Float32Array` (`length = voxelCount * 2`,
 * interleaved `[occupancy_0, esdfDistanceM_0, occupancy_1, esdfDistanceM_1, ...]`).
 */
export function decodeOccupancyEsdfScalars(buffer: Uint8Array, voxelCount: number): Float32Array {
  const floatCount = voxelCount * 2
  if (buffer.byteOffset % 4 === 0) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, floatCount)
  }
  const aligned = buffer.slice(0, floatCount * 4)
  return new Float32Array(aligned.buffer, aligned.byteOffset, floatCount)
}

/**
 * Dequantizes a `VOXEL_ENCODING_QUANTIZED_UINT16_XYZ_RGBA8` positions buffer into world-space
 * `Float32Array` coordinates (`x = minBound.x + ix * voxelSizeM`).
 */
export function decodeQuantizedUint16Positions(
  buffer: Uint8Array,
  voxelCount: number,
  minBound: Vec3f,
  voxelSizeM: number
): Float32Array {
  const uint16Count = voxelCount * 3
  const quantized =
    buffer.byteOffset % 2 === 0
      ? new Uint16Array(buffer.buffer, buffer.byteOffset, uint16Count)
      : new Uint16Array(buffer.slice(0, uint16Count * 2).buffer)

  const out = new Float32Array(uint16Count)
  for (let i = 0; i < uint16Count; i += 3) {
    out[i] = minBound.x + quantized[i] * voxelSizeM
    out[i + 1] = minBound.y + quantized[i + 1] * voxelSizeM
    out[i + 2] = minBound.z + quantized[i + 2] * voxelSizeM
  }
  return out
}
