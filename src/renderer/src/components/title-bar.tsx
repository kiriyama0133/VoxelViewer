import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { trpc } from '@renderer/lib/trpc'
import type { Theme } from '@shared/config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useSubscription } from '@trpc/tanstack-react-query'
import {
  ActivityIcon,
  BoxIcon,
  CopyIcon,
  HouseIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  RadioIcon,
  SettingsIcon,
  SquareIcon,
  SunIcon,
  XIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

const themeOrder: Theme[] = ['system', 'light', 'dark']

/**
 * Custom frameless window top status & title bar.
 * Provides drag region, brand identity, route navigation, live engine/gRPC status pills,
 * theme switcher, and native-like window control buttons via tRPC.
 */
export function TitleBar() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: info } = useQuery(trpc.app.info.queryOptions())
  const { data: config } = useQuery(trpc.config.get.queryOptions())
  const { data: windowState } = useQuery(trpc.app.windowState.queryOptions())
  const { data: grpcStatus } = useQuery(trpc.grpc.status.queryOptions())

  const isMac = info?.platform === 'darwin'
  const isMaximized = windowState?.isMaximized ?? false
  const currentTheme: Theme = config?.theme ?? 'system'
  const grpcEndpoint =
    grpcStatus?.endpoint ??
    (config?.grpc ? `${config.grpc.host}:${config.grpc.port}` : '127.0.0.1:50051')
  const isGrpcConnected = grpcStatus?.state === 'connected' || grpcStatus?.state === 'streaming'

  useSubscription(
    trpc.app.onWindowMaximizedChange.subscriptionOptions(undefined, {
      onData: (nextMaximized) => {
        queryClient.setQueryData(trpc.app.windowState.queryKey(), {
          isMaximized: nextMaximized
        })
      }
    })
  )

  useSubscription(
    trpc.grpc.onStatusChange.subscriptionOptions(undefined, {
      onData: (nextStatus) => {
        queryClient.setQueryData(trpc.grpc.status.queryKey(), nextStatus)
      }
    })
  )

  const setTheme = useMutation(trpc.config.setTheme.mutationOptions())
  const connectGrpc = useMutation(trpc.grpc.connect.mutationOptions())
  const disconnectGrpc = useMutation(trpc.grpc.disconnect.mutationOptions())
  const minimizeWindow = useMutation(trpc.app.minimizeWindow.mutationOptions())
  const toggleMaximizeWindow = useMutation(
    trpc.app.toggleMaximizeWindow.mutationOptions({
      onSuccess: (next) => {
        queryClient.setQueryData(trpc.app.windowState.queryKey(), next)
      }
    })
  )
  const closeWindow = useMutation(trpc.app.closeWindow.mutationOptions())

  const cycleTheme = () => {
    const nextIndex = (themeOrder.indexOf(currentTheme) + 1) % themeOrder.length
    setTheme.mutate(themeOrder[nextIndex])
  }

  const ThemeIcon =
    currentTheme === 'dark' ? MoonIcon : currentTheme === 'light' ? SunIcon : MonitorIcon

  return (
    <header
      data-slot="title-bar"
      className="app-drag-region flex h-10 shrink-0 select-none items-center justify-between border-b bg-card/80 backdrop-blur-md"
    >
      {/* Left: App Brand + Navigation */}
      <div className={`flex items-center gap-3 px-3 ${isMac ? 'pl-20' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
            <BoxIcon className="size-3.5" />
          </div>
          <span className="font-semibold text-xs tracking-tight">{t('appName')}</span>
          {info?.version && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{info.version}
            </span>
          )}
        </div>

        <Separator orientation="vertical" className="h-4" />

        <nav className="app-no-drag flex items-center gap-1">
          <Link
            to="/"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-secondary [&.active]:font-medium [&.active]:text-foreground"
          >
            <HouseIcon className="size-3.5" />
            <span>{t('nav.home')}</span>
          </Link>
          <Link
            to="/settings"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-secondary [&.active]:font-medium [&.active]:text-foreground"
          >
            <SettingsIcon className="size-3.5" />
            <span>{t('nav.settings')}</span>
          </Link>
        </nav>
      </div>

      {/* Right: Status Indicators + Quick Actions + Window Controls */}
      <div className="flex h-full items-center">
        <div className="hidden items-center gap-2 px-3 sm:flex">
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <ActivityIcon className="size-3 text-emerald-500" />
            <span>{t('statusBar.ready')}</span>
          </div>
          <button
            type="button"
            onClick={() => (isGrpcConnected ? disconnectGrpc.mutate() : connectGrpc.mutate())}
            className="app-no-drag inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RadioIcon
              className={`size-3 ${isGrpcConnected ? 'text-emerald-500' : 'text-sky-500'}`}
            />
            <span>{t('statusBar.grpcIdle', { endpoint: grpcEndpoint })}</span>
          </button>
        </div>

        <div className="app-no-drag flex h-full items-center px-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={cycleTheme}
            aria-label={t('statusBar.toggleTheme', { theme: t(`theme.${currentTheme}`) })}
            title={t('statusBar.toggleTheme', { theme: t(`theme.${currentTheme}`) })}
          >
            <ThemeIcon className="size-3.5" />
          </Button>
        </div>

        {!isMac && (
          <div className="app-no-drag flex h-full items-center pl-1">
            <Separator orientation="vertical" className="mr-1 h-4 self-center" />
            <button
              type="button"
              onClick={() => minimizeWindow.mutate()}
              aria-label={t('window.minimize')}
              title={t('window.minimize')}
              className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
            >
              <MinusIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleMaximizeWindow.mutate()}
              aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
              title={isMaximized ? t('window.restore') : t('window.maximize')}
              className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
            >
              {isMaximized ? (
                <CopyIcon className="size-3.5" />
              ) : (
                <SquareIcon className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => closeWindow.mutate()}
              aria-label={t('window.close')}
              title={t('window.close')}
              className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
