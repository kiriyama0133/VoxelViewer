import { z } from 'zod'
import {
  decodeOccupancyEsdfScalars,
  decodeQuantizedUint16Positions,
  decodeRawFloat32Positions,
  esdfDistanceToRgb,
  type HandshakeResponse,
  POINT_RGBXYZ_BYTE_STRIDE,
  type PointRgbXyz,
  payloadCompressionSchema,
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
  type VoxelEncoding,
  type VoxelGridFrame,
  type VoxelMapCell,
  type VoxelMapHeader,
  type VoxelStreamRequest,
  voxelEncodingSchema,
  voxelStreamRequestSchema
} from './proto'

/**
 * Shared gRPC connection state, telemetry models, and request/response schemas
 * used between `src/main/hooks/grpc.ts`, `src/main/trpc/routers/grpc.ts`, and the renderer.
 */

export const grpcConnectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'streaming',
  'reconnecting',
  'error'
])
export type GrpcConnectionState = z.infer<typeof grpcConnectionStateSchema>

export interface GrpcTelemetry {
  receivedVoxelFrames: number
  lastVoxelCount: number
  occupiedVoxelCount: number
  esdfVoxelCount: number
  lastFrameTimestampNs: bigint | null
  latencyMs: number | null
}

export interface GrpcConnectionStatus {
  state: GrpcConnectionState
  isMock: boolean
  endpoint: string
  host: string
  port: number
  useTls: boolean
  connectedAtUnixMs: number | null
  lastError: string | null
  serverInfo: Pick<HandshakeResponse, 'serverName' | 'serverVersion'> | null
  telemetry: GrpcTelemetry
}

export {
  decodeOccupancyEsdfScalars,
  decodeQuantizedUint16Positions,
  decodeRawFloat32Positions,
  esdfDistanceToRgb,
  type HandshakeResponse,
  POINT_RGBXYZ_BYTE_STRIDE,
  type PointRgbXyz,
  payloadCompressionSchema,
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
  type VoxelEncoding,
  type VoxelGridFrame,
  type VoxelMapCell,
  type VoxelMapHeader,
  type VoxelStreamRequest,
  voxelEncodingSchema,
  voxelStreamRequestSchema
}
