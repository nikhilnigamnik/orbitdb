import * as React from 'react'
import { z } from 'zod'
import { IconLink, IconPlugConnected } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { FormField } from '@renderer/components/forms/form-field'
import { SubmitButton } from '@renderer/components/forms/submit-button'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
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
  ENVIRONMENT_LABEL,
  canReuseStoredSecrets
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import { createConnectionSchema, type ConnectionFormValues } from '../schema'
import { ConnectionEnginePicker } from './connection-engine-picker'
import { ConnectionAppearanceFields } from './connection-appearance-fields'
import { ConnectionSslFields } from './connection-ssl-fields'
import { ConnectionTestResult } from './connection-test-result'
import type {
  ConnectionEnvironment,
  DatabaseEngine,
  SavedConnection,
  TestConnectionResult
} from '@renderer/types'

interface ConnectionFormSheetProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (connection: SavedConnection) => void
  initial?: SavedConnection | null
  /**
   * Folders already in use. Passed down rather than read from the connection
   * store, so the sheet still mounts in a test without the provider.
   */
  folders?: string[]
}

// The segmented control keeps its white thumb; the environment's colour is
// carried by the label and its dot, so the thumb stays an opaque surface.
const ENVIRONMENT_ACTIVE: Record<ConnectionEnvironment, { text: string; dot: string }> = {
  dev: { text: 'text-success', dot: 'bg-success' },
  stage: { text: 'text-warning', dot: 'bg-warning' },
  prod: { text: 'text-danger', dot: 'bg-danger' }
}

const SAVED_SECRET_PLACEHOLDER = 'Saved - type to replace'

/**
 * Secrets start blank even when editing: the renderer is never sent them, and a
 * blank one is saved as "unchanged". `sslVerify` defaults on for a new
 * connection; an existing SSL one without the field keeps connecting the way it
 * always has, unverified, until the user turns verification on.
 */
function toFormValues(initial?: SavedConnection | null): ConnectionFormValues {
  if (!initial) return { ...DEFAULT_CONNECTION_VALUES, sslVerify: true }
  return {
    name: initial.name,
    engine: initial.engine,
    environment: initial.environment ?? DEFAULT_ENVIRONMENT,
    folder: initial.folder ?? '',
    color: initial.color,
    host: initial.host,
    port: initial.port,
    database: initial.database,
    user: initial.user,
    password: '',
    ssl: initial.ssl,
    sslVerify: initial.sslVerify ?? !initial.ssl,
    accountId: initial.accountId ?? '',
    databaseId: initial.databaseId ?? '',
    apiToken: ''
  }
}

function isSameValues(a: ConnectionFormValues, b: ConnectionFormValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof ConnectionFormValues)[])
  return [...keys].every((key) => a[key] === b[key])
}

