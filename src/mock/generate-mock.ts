import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  esdfDistanceToRgb,
  POINT_RGBXYZ_BYTE_STRIDE,
  type PointRgbXyz,
  VOXEL_CELL_STATE_FREE,
  VOXEL_CELL_STATE_NEAR_COLLISION,
  VOXEL_CELL_STATE_OCCUPIED,
  VOXEL_MAP_CELL_STRIDE,
  VOXEL_MAP_FLAG_COLOR_BY_ESDF,
  VOXEL_MAP_FLAG_ESDF,
  VOXEL_MAP_FLAG_OCCUPANCY,
  VOXEL_MAP_HEADER_BYTES,
  VOXEL_MAP_MAGIC,
  VOXEL_MAP_VERSION,
  type VoxelMapCell,
  type VoxelMapHeader
} from '@shared/proto'

function sdfSphere(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number
): number {
  return Math.hypot(x - cx, y - cy, z - cz) - radius
}

function sdfBox(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number
): number {
  const dx = Math.abs(x - cx) - hx
  const dy = Math.abs(y - cy) - hy
  const dz = Math.abs(z - cz) - hz
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
  const inside = Math.min(Math.max(dx, dy, dz), 0)
  return outside + inside
}

function sdfVerticalCylinder(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  halfHeight: number
): number {
  const dr = Math.hypot(x - cx, y - cy) - radius
  const dz = Math.abs(z - cz) - halfHeight
  const outside = Math.hypot(Math.max(dr, 0), Math.max(dz, 0))
  const inside = Math.min(Math.max(dr, dz), 0)
  return outside + inside
}

/**
 * Generates a 3D Occupancy + ESDF Voxel Map where each cell contains:
 * - `x, y, z`: Voxel center coordinates in meters
 * - `occupancy`: Occupancy probability (`0.0 ~ 1.0`, `>= 0.5` = occupied obstacle)
 * - `esdfDistanceM`: Signed Euclidean collision distance in meters (`<= 0` = inside obstacle)
 * - `r, g, b`: RGB color mapped from `esdfDistanceM` (Red = collision -> Orange -> Yellow -> Green -> Cyan)
 * - `state`: `VOXEL_CELL_STATE_OCCUPIED` / `VOXEL_CELL_STATE_NEAR_COLLISION` / `VOXEL_CELL_STATE_FREE`
 */
export function generateMockVoxelMapData(options?: {
  voxelSizeM?: number
  truncationDistanceM?: number
  occupancyThreshold?: number
}): {
  header: VoxelMapHeader
  cells: VoxelMapCell[]
} {
  const voxelSizeM = options?.voxelSizeM ?? 0.03
  const truncationDistanceM = options?.truncationDistanceM ?? 0.24
  const occupancyThreshold = options?.occupancyThreshold ?? 0.5
  const nearCollisionThresholdM = 0.06

  const cells: VoxelMapCell[] = []

  for (let ix = -10; ix <= 10; ix++) {
    for (let iy = -10; iy <= 10; iy++) {
      for (let iz = 0; iz <= 16; iz++) {
        const x = Number((ix * voxelSizeM).toFixed(4))
        const y = Number((iy * voxelSizeM).toFixed(4))
        const z = Number((iz * voxelSizeM).toFixed(4))

        // Composite obstacle scene SDF: central pillar + canopy sphere + keep-out column box
        const dPillar = sdfVerticalCylinder(x, y, z, 0, 0, 0.16, 0.075, 0.16)
        const dCanopy = sdfSphere(x, y, z, 0, 0, 0.34, 0.13)
        const dKeepoutBox = sdfBox(x, y, z, 0.18, 0.12, 0.12, 0.06, 0.06, 0.12)

        const esdfDistanceM = Number(Math.min(dPillar, dCanopy, dKeepoutBox).toFixed(5))

        // Store occupied voxels and sparse ESDF distance-field shells within truncationDistanceM
        if (esdfDistanceM > truncationDistanceM) continue

        const isOccupied = esdfDistanceM <= 0
        // Keep all occupied obstacle voxels, plus every 2nd grid coordinate in the outer ESDF shell
        // so the internal red/orange obstacles remain clearly visible inside the green/cyan ESDF envelope
        const isEsdfShellSample = ((ix + iy + iz) & 1) === 0
        if (!isOccupied && !isEsdfShellSample) continue

        const occupancy = isOccupied
          ? Math.min(
              1,
              Math.max(occupancyThreshold, Number((0.88 - esdfDistanceM * 1.2).toFixed(4)))
            )
          : Number(
              Math.min(
                occupancyThreshold - 0.02,
                Math.max(0.02, 0.45 * Math.exp(-esdfDistanceM / 0.08))
              ).toFixed(4)
            )

        const state = isOccupied
          ? VOXEL_CELL_STATE_OCCUPIED
          : esdfDistanceM <= nearCollisionThresholdM
            ? VOXEL_CELL_STATE_NEAR_COLLISION
            : VOXEL_CELL_STATE_FREE

        const { r, g, b } = esdfDistanceToRgb(esdfDistanceM, truncationDistanceM)

        cells.push({
          x,
          y,
          z,
          occupancy,
          esdfDistanceM,
          r,
          g,
          b,
          state
        })
      }
    }
  }

  const header: VoxelMapHeader = {
    version: VOXEL_MAP_VERSION,
    flags: VOXEL_MAP_FLAG_OCCUPANCY | VOXEL_MAP_FLAG_ESDF | VOXEL_MAP_FLAG_COLOR_BY_ESDF,
    voxelSizeM,
    voxelCount: cells.length,
    truncationDistanceM,
    occupancyThreshold
  }

  return { header, cells }
}

