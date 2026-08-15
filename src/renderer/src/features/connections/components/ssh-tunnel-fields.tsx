import * as React from 'react'
import {
  IconCheck,
  IconFileText,
  IconFingerprint,
  IconShieldLock,
  IconX
} from '@tabler/icons-react'
import { AnimatedSize } from '@renderer/components/ui/animated-size'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { FormField } from '@renderer/components/forms/form-field'
import { SSH_AUTH_HINT, SSH_AUTH_LABEL, SSH_AUTH_METHODS } from '@renderer/config/site'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { SshAuthMethod } from '@renderer/types'
import type { ConnectionFormValues } from '../schema'
import { SshTunnelRoute } from './ssh-tunnel-route'

interface SshTunnelFieldsProps {
  values: ConnectionFormValues
  errors: Partial<Record<keyof ConnectionFormValues, string>>
  onChange: <K extends keyof ConnectionFormValues>(key: K, value: ConnectionFormValues[K]) => void
}

/** A stored key is a blob of PEM; show enough to tell two keys apart. */
function describeKey(pem: string): string {
  const header = pem.split('\n').find((line) => line.includes('PRIVATE KEY'))
  if (!header) return 'Private key stored'
  return header
    .replace(/[-\s]*(BEGIN|END)\s*/g, '')
    .replace(/-+$/, '')
    .trim()
}

/** Keep the tail visible - the end of a path is what identifies the key. */
function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 px-3 py-3', className)}>{children}</div>
}

export function SshTunnelFields({ values, errors, onChange }: SshTunnelFieldsProps) {
  const [keyLabel, setKeyLabel] = React.useState<string | null>(null)
  const [pickError, setPickError] = React.useState<string | null>(null)

  async function pickKey() {
    setPickError(null)
    try {
      const picked = await unwrap(window.api.connections.pickSshKey())
      if (!picked) return
      onChange('sshPrivateKey', picked.contents)
      setKeyLabel(picked.path)
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err))
    }
  }

  const method = values.sshAuthMethod
  const hasStoredKey = values.sshPrivateKey.trim().length > 0
  const isOn = values.sshEnabled

  // `shrink-0` on the card is load-bearing: it is a flex child of the sheet's
  // scrolling column, so a default flex-shrink compresses it - and its own
  // overflow-hidden turns that into silently clipped fields rather than a
  // visible overflow. Layout-only, so no unit test catches it.
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated/20">
      <label
        className={cn(
          'flex cursor-pointer items-center gap-2.5 px-3 py-3 transition-colors',
          isOn ? 'bg-surface-elevated/30' : 'hover:bg-surface-elevated/20'
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
            isOn ? 'bg-info/12 text-info' : 'bg-surface text-text-subtle'
          )}
        >
          <IconShieldLock size={15} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium text-text">SSH tunnel</span>
          <span className="text-xs leading-4 text-text-subtle">
            Reach a database that only its bastion can see.
          </span>
        </span>
        <Switch checked={isOn} onCheckedChange={(checked) => onChange('sshEnabled', checked)} />
      </label>

      <AnimatedSize>
        {isOn && (
          <div className="divide-y divide-border border-t border-border">
            <Section>
              <SshTunnelRoute
                sshUser={values.sshUser}
                sshHost={values.sshHost}
                sshPort={values.sshPort}
                host={values.host}
                port={values.port}
                engine={values.engine}
              />
            </Section>

            <Section>
              <div className="grid grid-cols-[1fr_88px] gap-2.5">
                <FormField label="SSH host" htmlFor="ssh-host" error={errors.sshHost}>
                  <Input
                    id="ssh-host"
                    value={values.sshHost}
                    onChange={(e) => onChange('sshHost', e.target.value)}
                    placeholder="bastion.example.com"
                  />
                </FormField>
                <FormField label="Port" htmlFor="ssh-port" error={errors.sshPort}>
                  <Input
                    id="ssh-port"
                    type="number"
                    value={values.sshPort}
                    onChange={(e) => onChange('sshPort', Number(e.target.value))}
                    min={1}
                    max={65535}
                  />
                </FormField>
              </div>

              <FormField label="SSH user" htmlFor="ssh-user" error={errors.sshUser}>
                <Input
                  id="ssh-user"
                  value={values.sshUser}
                  onChange={(e) => onChange('sshUser', e.target.value)}
                  placeholder="ubuntu"
                />
              </FormField>
            </Section>

            <Section>
              <FormField label="Authentication" hint={SSH_AUTH_HINT[method]}>
                <SlidingTabs
                  tabs={SSH_AUTH_METHODS.map((id) => ({ id, label: SSH_AUTH_LABEL[id] }))}
                  value={method}
                  onChange={(next) => onChange('sshAuthMethod', next as SshAuthMethod)}
                />
              </FormField>

              {method === 'password' && (
                <FormField label="SSH password" htmlFor="ssh-password" error={errors.sshPassword}>
                  <Input
                    id="ssh-password"
                    type="password"
                    value={values.sshPassword}
                    onChange={(e) => onChange('sshPassword', e.target.value)}
                    placeholder="••••••••"
                  />
                </FormField>
              )}

              {method === 'key' && (
                <>
                  <FormField
                    label="Private key"
                    error={errors.sshPrivateKey ?? pickError ?? undefined}
                  >
                    {hasStoredKey ? (
                      <div className="flex items-center gap-2 rounded-md bg-surface px-2 py-1.5">
                        <IconCheck size={13} className="shrink-0 text-success" />
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted"
                          title={keyLabel ?? undefined}
                        >
                          {keyLabel ? shortenPath(keyLabel) : describeKey(values.sshPrivateKey)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 px-2 text-text-subtle hover:text-text"
                          onClick={pickKey}
                        >
                          Replace
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start bg-surface"
                        onClick={pickKey}
                      >
                        <IconFileText size={13} />
                        Choose key file…
                      </Button>
                    )}
                  </FormField>
                  <FormField
                    label="Key passphrase"
                    htmlFor="ssh-passphrase"
                    hint="Leave empty if the key is not encrypted."
                  >
                    <Input
                      id="ssh-passphrase"
                      type="password"
                      value={values.sshPassphrase}
                      onChange={(e) => onChange('sshPassphrase', e.target.value)}
                      placeholder="••••••••"
                    />
                  </FormField>
                </>
              )}
            </Section>

            <Section className="gap-2">
              <div className="flex items-center gap-2">
                <IconFingerprint size={13} className="shrink-0 text-text-subtle" />
                <span className="flex-1 text-xs font-medium text-text-muted">Host key</span>
                <Chip tone={values.sshHostKeyFingerprint ? 'emerald' : 'neutral'}>
                  {values.sshHostKeyFingerprint ? 'Pinned' : 'Not yet pinned'}
                </Chip>
              </div>

              {values.sshHostKeyFingerprint ? (
                <div className="flex items-center gap-2 rounded-md bg-surface px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
                    {values.sshHostKeyFingerprint}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Clear"
                    className="h-6 w-6 shrink-0 p-0 text-text-subtle hover:text-danger"
                    onClick={() => onChange('sshHostKeyFingerprint', '')}
                  >
                    <IconX size={13} />
                  </Button>
                </div>
              ) : (
                <p className="text-xs leading-4 text-text-subtle">
                  Pinned on the first successful connection. After that, a bastion offering a
                  different key is refused rather than trusted.
                </p>
              )}
            </Section>
          </div>
        )}
      </AnimatedSize>
    </div>
  )
}
