import type { OrbitControls } from '@react-three/drei'
import type { VoxelColorMode } from '@shared/config'
import {
  decodeOccupancyEsdfScalars,
  decodeQuantizedUint16Positions,
  decodeRawFloat32Positions,
  esdfDistanceToRgb,
  type VoxelGridFrame
} from '@shared/grpc'
import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react'
import * as THREE from 'three'

export type VoxelLayerFilter = 'all' | 'occupied' | 'esdf'

export const DEFAULT_CAMERA_POS: [number, number, number] = [0.68, -0.68, 0.52]
export const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0.18]

const SEMANTIC_COLOR_OCCUPIED = { r: 239, g: 68, b: 68 }
const SEMANTIC_COLOR_WARNING = { r: 249, g: 115, b: 22 }
const SEMANTIC_COLOR_FREE = { r: 14, g: 165, b: 233 }
const NEAR_COLLISION_DISTANCE_M = 0.06

export interface DecodedVoxelFrame {
  positions: Float32Array
  colors: Uint8Array
  scalars: Float32Array | null
  totalCount: number
  occupiedCount: number
  esdfCount: number
  threshold: number
  truncationDistanceM: number
  voxelSizeMm: number
  maxEsdfCm: number
}

/**
 * Normalizes `0..255` RGB channels and assigns them directly to a reusable `THREE.Color`.
 */
export function setColorFromRgb255(
  target: THREE.Color,
  r255: number,
  g255: number,
  b255: number
): THREE.Color {
  return target.setRGB(r255 / 255, g255 / 255, b255 / 255)
}

/**
 * Resolves and assigns the display color of a single voxel instance based on the active `VoxelColorMode`.
 */
export function applyVoxelInstanceColor(
  target: THREE.Color,
  options: {
    index: number
    z: number
    minZ: number
    spanZ: number
    esdf: number
    isOccupied: boolean
    hasScalars: boolean
    truncationDistanceM: number
    colorMode: VoxelColorMode
    colors: Uint8Array
  }
): THREE.Color {
  const {
    index,
    z,
    minZ,
    spanZ,
    esdf,
    isOccupied,
    hasScalars,
    truncationDistanceM,
    colorMode,
    colors
  } = options

  if (colorMode === 'heightZ') {
    const tz = Math.min(1, Math.max(0, (z - minZ) / spanZ))
    const mapped = esdfDistanceToRgb(tz * truncationDistanceM, truncationDistanceM)
    return setColorFromRgb255(target, mapped.r, mapped.g, mapped.b)
  }

  if (colorMode === 'confidence' && hasScalars) {
    const mapped = esdfDistanceToRgb(esdf, truncationDistanceM)
    return setColorFromRgb255(target, mapped.r, mapped.g, mapped.b)
  }

  if (colorMode === 'semantic' && hasScalars) {
    const palette = isOccupied
      ? SEMANTIC_COLOR_OCCUPIED
      : esdf <= NEAR_COLLISION_DISTANCE_M
        ? SEMANTIC_COLOR_WARNING
        : SEMANTIC_COLOR_FREE
    return setColorFromRgb255(target, palette.r, palette.g, palette.b)
  }

  const colorOffset = index * 4
  const r = colors[colorOffset] ?? 200
  const g = colors[colorOffset + 1] ?? 200
  const b = colors[colorOffset + 2] ?? 200
  return setColorFromRgb255(target, r, g, b)
}

/**
 * Computes the cube render scale of a voxel cell so occupied obstacles appear solid
 * while outer ESDF distance-field shells remain semi-transparent / porous.
 */
export function resolveVoxelInstanceScale(
  baseVoxelSizeM: number,
  isOccupied: boolean,
  layerFilter: VoxelLayerFilter
): number {
  if (isOccupied) return baseVoxelSizeM * 0.92
  return layerFilter === 'esdf' ? baseVoxelSizeM * 0.68 : baseVoxelSizeM * 0.36
}

