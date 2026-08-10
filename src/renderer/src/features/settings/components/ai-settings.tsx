import * as React from 'react'
import { Spinner } from '@renderer/components/ui/spinner'
import { useToast } from '@renderer/components/ui/toast'
import { errorMessage } from '@renderer/lib/errors'
import { useAiSettings } from '@renderer/features/settings/use-ai-settings'
import { aiProvider } from '@renderer/config/site'
import type { AiModelId, AiProviderId } from '@renderer/types'
import { AiProviderCard } from './ai-provider-card'
import { SettingRow, SettingsCard } from './settings-card'

export function AiSettings() {
  const toast = useToast()
  const { settings, isLoading, setProvider, saveKey, clearKey, setModel, testKey } = useAiSettings()
  const [testing, setTesting] = React.useState<AiProviderId | null>(null)
  // Per provider, not global: saving one key should not freeze the other cards.
  const [busy, setBusy] = React.useState<AiProviderId | null>(null)

  /** Every action reports the same way, and names the provider it happened to. */
  async function run(provider: AiProviderId, whenFailed: string, action: () => Promise<void>) {
    setBusy(provider)
    try {
      await action()
    } catch (err) {
      toast.error(`${aiProvider(provider).label}: ${whenFailed}`, {
        description: errorMessage(err)
      })
      throw err
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) {
    return (
      <SettingsCard>
        <SettingRow
          title={
            <span className="flex items-center gap-2 text-text-muted">
              <Spinner size={13} className="text-text-subtle" />
              Reading settings…
            </span>
          }
        />
      </SettingsCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {settings?.providers.map((view) => (
        <AiProviderCard
          key={view.id}
          view={view}
          isActive={settings.active === view.id}
          isBusy={busy === view.id}
          isTesting={testing === view.id}
          onActivate={() =>
            void run(view.id, 'could not be activated', async () => {
              await setProvider(view.id)
              toast.success(`Using ${aiProvider(view.id).label}`)
            })
          }
          onSaveKey={(apiKey) =>
            run(view.id, 'key could not be saved', async () => {
              await saveKey(view.id, apiKey)
              toast.success(`${aiProvider(view.id).label} key saved`)
            })
          }
          onRemoveKey={() =>
            void run(view.id, 'key could not be removed', async () => {
              await clearKey(view.id)
              toast.success(`${aiProvider(view.id).label} key removed`)
            })
          }
          onChangeModel={(model: AiModelId) =>
            void run(view.id, 'model could not be changed', () => setModel(view.id, model))
          }
          onTest={() =>
            void (async () => {
              setTesting(view.id)
              try {
                await testKey(view.id)
                toast.success(`${aiProvider(view.id).label} key works`)
              } catch (err) {
                // The provider's own message names the cause - expired, revoked,
                // no credit - and is more use than anything we could write.
                toast.error(`${aiProvider(view.id).label} rejected the key`, {
                  description: errorMessage(err)
                })
              } finally {
                setTesting(null)
              }
            })()
          }
        />
      ))}
    </div>
  )
}
