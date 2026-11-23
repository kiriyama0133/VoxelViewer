import { EventEmitter } from 'node:events'
import type { Config } from '@shared/config'
import type { GrpcConnectionStatus, VoxelGridFrame } from '@shared/grpc'
import type { LicenseInfo } from '@shared/license'
import type { UpdateStatus } from '@shared/updater'

export type AppEvents = {
  /** Asks the renderer to navigate to a route, e.g. from the native menu. */
  navigate: [to: string]
  configChanged: [config: Config]
  updateStatus: [status: UpdateStatus]
  licenseChanged: [info: LicenseInfo]
  /** Emitted when the main window is maximized or unmaximized. */
  windowMaximizedChanged: [isMaximized: boolean]
  /** Emitted when the gRPC connection state or telemetry changes. */
  grpcStatusChanged: [status: GrpcConnectionStatus]
  /** Emitted when a new 3D voxel grid frame arrives over the gRPC stream. */
  grpcVoxelFrame: [frame: VoxelGridFrame]
}

/** Main process events, forwarded to the renderer with tRPC subscriptions. */
export const appEvents = new EventEmitter<AppEvents>()