/**
 * Hook that unpacks binary buffers from `VoxelGridFrame` and computes Occupancy / ESDF counts.
 */
export function useDecodedVoxelFrame(
  frame: VoxelGridFrame | null,
  fallbackVoxelSizeMm: number
): DecodedVoxelFrame | null {
  return useMemo(() => {
    if (!frame || frame.voxelCount === 0) return null

    const positions =
      frame.encoding === 'VOXEL_ENCODING_QUANTIZED_UINT16_XYZ_RGBA8'
        ? decodeQuantizedUint16Positions(
            frame.positionsBuffer,
            frame.voxelCount,
            frame.bounds.minBound,
            frame.voxelSizeM
          )
        : decodeRawFloat32Positions(frame.positionsBuffer, frame.voxelCount)

    const scalars =
      frame.scalarsBuffer && frame.scalarsBuffer.byteLength >= frame.voxelCount * 8
        ? decodeOccupancyEsdfScalars(frame.scalarsBuffer, frame.voxelCount)
        : null

    const threshold = frame.occupancyThreshold ?? 0.5
    const truncationDistanceM = frame.truncationDistanceM ?? 0.24
    let occupiedCount = 0
    let esdfCount = 0

    if (scalars) {
      for (let i = 0; i < frame.voxelCount; i++) {
        const occ = scalars[i * 2]
        const esdf = scalars[i * 2 + 1]
        if (occ >= threshold || esdf <= 0) {
          occupiedCount++
        } else {
          esdfCount++
        }
      }
    } else {
      occupiedCount = frame.voxelCount
    }

    const voxelSizeMm =
      frame.voxelSizeM > 0 ? Math.round(frame.voxelSizeM * 1000 * 10) / 10 : fallbackVoxelSizeMm

    return {
      positions,
      colors: frame.colorsBuffer,
      scalars,
      totalCount: frame.voxelCount,
      occupiedCount,
      esdfCount,
      threshold,
      truncationDistanceM,
      voxelSizeMm,
      maxEsdfCm: Math.round(truncationDistanceM * 100)
    }
  }, [frame, fallbackVoxelSizeMm])
}

export type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

/**
 * Hook that manages OrbitControls ref, automatic initial bounding-box centering, and camera reset behavior.
 */
export function useVoxelCameraControls(frame?: VoxelGridFrame | null): {
  controlsRef: RefObject<OrbitControlsHandle | null>
  resetCamera: () => void
} {
  const controlsRef = useRef<OrbitControlsHandle | null>(null)
  const autoCenteredRef = useRef(false)

  const focusOnFrameBounds = useCallback((targetFrame?: VoxelGridFrame | null) => {
    const controls = controlsRef.current
    if (!controls) return
    if (targetFrame && targetFrame.voxelCount > 0 && targetFrame.bounds) {
      const { minBound, maxBound } = targetFrame.bounds
      const cx = 0.5 * (minBound.x + maxBound.x)
      const cy = 0.5 * (minBound.y + maxBound.y)
      const cz = 0.5 * (minBound.z + maxBound.z)
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz)) {
        const span = Math.max(
          0.35,
          maxBound.x - minBound.x,
          maxBound.y - minBound.y,
          maxBound.z - minBound.z
        )
        controls.target.set(cx, cy, cz)
        controls.object.position.set(cx + span * 0.85, cy - span * 0.85, cz + span * 0.65)
        controls.update()
        return
      }
    }
    controls.object.position.set(...DEFAULT_CAMERA_POS)
    controls.target.set(...DEFAULT_CAMERA_TARGET)
    controls.update()
  }, [])

  useEffect(() => {
    if (!frame || frame.voxelCount === 0) {
      autoCenteredRef.current = false
      return
    }
    if (!autoCenteredRef.current && controlsRef.current) {
      autoCenteredRef.current = true
      focusOnFrameBounds(frame)
    }
  }, [frame, focusOnFrameBounds])

  const resetCamera = useCallback(() => {
    focusOnFrameBounds(frame)
  }, [focusOnFrameBounds, frame])

  return { controlsRef, resetCamera }
}

