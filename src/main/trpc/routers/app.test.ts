import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext } from '../../test/context'
import { getMainWindow } from '../../window'
import { appRouter } from './app'

vi.mock('../../window', () => ({
  getMainWindow: vi.fn(() => null)
}))

describe('app router window controls', () => {
  let caller: ReturnType<typeof appRouter.createCaller>
  let maximized = false
  const mockWindow = {
    isMaximized: vi.fn(() => maximized),
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      maximized = true
    }),
    unmaximize: vi.fn(() => {
      maximized = false
    }),
    close: vi.fn()
  }

  beforeEach(() => {
    maximized = false
    vi.clearAllMocks()
    vi.mocked(getMainWindow).mockReturnValue(mockWindow as unknown as BrowserWindow)
    caller = appRouter.createCaller(createTestContext())
  })

  it('returns the current window maximized state', async () => {
    expect(await caller.windowState()).toEqual({ isMaximized: false })
    maximized = true
    expect(await caller.windowState()).toEqual({ isMaximized: true })
  })

  it('minimizes the main window', async () => {
    await caller.minimizeWindow()
    expect(mockWindow.minimize).toHaveBeenCalledTimes(1)
  })

  it('toggles maximize and unmaximize on the main window', async () => {
    const first = await caller.toggleMaximizeWindow()
    expect(mockWindow.maximize).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ isMaximized: true })

    const second = await caller.toggleMaximizeWindow()
    expect(mockWindow.unmaximize).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ isMaximized: false })
  })

  it('closes the main window', async () => {
    await caller.closeWindow()
    expect(mockWindow.close).toHaveBeenCalledTimes(1)
  })
})
