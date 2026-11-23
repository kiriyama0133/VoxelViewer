import { grpcConfigSchema } from '@shared/config'
import { voxelStreamRequestSchema } from '@shared/grpc'
import {
  connectGrpc,
  disconnectGrpc,
  getGrpcStatus,
  getLatestVoxelFrame,
  loadMockVoxelMapFrame,
  startGrpcStream,
  stopGrpcStream
} from '../../hooks'
import { appEventSubscription, publicProcedure, router } from '../trpc'

export const grpcRouter = router({
  status: publicProcedure.query(() => getGrpcStatus()),

  onStatusChange: appEventSubscription('grpcStatusChanged'),

  latestVoxelFrame: publicProcedure.query(() => getLatestVoxelFrame()),

  onVoxelFrame: appEventSubscription('grpcVoxelFrame'),

  connect: publicProcedure
    .input(grpcConfigSchema.partial().optional())
    .mutation(({ input }) => connectGrpc(input)),

  disconnect: publicProcedure.mutation(() => disconnectGrpc()),

  startStream: publicProcedure
    .input(voxelStreamRequestSchema.partial().optional())
    .mutation(({ input }) => startGrpcStream(input)),

  stopStream: publicProcedure.mutation(() => stopGrpcStream()),

  loadMockVoxelMap: publicProcedure.mutation(() => loadMockVoxelMapFrame())
})