/**
 * Encodes a `VoxelMapHeader` (`32 bytes`) and `VoxelMapCell[]` (`24 bytes * N`) into a Node.js `Buffer`.
 */
export function encodeVoxelMapBuffer(header: VoxelMapHeader, cells: VoxelMapCell[]): Buffer {
  const totalBytes = VOXEL_MAP_HEADER_BYTES + cells.length * VOXEL_MAP_CELL_STRIDE
  const buffer = Buffer.alloc(totalBytes)

  // Write 32-byte header
  buffer.writeUInt32LE(VOXEL_MAP_MAGIC, 0)
  buffer.writeUInt16LE(header.version, 4)
  buffer.writeUInt16LE(header.flags, 6)
  buffer.writeFloatLE(header.voxelSizeM, 8)
  buffer.writeUInt32LE(cells.length, 12)
  buffer.writeFloatLE(header.truncationDistanceM, 16)
  buffer.writeFloatLE(header.occupancyThreshold, 20)

  // Write 24-byte voxel records
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const offset = VOXEL_MAP_HEADER_BYTES + i * VOXEL_MAP_CELL_STRIDE
    buffer.writeFloatLE(cell.x, offset)
    buffer.writeFloatLE(cell.y, offset + 4)
    buffer.writeFloatLE(cell.z, offset + 8)
    buffer.writeFloatLE(cell.occupancy, offset + 12)
    buffer.writeFloatLE(cell.esdfDistanceM, offset + 16)
    buffer.writeUInt8(cell.r & 0xff, offset + 20)
    buffer.writeUInt8(cell.g & 0xff, offset + 21)
    buffer.writeUInt8(cell.b & 0xff, offset + 22)
    buffer.writeUInt8(cell.state & 0xff, offset + 23)
  }

  return buffer
}

/**
 * Writes the Occupancy + ESDF Voxel Map binary file (`src/mock/voxel_map.bin`) using `node:fs` + `Buffer`.
 */
export function writeMockVoxelMapBinFile(
  filePath: string,
  data = generateMockVoxelMapData()
): Buffer {
  mkdirSync(dirname(filePath), { recursive: true })
  const buffer = encodeVoxelMapBuffer(data.header, data.cells)
  writeFileSync(filePath, buffer)
  return buffer
}

/**
 * Legacy `PointRGBXYZ` generator & writer (`src/mock/mock.bin`).
 */
export function generateMockPointRgbXyzData(): PointRgbXyz[] {
  const { cells } = generateMockVoxelMapData()
  return cells.map(({ r, g, b, x, y, z }) => ({ r, g, b, x, y, z }))
}

export function encodePointRgbXyzBuffer(points: PointRgbXyz[]): Buffer {
  const buffer = Buffer.allocUnsafe(points.length * POINT_RGBXYZ_BYTE_STRIDE)
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const offset = i * POINT_RGBXYZ_BYTE_STRIDE
    buffer.writeUInt8(pt.r & 0xff, offset)
    buffer.writeUInt8(pt.g & 0xff, offset + 1)
    buffer.writeUInt8(pt.b & 0xff, offset + 2)
    buffer.writeFloatLE(pt.x, offset + 3)
    buffer.writeFloatLE(pt.y, offset + 7)
    buffer.writeFloatLE(pt.z, offset + 11)
  }
  return buffer
}

export function writeMockBinFile(
  filePath: string,
  points: PointRgbXyz[] = generateMockPointRgbXyzData()
): Buffer {
  mkdirSync(dirname(filePath), { recursive: true })
  const buffer = encodePointRgbXyzBuffer(points)
  writeFileSync(filePath, buffer)
  return buffer
}
