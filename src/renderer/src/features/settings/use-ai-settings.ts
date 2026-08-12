import * as React from 'react'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import type { AiGatewayIds, AiModelId, AiProviderId, AiSettingsView } from '@renderer/types'

function settingsApi() {
  if (typeof window === 'undefined' || !window.api?.settings) {
    throw new Error('Settings IPC bridge unavailable - restart the dev server so preload reloads.')
  }
  return window.api.settings
}

interface UseAiSettings {
  settings: AiSettingsView | null
  isLoading: boolean
  isSaving: boolean
  isTesting: boolean
  setProvider: (provider: AiProviderId) => Promise<void>
  saveKey: (provider: AiProviderId, apiKey: string) => Promise<void>
  clearKey: (provider: AiProviderId) => Promise<void>
  setModel: (provider: AiProviderId, model: AiModelId) => Promise<void>
  testKey: (provider: AiProviderId) => Promise<void>
  setGateway: (input: AiGatewayIds) => Promise<void>
}

/**
 * Every mutation re-reads from main rather than patching local state: main is the
 * only place that knows whether the key was actually sealed, so believing our own
 * optimistic copy is how the UI ends up claiming a key is saved when it is not.
 */
export function useAiSettings(): UseAiSettings {
  const [settings, setSettings] = React.useState<AiSettingsView | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setSettings(await unwrap(settingsApi().getAi()))
  }, [])

  React.useEffect(() => {
    void (async () => {
      try {
        await refresh()
      } catch (err) {
        console.error('Failed to read AI settings', errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    })()
  }, [refresh])

  const mutate = React.useCallback(
    async (action: () => Promise<unknown>) => {
      setIsSaving(true)
      try {
        await action()
        await refresh()
      } finally {
        setIsSaving(false)
      }
    },
    [refresh]
  )

  return {
    settings,
    isLoading,
    isSaving,
    isTesting,
    setProvider: (provider) => mutate(() => unwrap(settingsApi().setAiProvider(provider))),
    saveKey: (provider, apiKey) => mutate(() => unwrap(settingsApi().setAiKey(provider, apiKey))),
    clearKey: (provider) => mutate(() => unwrap(settingsApi().clearAiKey(provider))),
    setModel: (provider, model) => mutate(() => unwrap(settingsApi().setAiModel(provider, model))),
    setGateway: (input) => mutate(() => unwrap(settingsApi().setGateway(input))),
    testKey: async (provider) => {
      setIsTesting(true)
      try {
        await unwrap(settingsApi().testAi(provider))
      } finally {
        setIsTesting(false)
      }
    }
  }
}
