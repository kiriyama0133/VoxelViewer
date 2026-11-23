import {
  defaultGrpcConfig,
  defaultVoxelConfig,
  grpcConfigSchema,
  languageSettingSchema,
  themeSchema,
  voxelConfigSchema
} from '@shared/config'
import { appEventSubscription, publicProcedure, router } from '../trpc'

export const configRouter = router({
  get: publicProcedure.query(({ ctx }) => ctx.config.getAll()),

  setTheme: publicProcedure.input(themeSchema).mutation(({ ctx, input }) => {
    ctx.config.set('theme', input)
  }),

  setLanguage: publicProcedure.input(languageSettingSchema).mutation(({ ctx, input }) => {
    ctx.config.set('language', input)
  }),

  setGrpc: publicProcedure.input(grpcConfigSchema.partial()).mutation(({ ctx, input }) => {
    const current = ctx.config.get('grpc')
    const next = grpcConfigSchema.parse({ ...current, ...input })
    ctx.config.set('grpc', next)
    return next
  }),

  resetGrpc: publicProcedure.mutation(({ ctx }) => {
    ctx.config.set('grpc', defaultGrpcConfig)
    return defaultGrpcConfig
  }),

  setVoxel: publicProcedure.input(voxelConfigSchema.partial()).mutation(({ ctx, input }) => {
    const current = ctx.config.get('voxel')
    const next = voxelConfigSchema.parse({ ...current, ...input })
    ctx.config.set('voxel', next)
    return next
  }),

  resetVoxel: publicProcedure.mutation(({ ctx }) => {
    ctx.config.set('voxel', defaultVoxelConfig)
    return defaultVoxelConfig
  }),

  /** Emits the whole config every time it changes, wherever the change comes from. */
  onChange: appEventSubscription('configChanged')
})
