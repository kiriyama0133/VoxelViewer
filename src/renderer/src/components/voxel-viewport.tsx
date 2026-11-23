import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Button } from '@renderer/components/ui/button'
import type { VoxelColorMode, VoxelConfig } from '@shared/config'
import {
  decodeOccupancyEsdfScalars,
  decodeQuantizedUint16Positions,
  decodeRawFloat32Positions,
  esdfDistanceToRgb,
  type VoxelGridFrame
} from '@shared/grpc'
import { BoxIcon, DatabaseIcon, RotateCcwIcon } from 'lucide-react'
import { type ComponentRef, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'

export type VoxelLayerFilter = 'all' | 'occupied' | 'esdf'

export interface VoxelViewportProps {
  frame: VoxelGridFrame | null
  voxelConfig: VoxelConfig
  endpoint: string
  isMock: boolean
  onLoadMockVoxelMap?: () => void
  isLoadingMock?: boolean
}

const DEFAULT_CAMERA_POS: [number, number, number] = [0.68, -0.68, 0.52]
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0.18]

export function VoxelViewport({
  frame,
  voxelConfig,
  endpoint,
  isMock,
  onLoadMockVoxelMap,
  isLoadingMock = false
}: VoxelViewportProps) {
  const { t } = useTranslation()
  const [layerFilter, setLayerFilter] = useState<VoxelLayerFilter>('all')
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null)

  const decoded = useMemo(() => {
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

    return {
      positions,
      colors: frame.colorsBuffer,
      scalars,
      occupiedCount,
      esdfCount,
      threshold,
      truncationDistanceM: frame.truncationDistanceM ?? 0.24
    }
  }, [frame])

  const resetCamera = () => {
    const controls = controlsRef.current
    if (!controls) return
    controls.object.position.set(...DEFAULT_CAMERA_POS)
    controls.target.set(...DEFAULT_CAMERA_TARGET)
    controls.update()
  }

  const totalCount = frame?.voxelCount ?? 0
  const occupiedCount = decoded?.occupiedCount ?? 0
  const esdfCount = decoded?.esdfCount ?? 0
  const voxelSizeMm = frame
    ? Math.round(frame.voxelSizeM * 1000 * 10) / 10
    : voxelConfig.defaultVoxelSizeMm
  const maxEsdfCm = Math.round((decoded?.truncationDistanceM ?? 0.24) * 100)

  return (
    <section
      id="voxel-canvas-mount"
      data-slot="voxel-viewport"
      aria-label={t('workspace.viewportLabel')}
      className="relative flex flex-1 overflow-hidden rounded-lg border bg-card/40"
    >
      {/* 3D WebGL Canvas (Z-up Robotics Coordinate System) */}
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: DEFAULT_CAMERA_POS,
          up: [0, 0, 1],
          fov: 45,
          near: 0.01,
          far: 50
        }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[1.5, -1.2, 2.5]} intensity={1.1} />
        <directionalLight position={[-1.2, 1.5, 1.0]} intensity={0.45} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={DEFAULT_CAMERA_TARGET}
          minDistance={0.1}
          maxDistance={12}
          enableDamping
          dampingFactor={0.08}
        />

        {voxelConfig.showGrid && (
          <gridHelper
            args={[1.2, 24, '#64748b', '#334155']}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
          />
        )}

        {voxelConfig.showAxes && <axesHelper args={[0.22]} />}

        {voxelConfig.showBoundingBox && frame && totalCount > 0 && (
          <WorkspaceAabbWireframe frame={frame} />
        )}

        {frame && decoded && (
          <InstancedVoxelCloud
            frame={frame}
            positions={decoded.positions}
            colors={decoded.colors}
            scalars={decoded.scalars}
            threshold={decoded.threshold}
            truncationDistanceM={decoded.truncationDistanceM}
            layerFilter={layerFilter}
            colorMode={voxelConfig.colorMode}
            maxVoxels={voxelConfig.maxVoxelCount}
          />
        )}

        {voxelConfig.showAxes && (
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#ffffff" />
          </GizmoHelper>
        )}
      </Canvas>

      {/* Top-Left Telemetry Overlay */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background/85 px-2.5 py-1.5 font-mono text-xs shadow-xs backdrop-blur-md">
          <BoxIcon className="size-3.5 text-primary" />
          <span className="text-muted-foreground">{t('workspace.telemetry.voxels')}:</span>
          <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{t('workspace.telemetry.voxelSize')}:</span>
          <span className="font-semibold text-foreground">{voxelSizeMm} mm</span>
          {frame && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{t('workspace.telemetry.frame')}:</span>
              <span className="text-foreground">{frame.coordinateFrame}</span>
            </>
          )}
        </div>
      </div>

      {/* Top-Right Layer Filter & Controls Toolbar */}
      <div className="absolute top-3 right-3 flex flex-wrap items-center gap-1.5">
        {decoded?.scalars && (
          <div className="flex items-center rounded-md border bg-background/85 p-0.5 shadow-xs backdrop-blur-md">
            {(['all', 'occupied', 'esdf'] as const).map((mode) => {
              const count =
                mode === 'all' ? totalCount : mode === 'occupied' ? occupiedCount : esdfCount
              const active = layerFilter === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayerFilter(mode)}
                  className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(`workspace.filter.${mode}`, { count })}
                </button>
              )
            })}
          </div>
        )}

        {onLoadMockVoxelMap && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isLoadingMock}
            onClick={onLoadMockVoxelMap}
            className="bg-background/85 backdrop-blur-md"
          >
            <DatabaseIcon className="size-3" />
            {t('workspace.loadMockMap')}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={resetCamera}
          className="bg-background/85 backdrop-blur-md"
        >
          <RotateCcwIcon className="size-3" />
          {t('workspace.resetCamera')}
        </Button>
      </div>

      {/* Bottom-Left ESDF Collision Distance Colormap Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-background/85 px-3 py-2 shadow-xs backdrop-blur-md">
        <div className="mb-1 flex items-center justify-between gap-6 text-[11px]">
          <span className="font-medium text-foreground">{t('workspace.legend.title')}</span>
          <span className="font-mono text-muted-foreground">
            {isMock ? 'voxel_map.bin (Occupancy + ESDF)' : endpoint}
          </span>
        </div>
        <div
          className="h-2 w-56 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, rgb(239,68,68) 0%, rgb(249,115,22) 25%, rgb(234,179,8) 50%, rgb(34,197,94) 75%, rgb(14,165,233) 100%)'
          }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{t('workspace.legend.collision')}</span>
          <span>{t('workspace.legend.safe', { max: maxEsdfCm })}</span>
        </div>
      </div>

      {/* Center Empty State Overlay when no voxel frame is loaded yet */}
      {totalCount === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/70">
          <BoxIcon className="size-10 stroke-[1.25]" />
          <span className="font-medium text-xs tracking-wide">
            {t('workspace.viewportPlaceholder')}
          </span>
        </div>
      )}
    </section>
  )
}

