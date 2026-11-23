import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import { trpc } from '@renderer/lib/trpc'
import {
  type GrpcConfig,
  grpcCompressionSchema,
  languageSettingSchema,
  targetFpsSchema,
  themeSchema,
  type VoxelConfig,
  voxelColorModeSchema
} from '@shared/config'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CheckIcon, RotateCcwIcon } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/settings')({
  component: Settings
})

function Settings() {
  const { t } = useTranslation()
  const { data: config } = useSuspenseQuery(trpc.config.get.queryOptions())
  const { data: info } = useSuspenseQuery(trpc.app.info.queryOptions())

  // Local draft state for numeric/text inputs so typing is smooth and validated on save
  const [grpcDraft, setGrpcDraft] = useState<GrpcConfig>(config.grpc)
  const [voxelDraft, setVoxelDraft] = useState<VoxelConfig>(config.voxel)
  const [grpcSaved, setGrpcSaved] = useState(false)
  const [voxelSaved, setVoxelSaved] = useState(false)

  useEffect(() => {
    setGrpcDraft(config.grpc)
  }, [config.grpc])

  useEffect(() => {
    setVoxelDraft(config.voxel)
  }, [config.voxel])

  // No need to manually update the cache on success: the main process emits `config.onChange`
  const setTheme = useMutation(trpc.config.setTheme.mutationOptions())
  const setLanguage = useMutation(trpc.config.setLanguage.mutationOptions())
  const setGrpc = useMutation(
    trpc.config.setGrpc.mutationOptions({
      onSuccess: () => {
        setGrpcSaved(true)
        setTimeout(() => setGrpcSaved(false), 1800)
      }
    })
  )
  const resetGrpc = useMutation(trpc.config.resetGrpc.mutationOptions())
  const setVoxel = useMutation(
    trpc.config.setVoxel.mutationOptions({
      onSuccess: () => {
        setVoxelSaved(true)
        setTimeout(() => setVoxelSaved(false), 1800)
      }
    })
  )
  const resetVoxel = useMutation(trpc.config.resetVoxel.mutationOptions())

  const onSaveGrpc = (event: FormEvent) => {
    event.preventDefault()
    setGrpc.mutate(grpcDraft)
  }

  const onSaveVoxel = (event: FormEvent) => {
    event.preventDefault()
    setVoxel.mutate(voxelDraft)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6 pb-8">
        {/* 1. gRPC Communication Configuration */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t('settings.grpc.title')}</CardTitle>
              <CardDescription>{t('settings.grpc.description')}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => resetGrpc.mutate()}
              disabled={resetGrpc.isPending}
            >
              <RotateCcwIcon className="size-3.5" />
              {t('settings.reset')}
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveGrpc} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="grpc-host">{t('settings.grpc.host')}</Label>
                  <Input
                    id="grpc-host"
                    value={grpcDraft.host}
                    placeholder={t('settings.grpc.hostPlaceholder')}
                    isInvalid={(val) => !val.trim()}
                    errorText={t('validation.invalidHost')}
                    onChange={(event) =>
                      setGrpcDraft((prev) => ({ ...prev, host: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grpc-port">{t('settings.grpc.port')}</Label>
                  <Input
                    id="grpc-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={grpcDraft.port}
                    placeholder={t('settings.grpc.portPlaceholder')}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return !Number.isInteger(n) || n < 1 || n > 65535
                    }}
                    errorText={t('validation.invalidPort')}
                    onChange={(event) =>
                      setGrpcDraft((prev) => ({
                        ...prev,
                        port: Number(event.target.value)
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="grpc-compression">{t('settings.grpc.compression')}</Label>
                  <Select
                    value={grpcDraft.compression}
                    onValueChange={(value) =>
                      setGrpcDraft((prev) => ({
                        ...prev,
                        compression: grpcCompressionSchema.parse(value)
                      }))
                    }
                  >
                    <SelectTrigger id="grpc-compression" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {grpcCompressionSchema.options.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t(`settings.grpc.compressionOptions.${mode}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grpc-max-mb">{t('settings.grpc.maxReceiveMessageMb')}</Label>
                  <Input
                    id="grpc-max-mb"
                    type="number"
                    min={4}
                    max={512}
                    value={grpcDraft.maxReceiveMessageMb}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return Number.isNaN(n) || n < 4 || n > 512
                    }}
                    errorText={t('validation.outOfRange', { min: 4, max: 512 })}
                    onChange={(event) =>
                      setGrpcDraft((prev) => ({
                        ...prev,
                        maxReceiveMessageMb: Number(event.target.value)
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="grpc-timeout">{t('settings.grpc.requestTimeoutMs')}</Label>
                  <Input
                    id="grpc-timeout"
                    type="number"
                    min={200}
                    max={60000}
                    step={100}
                    value={grpcDraft.requestTimeoutMs}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return Number.isNaN(n) || n < 200 || n > 60000
                    }}
                    errorText={t('validation.outOfRange', { min: 200, max: 60000 })}
                    onChange={(event) =>
                      setGrpcDraft((prev) => ({
                        ...prev,
                        requestTimeoutMs: Number(event.target.value)
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grpc-reconnect">{t('settings.grpc.reconnectIntervalMs')}</Label>
                  <Input
                    id="grpc-reconnect"
                    type="number"
                    min={200}
                    max={60000}
                    step={100}
                    value={grpcDraft.reconnectIntervalMs}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return Number.isNaN(n) || n < 200 || n > 60000
                    }}
                    errorText={t('validation.outOfRange', { min: 200, max: 60000 })}
                    onChange={(event) =>
                      setGrpcDraft((prev) => ({
                        ...prev,
                        reconnectIntervalMs: Number(event.target.value)
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="grpc-autoconnect"
                      checked={grpcDraft.autoConnect}
                      onCheckedChange={(checked) =>
                        setGrpcDraft((prev) => ({ ...prev, autoConnect: checked === true }))
                      }
                    />
                    <Label htmlFor="grpc-autoconnect" className="font-normal">
                      {t('settings.grpc.autoConnect')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="grpc-tls"
                      checked={grpcDraft.useTls}
                      onCheckedChange={(checked) =>
                        setGrpcDraft((prev) => ({ ...prev, useTls: checked === true }))
                      }
                    />
                    <Label htmlFor="grpc-tls" className="font-normal">
                      {t('settings.grpc.useTls')}
                    </Label>
                  </div>
                </div>

                <Button type="submit" size="sm" disabled={setGrpc.isPending}>
                  {grpcSaved && <CheckIcon className="size-3.5" />}
                  {grpcSaved ? t('settings.saved') : t('settings.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 2. Voxel & 3D Viewport Rendering Configuration */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t('settings.voxel.title')}</CardTitle>
              <CardDescription>{t('settings.voxel.description')}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => resetVoxel.mutate()}
              disabled={resetVoxel.isPending}
            >
              <RotateCcwIcon className="size-3.5" />
              {t('settings.reset')}
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveVoxel} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voxel-size">{t('settings.voxel.defaultVoxelSizeMm')}</Label>
                  <Input
                    id="voxel-size"
                    type="number"
                    min={1}
                    max={200}
                    step={0.5}
                    value={voxelDraft.defaultVoxelSizeMm}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return Number.isNaN(n) || n < 1 || n > 200
                    }}
                    errorText={t('validation.outOfRange', { min: 1, max: 200 })}
                    onChange={(event) =>
                      setVoxelDraft((prev) => ({
                        ...prev,
                        defaultVoxelSizeMm: Number(event.target.value)
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voxel-max-count">{t('settings.voxel.maxVoxelCount')}</Label>
                  <Input
                    id="voxel-max-count"
                    type="number"
                    min={10000}
                    max={5000000}
                    step={10000}
                    value={voxelDraft.maxVoxelCount}
                    isInvalid={(val) => {
                      const n = Number(val)
                      return Number.isNaN(n) || n < 10000 || n > 5000000
                    }}
                    errorText={t('validation.outOfRange', { min: 10000, max: 5000000 })}
                    onChange={(event) =>
                      setVoxelDraft((prev) => ({
                        ...prev,
                        maxVoxelCount: Number(event.target.value)
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voxel-fps">{t('settings.voxel.targetFps')}</Label>
                  <Select
                    value={voxelDraft.targetFps}
                    onValueChange={(value) =>
                      setVoxelDraft((prev) => ({
                        ...prev,
                        targetFps: targetFpsSchema.parse(value)
                      }))
                    }
                  >
                    <SelectTrigger id="voxel-fps" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {targetFpsSchema.options.map((fps) => (
                        <SelectItem key={fps} value={fps}>
                          {t('settings.voxel.targetFpsOption', { fps })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voxel-color-mode">{t('settings.voxel.colorMode')}</Label>
                  <Select
                    value={voxelDraft.colorMode}
                    onValueChange={(value) =>
                      setVoxelDraft((prev) => ({
                        ...prev,
                        colorMode: voxelColorModeSchema.parse(value)
                      }))
                    }
                  >
                    <SelectTrigger id="voxel-color-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voxelColorModeSchema.options.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t(`settings.voxel.colorModes.${mode}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="voxel-grid"
                      checked={voxelDraft.showGrid}
                      onCheckedChange={(checked) =>
                        setVoxelDraft((prev) => ({ ...prev, showGrid: checked === true }))
                      }
                    />
                    <Label htmlFor="voxel-grid" className="font-normal">
                      {t('settings.voxel.showGrid')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="voxel-axes"
                      checked={voxelDraft.showAxes}
                      onCheckedChange={(checked) =>
                        setVoxelDraft((prev) => ({ ...prev, showAxes: checked === true }))
                      }
                    />
                    <Label htmlFor="voxel-axes" className="font-normal">
                      {t('settings.voxel.showAxes')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="voxel-aabb"
                      checked={voxelDraft.showBoundingBox}
                      onCheckedChange={(checked) =>
                        setVoxelDraft((prev) => ({ ...prev, showBoundingBox: checked === true }))
                      }
                    />
                    <Label htmlFor="voxel-aabb" className="font-normal">
                      {t('settings.voxel.showBoundingBox')}
                    </Label>
                  </div>
                </div>

                <Button type="submit" size="sm" disabled={setVoxel.isPending}>
                  {voxelSaved && <CheckIcon className="size-3.5" />}
                  {voxelSaved ? t('settings.saved') : t('settings.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 3. General Appearance, Language & Runtime Versions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.title')}</CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">{t('settings.theme')}</Label>
              <Select
                value={config.theme}
                onValueChange={(value) => setTheme.mutate(themeSchema.parse(value))}
              >
                <SelectTrigger id="theme" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themeSchema.options.map((theme) => (
                    <SelectItem key={theme} value={theme}>
                      {t(`theme.${theme}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="language">{t('settings.language')}</Label>
              <Select
                value={config.language}
                onValueChange={(value) => setLanguage.mutate(languageSettingSchema.parse(value))}
              >
                <SelectTrigger id="language" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageSettingSchema.options.map((language) => (
                    <SelectItem key={language} value={language}>
                      {t(`language.${language}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-1 text-muted-foreground text-sm">
              <p className="font-medium text-foreground">{t('settings.versions')}</p>
              <p>
                {info.name} {info.version}
              </p>
              {Object.entries(info.versions).map(([name, version]) => (
                <p key={name}>
                  {name} {version}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
