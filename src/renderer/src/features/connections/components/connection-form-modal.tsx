import * as React from 'react'
import { z } from 'zod'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { FormField } from '@renderer/components/forms/form-field'
import { SubmitButton } from '@renderer/components/forms/submit-button'
import { Badge } from '@renderer/components/ui/badge'
import { unwrap } from '@renderer/lib/ipc'
import {
  DEFAULT_CONNECTION_VALUES,
  DEFAULT_DATABASES,
  DEFAULT_PORTS,
  DEFAULT_USERS,
  ENGINE_LABEL
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import { connectionSchema, type ConnectionFormValues } from '../schema'
import type { DatabaseEngine, SavedConnection, TestConnectionResult } from '@renderer/types'
import { shortServerVersion } from '@renderer/lib/format'

interface ConnectionFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (connection: SavedConnection) => void
  initial?: SavedConnection | null
}

const ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'd1']

function toFormValues(initial?: SavedConnection | null): ConnectionFormValues {
  if (!initial) return { ...DEFAULT_CONNECTION_VALUES }
  return {
    name: initial.name,
    engine: initial.engine,
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

export function ConnectionFormModal({
  isOpen,
  onClose,
  onSaved,
  initial
}: ConnectionFormModalProps) {
  const [values, setValues] = React.useState<ConnectionFormValues>(() => toFormValues(initial))
  const [errors, setErrors] = React.useState<Partial<Record<keyof ConnectionFormValues, string>>>(
    {}
  )
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<TestConnectionResult | null>(null)

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit connection' : 'New connection'}
      description={`Connect to a ${ENGINE_LABEL[values.engine]} database.`}
      size="md"
      footer={
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
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
            className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <SubmitButton
            size="sm"
            className="bg-[var(--color-text)] text-[var(--color-bg)] hover:bg-[var(--color-text)]/90"
            onClick={handleSubmit}
            isSubmitting={isSubmitting}
            loadingText={initial ? 'Updating…' : 'Saving…'}
          >
            {initial ? 'Save changes' : 'Save connection'}
          </SubmitButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Engine">
          <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
            {ENGINES.map((engine) => (
              <button
                key={engine}
                type="button"
                onClick={() => changeEngine(engine)}
                className={cn(
                  'rounded px-3 py-1 text-[12px] font-medium transition-colors',
                  values.engine === engine
                    ? 'bg-[var(--color-surface-elevated)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                )}
              >
                {ENGINE_LABEL[engine]}
              </button>
            ))}
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

            <label className="flex items-center gap-2 pt-1 text-[12.5px] text-[var(--color-text-muted)]">
              <Checkbox checked={values.ssl} onChange={(e) => update('ssl', e.target.checked)} />
              Use SSL (insecure mode, ignores cert verification)
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
                <span className="text-[11px] text-[var(--color-text-muted)]">
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
      </form>
    </Modal>
  )
}
