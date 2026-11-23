import { createToaster, Toast, Toaster } from '@ark-ui/react/toast'
import { cn } from 'cn'
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const toaster = createToaster({
  placement: 'bottom-end',
  overlap: true,
  gap: 12,
  max: 4
})

export function AppToaster() {
  const { t } = useTranslation()

  return (
    <Toaster toaster={toaster} className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {(toast) => (
        <Toast.Root
          key={toast.id}
          className={cn(
            'group pointer-events-auto relative flex w-80 items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg transition-all',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            toast.type === 'error' && 'border-destructive/50'
          )}
        >
          <div className="mt-0.5 shrink-0">
            {toast.type === 'success' ? (
              <CircleCheckIcon className="size-4 text-emerald-500" />
            ) : toast.type === 'error' ? (
              <CircleAlertIcon className="size-4 text-destructive" />
            ) : (
              <InfoIcon className="size-4 text-sky-500" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            {toast.title && (
              <Toast.Title className="font-medium text-xs leading-none">{toast.title}</Toast.Title>
            )}
            {toast.description && (
              <Toast.Description className="text-muted-foreground text-xs leading-relaxed">
                {toast.description}
              </Toast.Description>
            )}
          </div>

          <Toast.CloseTrigger
            aria-label={t('toast.close')}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100"
          >
            <XIcon className="size-3.5" />
          </Toast.CloseTrigger>
        </Toast.Root>
      )}
    </Toaster>
  )
}
