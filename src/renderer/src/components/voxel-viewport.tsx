import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Button } from '@renderer/components/ui/button'
import {
  DEFAULT_CAMERA_POS,
  DEFAULT_CAMERA_TARGET,
  type DecodedVoxelFrame,
  useDecodedVoxelFrame,
  useVoxelAabbWireframe,
  useVoxelCameraControls,
  useVoxelInstancedMesh,
  type VoxelLayerFilter
} from '@renderer/hooks'
import type { VoxelColorMode, VoxelConfig } from '@shared/config'
import type { VoxelGridFrame } from '@shared/grpc'
import { BoxIcon, DatabaseIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export type { VoxelLayerFilter }

export interface VoxelViewportProps {
  frame: VoxelGridFrame | null
  voxelConfig: VoxelConfig
  endpoint: string
  isMock: boolean
  onLoadMockVoxelMap?: () => void
  isLoadingMock?: boolean
}

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
  const { controlsRef, resetCamera } = useVoxelCameraControls(frame)
  const decoded = useDecodedVoxelFrame(frame, voxelConfig.defaultVoxelSizeMm)

  const totalCount = decoded?.totalCount ?? 0
  const occupiedCount = decoded?.occupiedCount ?? 0
  const esdfCount = decoded?.esdfCount ?? 0
  const voxelSizeMm = decoded?.voxelSizeMm ?? voxelConfig.defaultVoxelSizeMm
  const maxEsdfCm = decoded?.maxEsdfCm ?? 24

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
            decoded={decoded}
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
  decoded,
  layerFilter,
  colorMode,
  maxVoxels
}: {
  frame: VoxelGridFrame
  decoded: DecodedVoxelFrame
  layerFilter: VoxelLayerFilter
  colorMode: VoxelColorMode
  maxVoxels: number
}) {
  const { meshRef, capacity } = useVoxelInstancedMesh({
    frame,
    decoded,
    layerFilter,
    colorMode,
    maxVoxels
  })

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
  const { center, edgesGeometry } = useVoxelAabbWireframe(frame)

  return (
    <lineSegments position={center} geometry={edgesGeometry}>
      <lineBasicMaterial color="#64748b" transparent opacity={0.45} />
    </lineSegments>
  )
}
