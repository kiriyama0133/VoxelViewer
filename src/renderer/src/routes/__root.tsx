import { LicenseBanner } from '@renderer/components/license-banner'
import { TitleBar } from '@renderer/components/title-bar'
import { AppToaster, toaster } from '@renderer/components/ui/toaster'
import { UpdateBanner } from '@renderer/components/update-banner'
import { i18n } from '@renderer/lib/i18n'
import { trpc } from '@renderer/lib/trpc'
import { resolveLanguage } from '@shared/i18n'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useMatches, useNavigate } from '@tanstack/react-router'
import { useSubscription } from '@trpc/tanstack-react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Rendered without the navigation, in its own window (e.g. activation, About) */
    standalone?: boolean
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout
})

function RootLayout() {
  const queryClient = useQueryClient()
  const { data: info } = useQuery(trpc.app.info.queryOptions())
  const standalone = useMatches({
    select: (matches) => matches.some((match) => match.staticData.standalone)
  })

  // Config changed (from the menu or this window): update the cache and the language
  useSubscription(
    trpc.config.onChange.subscriptionOptions(undefined, {
      onData: (config) => {
        queryClient.setQueryData(trpc.config.get.queryKey(), config)
        i18n.changeLanguage(resolveLanguage(config.language, info?.locale ?? 'en'))
      }
    })
  )

  return standalone ? <Outlet /> : <MainLayout />
}

function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: grpcStatus } = useQuery(trpc.grpc.status.queryOptions())
  const notifiedConnectedRef = useRef(false)

  // Navigation requested by the main process (e.g. "Settings…" in the native menu)
  useSubscription(
    trpc.app.onNavigate.subscriptionOptions(undefined, { onData: (to) => navigate({ to }) })
  )

  useSubscription(
    trpc.grpc.onStatusChange.subscriptionOptions(undefined, {
      onData: (nextStatus) => {
        queryClient.setQueryData(trpc.grpc.status.queryKey(), nextStatus)
      }
    })
  )

  useEffect(() => {
    if (!grpcStatus) return
    const isConnected = grpcStatus.state === 'connected' || grpcStatus.state === 'streaming'
    if (!isConnected) {
      notifiedConnectedRef.current = false
      return
    }
    if (grpcStatus.isMock && grpcStatus.state !== 'streaming') {
      // In Mock mode, wait until `mock.bin` point cloud frame is ingested (`streaming`)
      return
    }
    if (notifiedConnectedRef.current) return
    notifiedConnectedRef.current = true

    toaster.create({
      type: 'success',
      duration: 4500,
      title: grpcStatus.isMock ? t('toast.grpcMockConnectedTitle') : t('toast.grpcConnectedTitle'),
      description: grpcStatus.isMock
        ? t('toast.grpcMockConnectedDescription', {
            count: grpcStatus.telemetry.lastVoxelCount,
            occupied: grpcStatus.telemetry.occupiedVoxelCount,
            esdf: grpcStatus.telemetry.esdfVoxelCount
          })
        : t('toast.grpcConnectedDescription', {
            endpoint: grpcStatus.endpoint
          })
    })
  }, [grpcStatus, t])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <TitleBar />
      <LicenseBanner />
      <UpdateBanner />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <AppToaster />
    </div>
  )
}
