import { MAX_TOASTS, TOAST_ACTION_MIN_MS, TOAST_DURATION_MS } from '@renderer/config/site'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  tone?: ToastTone
  title: string
  description?: string
  action?: ToastAction
  /** Overrides the per-tone default. */
  duration?: number
}

export interface Toast extends Required<Pick<ToastOptions, 'title' | 'tone'>> {
  id: string
  description?: string
  action?: ToastAction
  duration: number
  /** Times this same message has fired while still on screen. */
  count: number
}

/**
 * An error you can't read before it leaves is the same as no error at all, so a
 * failure sits around four times as long as a confirmation.
 */
export function durationFor(options: ToastOptions): number {
  if (options.duration != null) return options.duration
  const base = TOAST_DURATION_MS[options.tone ?? 'info']
  // An action has to be reachable: a toast nobody can click in time is a lie.
  return options.action ? Math.max(base, TOAST_ACTION_MIN_MS) : base
}

function isSameMessage(toast: Toast, options: ToastOptions): boolean {
  return (
    toast.tone === (options.tone ?? 'info') &&
    toast.title === options.title &&
    toast.description === options.description
  )
}

/**
 * Adds a toast, oldest dropped once the stack is full. A repeat of the message
 * already showing counts up in place instead of stacking — a failing loop would
 * otherwise bury the screen in identical copies of one error.
 */
export function pushToast(list: Toast[], options: ToastOptions, id: string): Toast[] {
  const newest = list[list.length - 1]
  if (newest && isSameMessage(newest, options)) {
    return [...list.slice(0, -1), { ...newest, count: newest.count + 1, action: options.action }]
  }
  const toast: Toast = {
    id,
    tone: options.tone ?? 'info',
    title: options.title,
    description: options.description,
    action: options.action,
    duration: durationFor(options),
    count: 1
  }
  return [...list, toast].slice(-MAX_TOASTS)
}

export function dismissToast(list: Toast[], id: string): Toast[] {
  return list.filter((toast) => toast.id !== id)
}