/**
 * Hook that updates a `THREE.InstancedMesh` in-place using pooled `Object3D` and `Color` scratch objects.
 */
export function useVoxelInstancedMesh(options: {
  frame: VoxelGridFrame
  decoded: DecodedVoxelFrame
  layerFilter: VoxelLayerFilter
  colorMode: VoxelColorMode
  maxVoxels: number
}): {
  meshRef: RefObject<THREE.InstancedMesh | null>
  capacity: number
} {
  const { frame, decoded, layerFilter, colorMode, maxVoxels } = options
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const dummyRef = useRef(new THREE.Object3D())
  const colorRef = useRef(new THREE.Color())

  const capacity = Math.max(1, Math.min(frame.voxelCount, maxVoxels))

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = dummyRef.current
    const color = colorRef.current
    const hadInstanceColor = mesh.instanceColor !== null

    const { positions, colors, scalars, threshold, truncationDistanceM } = decoded
    const limit = Math.min(frame.voxelCount, capacity)
    const minZ = frame.bounds.minBound.z
    const spanZ = Math.max(1e-4, frame.bounds.maxBound.z - minZ)
    const baseSize = frame.voxelSizeM > 0 ? frame.voxelSizeM : 0.02
    const hasScalars = scalars !== null

    let instanceIdx = 0

    for (let i = 0; i < limit; i++) {
      const occ = scalars ? scalars[i * 2] : 1
      const esdf = scalars ? scalars[i * 2 + 1] : 0
      const isOccupied = scalars ? occ >= threshold || esdf <= 0 : true

      if (layerFilter === 'occupied' && !isOccupied) continue
      if (layerFilter === 'esdf' && isOccupied) continue

      const posOffset = i * 3
      const x = positions[posOffset]
      const y = positions[posOffset + 1]
      const z = positions[posOffset + 2]

      dummy.position.set(x, y, z)
      dummy.scale.setScalar(resolveVoxelInstanceScale(baseSize, isOccupied, layerFilter))
      dummy.updateMatrix()
      mesh.setMatrixAt(instanceIdx, dummy.matrix)

      applyVoxelInstanceColor(color, {
        index: i,
        z,
        minZ,
        spanZ,
        esdf,
        isOccupied,
        hasScalars,
        truncationDistanceM,
        colorMode,
        colors
      })

      mesh.setColorAt(instanceIdx, color)
      instanceIdx++
    }

    mesh.count = instanceIdx
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
      if (!hadInstanceColor) {
        ;(mesh.material as THREE.Material).needsUpdate = true
      }
    }
  }, [frame, decoded, layerFilter, colorMode, capacity])

  return { meshRef, capacity }
}

/**
 * Hook that builds and disposes the AABB wireframe `EdgesGeometry` for the active voxel bounds.
 */
export function useVoxelAabbWireframe(frame: VoxelGridFrame): {
  center: [number, number, number]
  edgesGeometry: THREE.EdgesGeometry
} {
  const { minBound, maxBound } = frame.bounds
  const sizeX = Math.max(0.02, maxBound.x - minBound.x + frame.voxelSizeM)
  const sizeY = Math.max(0.02, maxBound.y - minBound.y + frame.voxelSizeM)
  const sizeZ = Math.max(0.02, maxBound.z - minBound.z + frame.voxelSizeM)

  const center: [number, number, number] = [
    (minBound.x + maxBound.x) / 2,
    (minBound.y + maxBound.y) / 2,
    (minBound.z + maxBound.z) / 2
  ]

  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [sizeX, sizeY, sizeZ])

  useEffect(() => {
    return () => {
      edgesGeometry.dispose()
    }
  }, [edgesGeometry])

  return { center, edgesGeometry }
}
