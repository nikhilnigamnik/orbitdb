import * as React from 'react'
import { z } from 'zod'
import { IconLink } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { FormField } from '@renderer/components/forms/form-field'
import { SubmitButton } from '@renderer/components/forms/submit-button'
import { Badge } from '@renderer/components/ui/badge'
import { unwrap } from '@renderer/lib/ipc'
import { parseConnectionUrl } from '../lib/parse-connection-url'
import {
  DEFAULT_CONNECTION_VALUES,
  DEFAULT_DATABASES,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PORTS,
  DEFAULT_USERS,
  ENGINE_LABEL,
  ENVIRONMENTS,
  ENVIRONMENT_LABEL
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import { connectionSchema, type ConnectionFormValues } from '../schema'
import { ENGINE_ICON } from './engine-icons'
import type {
  ConnectionEnvironment,
  DatabaseEngine,
  SavedConnection,
  TestConnectionResult
} from '@renderer/types'
import { shortServerVersion } from '@renderer/lib/format'

interface ConnectionFormSheetProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (connection: SavedConnection) => void
  initial?: SavedConnection | null
}

const ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'd1']

const ENGINE_STYLES: Record<DatabaseEngine, { bg: string; iconClass: string; tagline: string }> = {
  postgres: { bg: 'bg-sky-500/10', iconClass: 'text-sky-300', tagline: 'PostgreSQL' },
  mysql: { bg: 'bg-orange-500/10', iconClass: 'text-orange-300', tagline: 'MySQL / MariaDB' },
  d1: { bg: 'bg-amber-500/10', iconClass: 'text-amber-300', tagline: 'Cloudflare SQLite' }
}

const ENVIRONMENT_ACTIVE: Record<ConnectionEnvironment, { bg: string; text: string; dot: string }> =
  {
    dev: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    stage: { bg: 'bg-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-400' },
    prod: { bg: 'bg-rose-500/10', text: 'text-rose-300', dot: 'bg-rose-400' }
  }

function toFormValues(initial?: SavedConnection | null): ConnectionFormValues {
  if (!initial) return { ...DEFAULT_CONNECTION_VALUES }
  return {
    name: initial.name,
    engine: initial.engine,
    environment: initial.environment ?? DEFAULT_ENVIRONMENT,
    host: initial.host,
    port: initial.port,
    database: initial.database,
    user: initial.user,
    password: initial.password,
    ssl: initial.ssl,
    accountId: initial.accountId ?? '',
    databaseId: initial.databaseId ?? '',
    apiToken: initial.apiToken ?? ''
  }
}

