/**
 * Natural language to a WHERE clause, and the prompt that asks for it.
 *
 * The model's answer is repaired in main before it gets here, and anything it
 * could not repair arrives in `notes`. An empty filter set with notes is not an
 * answer: applying it would widen the view to the whole table and read as one,
 * so it is reported instead.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@renderer/components/ui/toast'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
import { ROUTES } from '@renderer/config/routes'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { buildFilterSuggestions } from '../lib/filter-suggestions'
import type { RowFilter, SortDirection, TableDetails } from '@renderer/types'

interface AiFilterOptions {
  connectionId: string
  details: TableDetails
  setFilters: (filters: RowFilter[]) => void
  setOrderBy: (column: string | null) => void
  setOrderDir: (direction: SortDirection) => void
  setOffset: (offset: number) => void
}

export function useAiFilter({
  connectionId,
  details,
  setFilters,
  setOrderBy,
  setOrderDir,
  setOffset
}: AiFilterOptions) {
  const navigate = useNavigate()
  const toast = useToast()

  // Built from introspection rather than the grid's columns: `details.columns`
  // is where enumValues lives, and an enum label is the one example value we can
  // offer without querying the rows.
  const aiSuggestions = React.useMemo(
    () => buildFilterSuggestions(details.columns),
    [details.columns]
  )
  const aiPrompt = useDisclosure(false)
  const [isAiFiltering, setIsAiFiltering] = React.useState(false)

  const openAiPrompt = aiPrompt.open
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        openAiPrompt()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openAiPrompt])

  async function handleAiFilter(prompt: string) {
    setIsAiFiltering(true)
    try {
      const result = await unwrap(
        window.api.ai.filterTable({
          connectionId,
          schema: details.schema,
          table: details.name,
          prompt
        })
      )
      // Every condition was dropped. Applying an empty filter set would widen the
      // view to the whole table and read as an answer - say so and let the user
      // rephrase instead.
      if (result.filters.length === 0 && result.notes?.length) {
        toast.warning('Could not build that filter', { description: result.notes.join('\n') })
        return
      }
      setFilters(result.filters)
      setOrderBy(result.orderBy ?? null)
      setOrderDir(result.orderDir ?? 'asc')
      setOffset(0)
      aiPrompt.close()
      if (result.notes?.length) {
        toast.warning('Some conditions were dropped', { description: result.notes.join('\n') })
      }
    } catch (err) {
      const message = errorMessage(err)
      // A missing key is a setup step, not a failure - say what to do about it.
      if (isMissingAiKeyError(message)) {
        toast.error('AI needs an Anthropic API key', {
          description: 'It stays encrypted on this machine.',
          action: { label: 'Open settings', onClick: () => navigate(ROUTES.settings) }
        })
      } else {
        toast.error('AI filter failed', { description: message })
      }
    } finally {
      setIsAiFiltering(false)
    }
  }

  return { aiSuggestions, aiPrompt, isAiFiltering, handleAiFilter }
}