function InstancedVoxelCloud({
  frame,
  positions,
  colors,
  scalars,
  threshold,
  truncationDistanceM,
  layerFilter,
  colorMode,
  maxVoxels
}: {
  frame: VoxelGridFrame
  positions: Float32Array
  colors: Uint8Array
  scalars: Float32Array | null
  threshold: number
  truncationDistanceM: number
  layerFilter: VoxelLayerFilter
  colorMode: VoxelColorMode
  maxVoxels: number
}) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const capacity = Math.max(1, Math.min(frame.voxelCount, maxVoxels))

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const hadInstanceColor = mesh.instanceColor !== null

    const limit = Math.min(frame.voxelCount, capacity)
    const minZ = frame.bounds.minBound.z
    const spanZ = Math.max(1e-4, frame.bounds.maxBound.z - minZ)
    const baseSize = frame.voxelSizeM > 0 ? frame.voxelSizeM : 0.02

    let instanceIdx = 0

    for (let i = 0; i < limit; i++) {
      const occ = scalars ? scalars[i * 2] : 1
      const esdf = scalars ? scalars[i * 2 + 1] : 0
      const isOccupied = scalars ? occ >= threshold || esdf <= 0 : true

      if (layerFilter === 'occupied' && !isOccupied) continue
      if (layerFilter === 'esdf' && isOccupied) continue

      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]

      // Occupied voxels render as full cubes; outer ESDF distance-field voxels render as compact markers
      const scale = isOccupied
        ? baseSize * 0.92
        : layerFilter === 'esdf'
          ? baseSize * 0.68
          : baseSize * 0.36

      dummy.position.set(x, y, z)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(instanceIdx, dummy.matrix)

      if (colorMode === 'heightZ') {
        const tz = Math.min(1, Math.max(0, (z - minZ) / spanZ))
        const mapped = esdfDistanceToRgb(tz * truncationDistanceM, truncationDistanceM)
        color.setRGB(mapped.r / 255, mapped.g / 255, mapped.b / 255)
      } else if (colorMode === 'confidence' && scalars) {
        const mapped = esdfDistanceToRgb(esdf, truncationDistanceM)
        color.setRGB(mapped.r / 255, mapped.g / 255, mapped.b / 255)
      } else if (colorMode === 'semantic' && scalars) {
        if (isOccupied) {
          color.setRGB(239 / 255, 68 / 255, 68 / 255)
        } else if (esdf <= 0.06) {
          color.setRGB(249 / 255, 115 / 255, 22 / 255)
        } else {
          color.setRGB(14 / 255, 165 / 255, 233 / 255)
        }
      } else {
        const r = colors[i * 4] ?? 200
        const g = colors[i * 4 + 1] ?? 200
        const b = colors[i * 4 + 2] ?? 200
        color.setRGB(r / 255, g / 255, b / 255)
      }

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
  }, [
    frame,
    positions,
    colors,
    scalars,
    threshold,
    truncationDistanceM,
    layerFilter,
    colorMode,
    capacity
  ])

  return (
    <instancedMesh
      key={capacity}
      ref={meshRef}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0.08} />
    </instancedMesh>
  )
}

function WorkspaceAabbWireframe({ frame }: { frame: VoxelGridFrame }) {
  const { minBound, maxBound } = frame.bounds
  const sizeX = Math.max(0.02, maxBound.x - minBound.x + frame.voxelSizeM)
  const sizeY = Math.max(0.02, maxBound.y - minBound.y + frame.voxelSizeM)
  const sizeZ = Math.max(0.02, maxBound.z - minBound.z + frame.voxelSizeM)

  const centerX = (minBound.x + maxBound.x) / 2
  const centerY = (minBound.y + maxBound.y) / 2
  const centerZ = (minBound.z + maxBound.z) / 2

  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [sizeX, sizeY, sizeZ])

  return (
    <lineSegments position={[centerX, centerY, centerZ]} geometry={edgesGeometry}>
      <lineBasicMaterial color="#64748b" transparent opacity={0.45} />
    </lineSegments>
  )
}