export function ConnectionFormSheet({
  isOpen,
  onClose,
  onSaved,
  initial,
  folders = []
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
  const [isDiscardOpen, setIsDiscardOpen] = React.useState(false)

  const baseline = React.useMemo(() => toFormValues(initial), [initial])
  const isDirty = !isSameValues(values, baseline) || urlInput.trim().length > 0
  // A saved secret only carries over while the connection still points at the
  // same server (see canReuseStoredSecrets); once host, port, user or the D1 ids
  // change, the form asks for it again rather than offering to keep it.
  const isSameServer = initial ? canReuseStoredSecrets(initial, values) : false
  const hasSavedPassword = Boolean(initial?.hasPassword) && isSameServer
  const hasSavedApiToken = Boolean(initial?.hasApiToken) && isSameServer
  const hasDroppedSecret = Boolean(initial?.hasPassword || initial?.hasApiToken) && !isSameServer

  const urlIsInvalid = urlInput.trim().length > 0 && parseConnectionUrl(urlInput) === null

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
      setUrlInput('')
      setIsDiscardOpen(false)
    }
  }, [isOpen, initial])

  // Escape, a click outside, the close button and Cancel all land here, so
  // none of them can drop an edit without asking.
  function requestClose() {
    if (isDirty && !isSubmitting) setIsDiscardOpen(true)
    else onClose()
  }

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
    const result = createConnectionSchema({ hasSavedApiToken }).safeParse(values)
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
      // The id lets main fill in a saved secret the form was never given.
      const result = await unwrap(window.api.connections.test(parsed, initial?.id))
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
    <>
      <Sheet
        title={initial ? 'Edit connection' : 'New connection'}
        openSheet={isOpen}
        setOpenSheet={(open) => {
          if (!open) requestClose()
        }}
        side="right"
        sheetContentClassName="sm:max-w-md"
        content={
          <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 shrink-0 items-center border-b border-border px-4 pr-12">
              <h2 className="truncate text-sm font-semibold text-text">
                {initial ? 'Edit connection' : 'New connection'}
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <p className="-mb-1 text-xs text-text-muted">
                Connect to a {ENGINE_LABEL[values.engine]} database.
              </p>

              <FormField label="Engine">
                <ConnectionEnginePicker value={values.engine} onChange={changeEngine} />
              </FormField>

              {values.engine !== 'd1' && (
                <FormField
                  label="Connection URL"
                  htmlFor="conn-url"
                  hint={`Paste a ${values.engine === 'mysql' ? 'mysql://' : 'postgres://'} URL to autofill the fields below.`}
                  error={
                    urlIsInvalid
                      ? `Not a valid ${values.engine === 'mysql' ? 'mysql://' : 'postgres://'} URL`
                      : undefined
                  }
                >
                  <div className="relative">
                    <IconLink
                      size={14}
                      className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle"
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
                      placeholder={
                        values.engine === 'mysql'
                          ? 'mysql://user:password@host:3306/db'
                          : 'postgres://user:password@host:5432/db'
                      }
                      className="pl-8 font-mono"
                    />
                  </div>
                </FormField>
              )}

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
                            'size-1.5 rounded-full',
                            isActive ? active.dot : 'bg-text-subtle/60'
                          )}
                        />
                      ),
                      activeClassName: active.text
                    }
                  })}
                  value={values.environment}
                  onChange={(env) => update('environment', env)}
                />
              </FormField>

              <ConnectionAppearanceFields
                folder={values.folder}
                color={values.color}
                folders={folders}
                error={errors.folder}
                onChangeFolder={(folder) => update('folder', folder)}
                onChangeColor={(color) => update('color', color)}
              />

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
                    hint={
                      hasSavedApiToken
                        ? 'Leave blank to keep the saved token.'
                        : hasDroppedSecret
                          ? 'The database changed, so enter the token again.'
                          : 'Create an API token with the D1 Edit permission.'
                    }
                  >
                    <Input
                      id="conn-token"
                      type="password"
                      value={values.apiToken}
                      onChange={(e) => update('apiToken', e.target.value)}
                      placeholder={hasSavedApiToken ? SAVED_SECRET_PLACEHOLDER : '••••••••'}
                      autoComplete="off"
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
                        ? 'Optional - leave empty to browse all databases.'
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
                    <FormField
                      label="Password"
                      htmlFor="conn-password"
                      error={errors.password}
                      hint={
                        hasSavedPassword
                          ? 'Leave blank to keep the saved one.'
                          : hasDroppedSecret
                            ? 'The server changed, so enter the password again.'
                            : undefined
                      }
                    >
                      <Input
                        id="conn-password"
                        type="password"
                        value={values.password}
                        onChange={(e) => update('password', e.target.value)}
                        placeholder={hasSavedPassword ? SAVED_SECRET_PLACEHOLDER : '••••••••'}
                        autoComplete="off"
                      />
                    </FormField>
                  </div>

                  <ConnectionSslFields
                    ssl={values.ssl}
                    sslVerify={values.sslVerify ?? false}
                    onChangeSsl={(ssl) => update('ssl', ssl)}
                    onChangeSslVerify={(sslVerify) => update('sslVerify', sslVerify)}
                  />
                </>
              )}

              {testResult && <ConnectionTestResult result={testResult} />}

              {formError && (
                <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 font-mono text-xs text-danger">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">
              <Button
                type="button"
                variant="subtle"
                onClick={handleTest}
                disabled={isTesting || isSubmitting}
              >
                <IconPlugConnected size={14} />
                {isTesting ? 'Testing…' : 'Test'}
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <SubmitButton
                size="sm"
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
      <ConfirmDialog
        isOpen={isDiscardOpen}
        onClose={() => setIsDiscardOpen(false)}
        onConfirm={() => {
          setIsDiscardOpen(false)
          onClose()
        }}
        title="Discard unsaved changes?"
        description="Your edits to this connection have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </>
  )
}
