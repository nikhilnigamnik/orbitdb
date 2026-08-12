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
import { aiProvider, needsGatewayIds } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { AiGatewayIds, AiModelId, AiProviderView } from '@renderer/types'
import { SettingFooter, SettingRow, SettingsCard } from './settings-card'

interface AiProviderCardProps {
  view: AiProviderView
  isActive: boolean
  isBusy: boolean
  isTesting: boolean
  /** Cloudflare's account and gateway ids. Ignored by every other provider. */
  gateway: AiGatewayIds
  onActivate: () => void
  onSaveKey: (apiKey: string) => Promise<void>
  onRemoveKey: () => void
  onChangeModel: (model: AiModelId) => void
  onSaveGateway: (ids: AiGatewayIds) => Promise<void>
  onTest: () => void
}

export function AiProviderCard({
  view,
  isActive,
  isBusy,
  isTesting,
  gateway,
  onActivate,
  onSaveKey,
  onRemoveKey,
  onChangeModel,
  onSaveGateway,
  onTest
}: AiProviderCardProps) {
  const spec = aiProvider(view.id)
  const [draftKey, setDraftKey] = React.useState('')
  const [accountId, setAccountId] = React.useState(gateway.accountId)
  const [gatewayId, setGatewayId] = React.useState(gateway.gatewayId)
  const hasGatewayIds = needsGatewayIds(view.id)
  const isMissingIds = hasGatewayIds && !(gateway.accountId && gateway.gatewayId)
  // Open where there is something to do: the provider in use, one whose stored
  // key needs re-entering, or Cloudflare before its ids are filled in. The rest
  // stay folded so the cards read as a list.
  const [isOpen, setIsOpen] = React.useState(isActive || view.isKeyUnreadable || isMissingIds)
  const activeModel = spec.models.find((model) => model.id === view.model)

  // Whatever main accepted wins: a rejected save must not leave the inputs
  // showing values the store never took.
  React.useEffect(() => {
    setAccountId(gateway.accountId)
    setGatewayId(gateway.gatewayId)
  }, [gateway.accountId, gateway.gatewayId])

  const isGatewayDirty = accountId !== gateway.accountId || gatewayId !== gateway.gatewayId

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
      // Dimming marks a card as not in use. The Cloudflare one is exempt: it
      // holds setup you come back to edit while some other provider is active,
      // so fading it reads as disabled rather than merely unselected.
      className={cn(
        'transition-opacity',
        !isActive && !hasGatewayIds && 'opacity-75 hover:opacity-100'
      )}
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

              {hasGatewayIds && (
                <>
                  <SettingRow
                    title="Account ID"
                    description="From the AI Gateway page, or your dashboard URL. Not a secret, so it is stored in the clear."
                    isStacked
                  >
                    <Input
                      aria-label="Cloudflare account ID"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="0123456789abcdef0123456789abcdef"
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono"
                    />
                  </SettingRow>

                  <SettingRow
                    title="Gateway ID"
                    description="The name you gave the gateway when you created it."
                    isStacked
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label="Cloudflare gateway ID"
                        value={gatewayId}
                        onChange={(e) => setGatewayId(e.target.value)}
                        placeholder="orbitdb"
                        spellCheck={false}
                        autoComplete="off"
                        className="flex-1 font-mono"
                      />
                      <Button
                        size="sm"
                        onClick={() => void onSaveGateway({ accountId, gatewayId })}
                        disabled={!isGatewayDirty || isBusy}
                      >
                        Save
                      </Button>
                    </div>
                  </SettingRow>
                </>
              )}

              <SettingRow
                title={
                  <span className="flex items-center gap-2">
                    {hasGatewayIds ? 'Gateway token' : 'API key'}
                    {view.hasKey ? (
                      <Chip tone="neutral">Saved</Chip>
                    ) : (
                      <Chip tone="neutral">Not set</Chip>
                    )}
                  </span>
                }
                description={
                  hasGatewayIds
                    ? 'A Cloudflare API token with AI Gateway Run. It is what tells Cloudflare whose stored provider keys or credits to spend. Encrypted on this machine.'
                    : 'Encrypted on this machine. Never leaves it except to this provider.'
                }
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
                      aria-label={hasGatewayIds ? 'Gateway token' : `${spec.label} API key`}
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
                  {isMissingIds
                    ? 'Both ids are needed before the gateway can be reached'
                    : hasGatewayIds
                      ? 'Check the gateway answers'
                      : view.hasKey
                        ? 'Check the key still works'
                        : `Add a ${spec.label} key to use it`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onTest}
                  // Cloudflare's token is optional, so what makes it testable is
                  // the pair of ids rather than a saved credential.
                  disabled={(hasGatewayIds ? isMissingIds : !view.hasKey) || isTesting}
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
