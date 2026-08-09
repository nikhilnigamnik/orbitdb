import * as React from 'react'
import { Toast as ToastPrimitive } from 'radix-ui'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconX,
  type Icon
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import {
  dismissToast,
  pushToast,
  type Toast,
  type ToastOptions,
  type ToastTone
} from '@renderer/lib/toast-queue'

type ShortcutOptions = Omit<ToastOptions, 'title' | 'tone'>

interface ToastApi {
  show: (options: ToastOptions) => void
  success: (title: string, options?: ShortcutOptions) => void
  error: (title: string, options?: ShortcutOptions) => void
  warning: (title: string, options?: ShortcutOptions) => void
  info: (title: string, options?: ShortcutOptions) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = React.useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

const TONE_ICON: Record<ToastTone, Icon> = {
  success: IconCircleCheck,
  error: IconExclamationCircle,
  warning: IconAlertTriangle,
  info: IconInfoCircle
}

const TONE_ACCENT: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info'
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const api = React.useMemo<ToastApi>(() => {
    const show = (options: ToastOptions) =>
      setToasts((prev) => pushToast(prev, options, `toast-${nextId++}`))
    return {
      show,
      success: (title, options) => show({ ...options, title, tone: 'success' }),
      error: (title, options) => show({ ...options, title, tone: 'error' }),
      warning: (title, options) => show({ ...options, title, tone: 'warning' }),
      info: (title, options) => show({ ...options, title, tone: 'info' }),
      dismiss: (id) => setToasts((prev) => dismissToast(prev, id))
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          // Keyed on the repeat count so a message that fires again remounts,
          // restarting its timer rather than expiring on the first one's clock.
          <ToastCard
            key={`${toast.id}:${toast.count}`}
            toast={toast}
            onDismiss={() => api.dismiss(toast.id)}
          />
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const ToneIcon = TONE_ICON[toast.tone]
  return (
    <ToastPrimitive.Root
      duration={toast.duration}
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      className={cn(
        'animate-slide-up-fade flex items-start gap-2.5 rounded-lg border border-border-strong/70 bg-surface/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl',
        'data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[state=closed]:opacity-0'
      )}
    >
      <ToneIcon size={15} className={cn('mt-px shrink-0', TONE_ACCENT[toast.tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastPrimitive.Title className="flex items-center gap-1.5 text-xs font-medium text-text">
          <span className="min-w-0 truncate">{toast.title}</span>
          {toast.count > 1 && (
            <span className="shrink-0 rounded-sm bg-text-muted/12 px-1 font-mono text-[10px] text-text-muted ring-1 ring-inset ring-text-muted/25">
              ×{toast.count}
            </span>
          )}
        </ToastPrimitive.Title>
        {toast.description && (
          // Long enough to matter, short enough not to take the window: a driver
          // error runs to paragraphs, and the whole point is that it stays out
          // of the way.
          <ToastPrimitive.Description className="max-h-24 overflow-y-auto font-mono text-[11px] break-words text-text-muted">
            {toast.description}
          </ToastPrimitive.Description>
        )}
        {toast.action && (
          <ToastPrimitive.Action
            asChild
            altText={toast.action.label}
            onClick={toast.action.onClick}
          >
            <button
              type="button"
              className="mt-0.5 h-6 w-fit cursor-pointer rounded-md border border-border-strong bg-surface-elevated px-2 text-xs font-medium text-text transition-colors hover:bg-surface-elevated/70 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
            >
              {toast.action.label}
            </button>
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="shrink-0 cursor-pointer rounded-md p-0.5 text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
      >
        <IconX size={13} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
