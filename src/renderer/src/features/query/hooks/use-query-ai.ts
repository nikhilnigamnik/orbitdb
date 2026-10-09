import * as React from 'react'

import { useToast } from '@renderer/components/ui/toast'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import type { QueryResult } from '@renderer/types'

import { hasSqlBody } from '../lib/sql-text'

/** A run the database rejected, kept so "Fix with AI" knows what failed and why. */
export interface FailedRun {
  sql: string
  error: string
}

export interface QueryExplanation {
  sql: string
  text: string | null
  error: string | null
}

interface UseQueryAiOptions {
  connectionId: string
  sql: string
  setSql: (sql: string) => void
  /** Where an AI failure is shown when it is the only thing to show. */
  setResult: (result: QueryResult) => void
}

function failedResult(error: string): QueryResult {
  return {
    success: false,
    error,
    rows: [],
    fields: [],
    rowCount: null,
    command: null,
    durationMs: 0,
    truncated: false
  }
}

/**
 * The SQL editor's three AI actions: write or revise a query, fix one the
 * database rejected, and explain one. Every result lands in the editor for the
 * user to read and run - nothing here reaches the database.
 */
export function useQueryAi({ connectionId, sql, setSql, setResult }: UseQueryAiOptions) {
  const toast = useToast()
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isFixing, setIsFixing] = React.useState(false)
  const [explanation, setExplanation] = React.useState<QueryExplanation | null>(null)
  const explainRequest = React.useRef(0)

  /**
   * The draft is persisted on every keystroke, so overwriting it puts the old
   * text beyond reach - history only holds queries that were run.
   */
  function placeInEditor(next: string, message: string, description?: string) {
    const replaced = sql
    setSql(next)
    if (!hasSqlBody(replaced)) {
      if (description) toast.info(message, { description })
      return
    }
    toast.info(message, {
      description,
      action: { label: 'Undo', onClick: () => setSql(replaced) }
    })
  }

  /** `isRevision` edits the editor's query; otherwise a new one replaces it. */
  async function generate(prompt: string, isRevision: boolean): Promise<boolean> {
    if (!connectionId || isGenerating) return false
    setIsGenerating(true)
    try {
      const { sql: generated } = await unwrap(
        window.api.ai.generateSql({
          connectionId,
          prompt,
          currentSql: isRevision ? sql : undefined
        })
      )
      // Into the editor, not run. The model is told to prefer SELECT, but that
      // is a preference in a prompt - a misread request used to reach the
      // database with nothing in between.
      placeInEditor(generated, isRevision ? 'Updated the query' : 'Replaced the editor contents')
      return true
    } catch (err) {
      setResult(failedResult(errorMessage(err)))
      return false
    } finally {
      setIsGenerating(false)
    }
  }

  async function fix(run: FailedRun): Promise<void> {
    if (!connectionId || isFixing) return
    setIsFixing(true)
    try {
      const fixed = await unwrap(
        window.api.ai.fixSql({ connectionId, sql: run.sql, error: run.error })
      )
      if (!fixed.isChanged) {
        toast.info('The query itself looks right', { description: fixed.explanation })
        return
      }
      placeInEditor(fixed.sql, 'Fixed the query - review it, then run', fixed.explanation)
    } catch (err) {
      toast.error('Could not fix the query', { description: errorMessage(err) })
    } finally {
      setIsFixing(false)
    }
  }

  async function explain(): Promise<void> {
    if (!connectionId || !hasSqlBody(sql)) return
    // A second click while the first is in flight must not let the older,
    // slower answer land over the newer one.
    const request = ++explainRequest.current
    const target = sql
    setExplanation({ sql: target, text: null, error: null })
    try {
      const { explanation: text } = await unwrap(
        window.api.ai.explainSql({ connectionId, sql: target })
      )
      if (request === explainRequest.current) setExplanation({ sql: target, text, error: null })
    } catch (err) {
      if (request === explainRequest.current) {
        setExplanation({ sql: target, text: null, error: errorMessage(err) })
      }
    }
  }

  function closeExplanation() {
    explainRequest.current += 1
    setExplanation(null)
  }

  return {
    isGenerating,
    generate,
    isFixing,
    fix,
    explanation,
    explain,
    closeExplanation
  }
}