export function ConnectionFormSheet({
  isOpen,
  onClose,
  onSaved,
  initial
}: ConnectionFormSheetProps) {
  const [values, setValues] = React.useState<ConnectionFormValues>(() => toFormValues(initial))
  const [errors, setErrors] = React.useState<Partial<Record<keyof ConnectionFormValues, string>>>(
    {}
  )
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<TestConnectionResult | null>(null)
  const [urlInput, setUrlInput] = React.useState('')

  const urlIsInvalid =
    urlInput.trim().length > 0 && parseConnectionUrl(urlInput) === null

  function applyConnectionUrl(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return
    const parsed = parseConnectionUrl(trimmed)
    if (!parsed) return
    setValues((prev) => ({
      ...prev,
      engine: parsed.engine,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database || prev.database,
      user: parsed.user || prev.user,
      password: parsed.password || prev.password,
      ssl: parsed.ssl
    }))
    setErrors({})
    setUrlInput('')
    setTestResult(null)
  }

  React.useEffect(() => {
    if (isOpen) {
      setValues(toFormValues(initial))
      setErrors({})
      setFormError(null)
      setTestResult(null)
    }
  }, [isOpen, initial])

  function update<K extends keyof ConnectionFormValues>(key: K, value: ConnectionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
    setTestResult(null)
  }

  function changeEngine(next: DatabaseEngine) {
    setValues((prev) => {
      const wasDefaultPort = prev.port === DEFAULT_PORTS[prev.engine]
      const wasDefaultUser = prev.user === DEFAULT_USERS[prev.engine]
      const wasDefaultDb = prev.database === DEFAULT_DATABASES[prev.engine]
      return {
        ...prev,
        engine: next,
        port: wasDefaultPort ? DEFAULT_PORTS[next] : prev.port,
        user: wasDefaultUser ? DEFAULT_USERS[next] : prev.user,
        database: wasDefaultDb ? DEFAULT_DATABASES[next] : prev.database
      }
    })
    setTestResult(null)
  }

  function validate(): ConnectionFormValues | null {
    const result = connectionSchema.safeParse(values)
    if (result.success) {
      setErrors({})
      return result.data
    }
    const fieldErrors: Partial<Record<keyof ConnectionFormValues, string>> = {}
    for (const issue of (result.error as z.ZodError).issues) {
      const key = issue.path[0] as keyof ConnectionFormValues | undefined
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    setErrors(fieldErrors)
    return null
  }

  async function handleTest() {
    const parsed = validate()
    if (!parsed) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await unwrap(window.api.connections.test(parsed))
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = validate()
    if (!parsed) return
    setIsSubmitting(true)
    setFormError(null)
    try {
      const saved = initial
        ? await unwrap(window.api.connections.update(initial.id, parsed))
        : await unwrap(window.api.connections.create(parsed))
      onSaved(saved)
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-md"
      content={
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border px-4 py-3 pr-12">
            <h2 className="text-[13px] font-semibold text-text">
              {initial ? 'Edit connection' : 'New connection'}
            </h2>
            <p className="text-[11px] text-text-subtle">
              Connect to a {ENGINE_LABEL[values.engine]} database.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
            <FormField
              label="Connection URL"
              htmlFor="conn-url"
              hint="Paste a postgres:// or mysql:// URL to autofill the fields below."
              error={urlIsInvalid ? 'Not a valid postgres:// or mysql:// URL' : undefined}
            >
              <div className="relative">
                <IconLink
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
                />
                <Input
                  id="conn-url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (text && parseConnectionUrl(text)) {
                      e.preventDefault()
                      applyConnectionUrl(text)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyConnectionUrl(urlInput)
                    }
                  }}
                  placeholder="postgres://user:password@host:5432/db"
                  className="pl-8 font-mono"
                />
              </div>
            </FormField>

            <FormField label="Engine">
              <div className="grid grid-cols-3 gap-2">
                {ENGINES.map((engine) => {
                  const style = ENGINE_STYLES[engine]
                  const Icon = ENGINE_ICON[engine]
                  const isSelected = values.engine === engine
                  return (
                    <button
                      key={engine}
                      type="button"
                      onClick={() => changeEngine(engine)}
                      aria-pressed={isSelected}
                      className={cn(
                        'group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-surface px-2 py-3 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all',
                        isSelected
                          ? 'border-accent/60 bg-accent/4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                          : 'border-border hover:border-border-strong hover:bg-surface-elevated/50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ring-white/5 transition-transform group-hover:scale-105',
                          style.bg,
                          style.iconClass
                        )}
                        aria-hidden
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <p
                        className={cn(
                          'truncate text-[12px] font-semibold transition-colors',
                          isSelected ? 'text-text' : 'text-text-muted group-hover:text-text'
                        )}
                      >
                        {ENGINE_LABEL[engine]}
                      </p>
                      <span
                        aria-hidden
                        className={cn(
                          'absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-white transition-all',
                          isSelected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                        )}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          className="h-2.5 w-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 6.5L5 9l4.5-5" />
                        </svg>
                      </span>
                    </button>
                  )
                })}
              </div>
            </FormField>

            <FormField label="Display name" htmlFor="conn-name" error={errors.name}>
              <Input
                id="conn-name"
                value={values.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder={`My local ${ENGINE_LABEL[values.engine]}`}
                autoFocus
              />
            </FormField>

            <FormField label="Environment" error={errors.environment}>
              <SlidingTabs
                tabs={ENVIRONMENTS.map((env) => {
                  const active = ENVIRONMENT_ACTIVE[env]
                  return {
                    id: env,
                    label: ENVIRONMENT_LABEL[env],
                    leading: (isActive) => (
                      <span
                        aria-hidden
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isActive ? active.dot : 'bg-text-subtle/60'
                        )}
                      />
                    ),
                    activeClassName: active.text,
                    indicatorClassName: active.bg
                  }
                })}
                value={values.environment}
                onChange={(env) => update('environment', env)}
              />
            </FormField>

            {values.engine === 'd1' ? (
              <>
                <FormField
                  label="Account ID"
                  htmlFor="conn-account"
                  error={errors.accountId}
                  hint="Found in the Cloudflare dashboard sidebar."
                >
                  <Input
                    id="conn-account"
                    value={values.accountId}
                    onChange={(e) => update('accountId', e.target.value)}
                    placeholder="abcdef0123456789abcdef0123456789"
                    className="font-mono"
                  />
                </FormField>
                <FormField
                  label="Database ID"
                  htmlFor="conn-db-id"
                  error={errors.databaseId}
                  hint="The UUID of the D1 database, not its name."
                >
                  <Input
                    id="conn-db-id"
                    value={values.databaseId}
                    onChange={(e) => update('databaseId', e.target.value)}
                    placeholder="11111111-2222-3333-4444-555555555555"
                    className="font-mono"
                  />
                </FormField>
                <FormField
                  label="API token"
                  htmlFor="conn-token"
                  error={errors.apiToken}
                  hint="Create an API token with the D1 Edit permission."
                >
                  <Input
                    id="conn-token"
                    type="password"
                    value={values.apiToken}
                    onChange={(e) => update('apiToken', e.target.value)}
                    placeholder="••••••••"
                    className="font-mono"
                  />
                </FormField>
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <FormField label="Host" htmlFor="conn-host" error={errors.host}>
                    <Input
                      id="conn-host"
                      value={values.host}
                      onChange={(e) => update('host', e.target.value)}
                      placeholder="localhost"
                    />
                  </FormField>
                  <FormField label="Port" htmlFor="conn-port" error={errors.port}>
                    <Input
                      id="conn-port"
                      type="number"
                      value={values.port}
                      onChange={(e) => update('port', Number(e.target.value))}
                      min={1}
                      max={65535}
                    />
                  </FormField>
                </div>

                <FormField
                  label="Database"
                  htmlFor="conn-db"
                  error={errors.database}
                  hint={
                    values.engine === 'mysql'
                      ? 'Optional — leave empty to browse all databases.'
                      : undefined
                  }
                >
                  <Input
                    id="conn-db"
                    value={values.database}
                    onChange={(e) => update('database', e.target.value)}
                    placeholder={values.engine === 'mysql' ? '(optional)' : 'postgres'}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="User" htmlFor="conn-user" error={errors.user}>
                    <Input
                      id="conn-user"
                      value={values.user}
                      onChange={(e) => update('user', e.target.value)}
                      placeholder={DEFAULT_USERS[values.engine]}
                    />
                  </FormField>
                  <FormField label="Password" htmlFor="conn-password" error={errors.password}>
                    <Input
                      id="conn-password"
                      type="password"
                      value={values.password}
                      onChange={(e) => update('password', e.target.value)}
                      placeholder="••••••••"
                    />
                  </FormField>
                </div>

                <label className="flex items-center justify-between gap-3 pt-1 text-[12.5px] text-text-muted">
                  <span>Use SSL (insecure mode, ignores cert verification)</span>
                  <Switch
                    checked={values.ssl}
                    onCheckedChange={(checked) => update('ssl', checked)}
                  />
                </label>
              </>
            )}

            {testResult && (
              <div
                className={
                  testResult.success
                    ? 'rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5'
                    : 'rounded-md border border-red-500/20 bg-red-500/5 p-2.5'
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={testResult.success ? 'success' : 'danger'}>
                    {testResult.success ? 'Connected' : 'Failed'}
                  </Badge>
                  {testResult.serverVersion && (
                    <span className="text-[11px] text-text-muted">
                      {shortServerVersion(testResult.serverVersion)}
                    </span>
                  )}
                </div>
                {!testResult.success && testResult.error && (
                  <p className="mt-2 break-all font-mono text-[11px] text-red-300/80">
                    {testResult.error}
                  </p>
                )}
              </div>
            )}

            {formError && (
              <p className="rounded-md border border-red-500/20 bg-red-500/5 p-2 font-mono text-[11px] text-red-300/80">
                {formError}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface-elevated/20 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={handleTest}
              disabled={isTesting || isSubmitting}
            >
              {isTesting ? 'Testing…' : 'Test'}
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <SubmitButton
              size="sm"
              className="bg-accent text-white hover:bg-accent/90"
              onClick={handleSubmit}
              isSubmitting={isSubmitting}
              loadingText={initial ? 'Updating…' : 'Saving…'}
            >
              {initial ? 'Save changes' : 'Save connection'}
            </SubmitButton>
          </div>
        </form>
      }
    />
  )
}
