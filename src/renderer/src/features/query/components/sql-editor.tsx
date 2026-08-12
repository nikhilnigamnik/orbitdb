import * as React from 'react'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput
} from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { sql, type SQLNamespace } from '@codemirror/lang-sql'
import { tags } from '@lezer/highlight'
import { cn } from '@renderer/lib/utils'
import type { DatabaseEngine } from '@renderer/types'
import { dialectFor } from '../lib/sql-completion'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  /** Receives the current document, not the last value prop - see the keymap. */
  onSubmit: (sql: string) => void
  disabled?: boolean
  className?: string
  engine?: DatabaseEngine
  /** Tables and columns for completion. Absent until the schema loads. */
  schema?: SQLNamespace
}

/**
 * Colours come from the app's CSS variables rather than a packaged CodeMirror
 * theme, so the editor cannot drift from the rest of the UI when a token changes.
 */
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--color-accent-text)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-success)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-orange)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--color-text-subtle)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--color-text-muted)' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: 'var(--color-info)' },
  { tag: tags.variableName, color: 'var(--color-text)' }
])

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '12px', backgroundColor: 'var(--color-input)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      lineHeight: '1.6',
      overflow: 'auto'
    },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--color-accent-text)' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-input)',
      color: 'var(--color-text-subtle)',
      border: 'none',
      paddingLeft: '8px'
    },
    '.cm-activeLine': { backgroundColor: 'var(--color-surface-elevated)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--color-text-muted)'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklab, var(--color-accent) 30%, transparent)'
    },
    '.cm-cursor': { borderLeftColor: 'var(--color-accent-text)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'color-mix(in oklab, var(--color-accent) 25%, transparent)',
      outline: 'none'
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
    },
    '.cm-tooltip-autocomplete ul li': { padding: '3px 8px', color: 'var(--color-text-muted)' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--color-surface-elevated)',
      color: 'var(--color-text)'
    },
    '.cm-completionIcon': { display: 'none' },
    '.cm-completionDetail': { color: 'var(--color-text-subtle)', fontStyle: 'normal' }
  },
  { dark: true }
)

export function SqlEditor({
  value,
  onChange,
  onSubmit,
  disabled,
  className,
  engine = 'postgres',
  schema
}: SqlEditorProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  // Callbacks reach the editor through refs: the extensions are built once, and
  // a listener capturing the first render's props would report to a stale page.
  const onChangeRef = React.useRef(onChange)
  const onSubmitRef = React.useRef(onSubmit)
  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit

  // Reconfigured rather than rebuilt, so switching connection or loading the
  // schema does not throw away the document, the history or the cursor.
  const languageCompartment = React.useRef(new Compartment())
  const editableCompartment = React.useRef(new Compartment())

  const languageExtension = React.useCallback(
    (): Extension => sql({ dialect: dialectFor(engine), schema, upperCaseKeywords: false }),
    [engine, schema]
  )

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          closeBrackets(),
          indentOnInput(),
          highlightActiveLine(),
          autocompletion({ activateOnTyping: true, icons: false }),
          placeholder('-- Write SQL here. ⌘/Ctrl+Enter to run.'),
          // Highest precedence so Enter runs the query rather than being taken
          // by the completion list or by newline insertion.
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: (view) => {
                  // The document, not the `value` prop: typing and running in
                  // the same tick would otherwise submit the text React had
                  // before its re-render.
                  onSubmitRef.current(view.state.doc.toString())
                  return true
                }
              }
            ])
          ),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(highlightStyle),
          editorTheme,
          EditorView.lineWrapping,
          languageCompartment.current.of(languageExtension()),
          editableCompartment.current.of(EditorView.editable.of(!disabled)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Built once. Everything that can change afterwards is either a ref or a
    // compartment, both handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only when the two have actually diverged - echoing every keystroke back
  // would reset the cursor to the end of the document on each character.
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(languageExtension())
    })
  }, [languageExtension])

  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled))
    })
  }, [disabled])

  return (
    <div
      ref={hostRef}
      data-testid="sql-editor"
      className={cn('h-full min-h-0 overflow-hidden bg-input', disabled && 'opacity-60', className)}
    />
  )
}
