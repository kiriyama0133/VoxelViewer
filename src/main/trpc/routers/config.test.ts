import { defaultGrpcConfig, defaultVoxelConfig } from '@shared/config'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestContext } from '../../test/context'
import { configRouter } from './config'

describe('config router', () => {
  let caller: ReturnType<typeof configRouter.createCaller>

  beforeEach(async () => {
    caller = configRouter.createCaller(createTestContext())
    await caller.resetGrpc()
    await caller.resetVoxel()
  })

  it('updates and resets gRPC settings', async () => {
    const updated = await caller.setGrpc({
      host: '172.20.10.2',
      port: 50060,
      autoConnect: false,
      compression: 'gzip',
      maxReceiveMessageMb: 128
    })

    expect(updated).toMatchObject({
      host: '172.20.10.2',
      port: 50060,
      autoConnect: false,
      compression: 'gzip',
      maxReceiveMessageMb: 128
    })

    const reset = await caller.resetGrpc()
    expect(reset).toEqual(defaultGrpcConfig)
  })

  it('rejects out-of-range gRPC port values', async () => {
    await expect(caller.setGrpc({ port: 70000 })).rejects.toThrow()
    await expect(caller.setGrpc({ port: 0 })).rejects.toThrow()
  })

  it('updates and resets voxel display settings', async () => {
    const updated = await caller.setVoxel({
      defaultVoxelSizeMm: 10,
      maxVoxelCount: 1000000,
      targetFps: '120',
      colorMode: 'heightZ',
      showGrid: false
    })

    expect(updated).toMatchObject({
      defaultVoxelSizeMm: 10,
      maxVoxelCount: 1000000,
      targetFps: '120',
      colorMode: 'heightZ',
      showGrid: false
    })

    const reset = await caller.resetVoxel()
    expect(reset).toEqual(defaultVoxelConfig)
  })
})
