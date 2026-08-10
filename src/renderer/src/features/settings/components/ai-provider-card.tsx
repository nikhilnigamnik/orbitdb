import * as React from 'react'
import { IconAlertTriangle, IconChevronRight, IconKey, IconTrash } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Spinner } from '@renderer/components/ui/spinner'
import { Switch } from '@renderer/components/ui/switch'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { aiProvider } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { AiModelId, AiProviderView } from '@renderer/types'
import { SettingFooter, SettingRow, SettingsCard } from './settings-card'

interface AiProviderCardProps {
  view: AiProviderView
  isActive: boolean
  isBusy: boolean
  isTesting: boolean
  onActivate: () => void
  onSaveKey: (apiKey: string) => Promise<void>
  onRemoveKey: () => void
  onChangeModel: (model: AiModelId) => void
  onTest: () => void
}

export function AiProviderCard({
  view,
  isActive,
  isBusy,
  isTesting,
  onActivate,
  onSaveKey,
  onRemoveKey,
  onChangeModel,
  onTest
}: AiProviderCardProps) {
  const spec = aiProvider(view.id)
  const [draftKey, setDraftKey] = React.useState('')
  // Open where there is something to do: the provider in use, or one whose stored
  // key needs re-entering. The rest stay folded so three cards read as a list.
  const [isOpen, setIsOpen] = React.useState(isActive || view.isKeyUnreadable)
  const activeModel = spec.models.find((model) => model.id === view.model)

  // Keeps the typed key until the save actually lands: clearing it first means a
  // rejected save loses what the user pasted and they have to fetch it again.
  async function save() {
    const key = draftKey.trim()
    if (!key) return
    try {
      await onSaveKey(key)
    } catch {
      // Already reported by the caller. Keep the draft so it can be retried.
      return
    }
    setDraftKey('')
  }

  return (
    <section
      aria-label={spec.label}
      className={cn('transition-opacity', !isActive && 'opacity-75 hover:opacity-100')}
    >
      <SettingsCard>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center gap-3 p-4">
            <CollapsibleTrigger
              // The switch lives outside the trigger rather than inside it: one
              // press must not both activate a provider and fold its settings.
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none"
            >
              <IconChevronRight
                size={13}
                className={cn(
                  'shrink-0 text-text-subtle transition-transform duration-150',
                  isOpen && 'rotate-90'
                )}
              />
              <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-text">
                {spec.label}
                {isActive && <Chip tone="emerald">Active</Chip>}
                {!isActive && view.hasKey && <Chip tone="neutral">Key saved</Chip>}
              </span>
            </CollapsibleTrigger>
            <Switch
              checked={isActive}
              // An off switch that is already off is the only pointless press here:
              // exactly one provider is active, so the active card cannot turn
              // itself off - something else has to turn on.
              disabled={isActive || isBusy}
              onCheckedChange={(next) => next && onActivate()}
              aria-label={`Use ${spec.label}`}
            />
          </div>

          <CollapsibleContent>
            <div className="border-t border-border">
              {view.isKeyUnreadable && (
                <div className="flex items-start gap-2.5 border-l-2 border-l-warning bg-warning/5 p-4">
                  <IconAlertTriangle size={14} className="mt-px shrink-0 text-warning" />
                  <p className="text-xs leading-relaxed text-warning">
                    A key is stored but can&rsquo;t be decrypted on this machine - it was sealed
                    under a different OS user or keychain. Enter it again to replace it.
                  </p>
                </div>
              )}

              <SettingRow
                title={
                  <span className="flex items-center gap-2">
                    API key
                    {view.hasKey ? (
                      <Chip tone="neutral">Saved</Chip>
                    ) : (
                      <Chip tone="neutral">Not set</Chip>
                    )}
                  </span>
                }
                description="Encrypted on this machine. Never leaves it except to this provider."
                isStacked={!view.hasKey}
              >
                {view.hasKey ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 items-center gap-1.5 rounded-md border border-border-strong bg-input px-2.5 font-mono text-xs text-text-muted">
                      <IconKey size={11} className="shrink-0 text-text-subtle" />
                      {view.keyHint}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={onRemoveKey}
                      disabled={isBusy}
                      aria-label={`Remove ${spec.label} key`}
                      title="Remove"
                    >
                      <IconTrash size={12} />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`${spec.label} API key`}
                      type="password"
                      value={draftKey}
                      onChange={(e) => setDraftKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void save()
                      }}
                      placeholder={spec.keyPlaceholder}
                      spellCheck={false}
                      autoComplete="off"
                      className="flex-1 font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={() => void save()}
                      disabled={!draftKey.trim() || isBusy}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </SettingRow>

              <SettingRow title="Model" description={activeModel?.hint}>
                <Select<AiModelId>
                  value={view.model}
                  onChange={onChangeModel}
                  ariaLabel={`${spec.label} model`}
                  disabled={isBusy}
                  align="end"
                  // The trigger shows the name alone; the hint belongs in the list,
                  // where you are actually choosing between them.
                  renderValue={(option) =>
                    spec.models.find((m) => m.id === option?.value)?.label ?? option?.value
                  }
                  options={spec.models.map((model) => ({
                    value: model.id,
                    label: (
                      <span className="flex flex-col gap-0.5 text-left">
                        <span>{model.label}</span>
                        <span className="text-[11px] text-text-subtle">{model.hint}</span>
                      </span>
                    )
                  }))}
                />
              </SettingRow>

              <SettingFooter>
                <span className="text-xs text-text-subtle">
                  {view.hasKey ? 'Check the key still works' : `Add a ${spec.label} key to use it`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onTest}
                  disabled={!view.hasKey || isTesting}
                  className="text-text-muted hover:bg-surface-elevated hover:text-text"
                >
                  {isTesting ? (
                    <Spinner size={12} className="text-current" />
                  ) : (
                    <IconKey size={12} />
                  )}
                  Test key
                </Button>
              </SettingFooter>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SettingsCard>
    </section>
  )
}
