import { z } from 'zod'

// App config schema, shared by the main process (storage) and the renderer (types).
// Every key must have a default: it is used on first launch and when a stored value is invalid.

export const themeSchema = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof themeSchema>

export const languages = ['en', 'fr', 'zh'] as const
export type Language = (typeof languages)[number]

export const languageSettingSchema = z.enum(['system', ...languages])
export type LanguageSetting = z.infer<typeof languageSettingSchema>

export const grpcCompressionSchema = z.enum(['none', 'gzip', 'zstd'])
export type GrpcCompression = z.infer<typeof grpcCompressionSchema>

export const voxelColorModeSchema = z.enum(['rgb', 'heightZ', 'confidence', 'semantic'])
export type VoxelColorMode = z.infer<typeof voxelColorModeSchema>

export const targetFpsSchema = z.enum(['30', '60', '120'])
export type TargetFps = z.infer<typeof targetFpsSchema>

export const grpcConfigSchema = z.object({
  host: z.string().trim().min(1).default('172.20.10.2'),
  port: z.number().int().min(1).max(65535).default(50051),
  autoConnect: z.boolean().default(true),
  reconnectIntervalMs: z.number().int().min(200).max(60000).default(2000),
  requestTimeoutMs: z.number().int().min(200).max(60000).default(5000),
  maxReceiveMessageMb: z.number().int().min(4).max(512).default(64),
  compression: grpcCompressionSchema.default('zstd'),
  useTls: z.boolean().default(false)
})
export type GrpcConfig = z.infer<typeof grpcConfigSchema>

export const defaultGrpcConfig: GrpcConfig = grpcConfigSchema.parse({})

export const voxelConfigSchema = z.object({
  defaultVoxelSizeMm: z.number().min(1).max(200).default(5),
  maxVoxelCount: z.number().int().min(10000).max(5000000).default(500000),
  targetFps: targetFpsSchema.default('60'),
  colorMode: voxelColorModeSchema.default('rgb'),
  showGrid: z.boolean().default(true),
  showAxes: z.boolean().default(true),
  showBoundingBox: z.boolean().default(true)
})
export type VoxelConfig = z.infer<typeof voxelConfigSchema>

export const defaultVoxelConfig: VoxelConfig = voxelConfigSchema.parse({})

export const windowBoundsSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(400),
  height: z.number().min(300),
  maximized: z.boolean().default(false)
})

export const configSchema = z.object({
  theme: themeSchema.default('system'),
  language: languageSettingSchema.default('system'),
  grpc: grpcConfigSchema.default(defaultGrpcConfig),
  voxel: voxelConfigSchema.default(defaultVoxelConfig),
  windowBounds: windowBoundsSchema.default({ width: 1000, height: 700, maximized: false })
})
export type Config = z.infer<typeof configSchema>
