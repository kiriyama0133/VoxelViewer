import { app, BrowserWindow } from 'electron'
import { getMainWindow } from '../../window'
import { appEventSubscription, publicProcedure, router } from '../trpc'

function resolveTargetWindow(): BrowserWindow | null {
  return getMainWindow() ?? BrowserWindow.getFocusedWindow?.() ?? null
}

export const appRouter = router({
  info: publicProcedure.query(() => ({
    name: app.getName(),
    version: app.getVersion(),
    locale: app.getLocale(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }
  })),

  onNavigate: appEventSubscription('navigate'),

  windowState: publicProcedure.query(() => ({
    isMaximized: resolveTargetWindow()?.isMaximized() ?? false
  })),

  onWindowMaximizedChange: appEventSubscription('windowMaximizedChanged'),

  minimizeWindow: publicProcedure.mutation(() => {
    resolveTargetWindow()?.minimize()
  }),

  toggleMaximizeWindow: publicProcedure.mutation(() => {
    const window = resolveTargetWindow()
    if (!window) return { isMaximized: false }
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return { isMaximized: window.isMaximized() }
  }),

  closeWindow: publicProcedure.mutation(() => {
    resolveTargetWindow()?.close()
  })
})
