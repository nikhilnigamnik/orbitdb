import * as React from 'react'
import { cn } from '@renderer/lib/utils'

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}

export function FormField({ label, htmlFor, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
