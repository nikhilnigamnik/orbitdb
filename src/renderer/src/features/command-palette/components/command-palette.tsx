import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  IconDatabase,
  IconTable,
  IconTerminal2,
  IconHistory,
  IconPlug,
  IconPlugOff,
  IconSearch,
  IconCornerDownLeft,
  IconClock
} from '@tabler/icons-react'
import { Kbd } from '@renderer/components/ui/kbd'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { loadRecent, type TableRef } from '@renderer/features/database/lib/table-prefs'
import type { ActiveConnectionMeta, TableInfo } from '@renderer/types'
import { Chip } from '@renderer/components/ui/chip'

interface PaletteTable {
  schema: string
  name: string
  type: TableInfo['type']
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const OVERLAY_CLASSES = 'fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-fade-in'

const CONTENT_CLASSES = [
  'fixed inset-x-0 top-[14vh] z-50 mx-auto w-[min(600px,calc(100vw-2rem))]',
  'overflow-hidden rounded-2xl border border-border bg-surface',
  'shadow-2xl shadow-black/60',
  'animate-scale-in'
].join(' ')

const COMMAND_CLASSES = [
  'flex flex-col',
  '[&_[cmdk-input]]:h-12 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:bg-transparent [&_[cmdk-input]]:px-4 [&_[cmdk-input]]:pl-11',
  '[&_[cmdk-input]]:text-xs [&_[cmdk-input]]:text-text [&_[cmdk-input]]:outline-none',
  '[&_[cmdk-input]]:placeholder:text-text-subtle',
  '[&_[cmdk-list]]:max-h-[56vh] [&_[cmdk-list]]:overflow-y-auto [&_[cmdk-list]]:scroll-py-1 [&_[cmdk-list]]:p-2',
  '[&_[cmdk-group]]:mb-1 [&_[cmdk-group]:last-child]:mb-0',
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2',
  '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
  '[&_[cmdk-group-heading]]:text-text-subtle',
  '[&_[cmdk-empty]]:flex [&_[cmdk-empty]]:flex-col [&_[cmdk-empty]]:items-center [&_[cmdk-empty]]:justify-center [&_[cmdk-empty]]:gap-1 [&_[cmdk-empty]]:py-10',
  '[&_[cmdk-empty]]:text-xs [&_[cmdk-empty]]:text-text-subtle'
].join(' ')

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { connections, active, connect, disconnect, isConnecting } = useConnection()

  const [tables, setTables] = React.useState<PaletteTable[]>([])
  const [tablesError, setTablesError] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  const [recents, setRecents] = React.useState<TableRef[]>([])

  React.useEffect(() => {
    if (!open || !active) return
    setRecents(loadRecent(active.connectionId))
  }, [open, active])

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  React.useEffect(() => {
    if (!open || !active) return
    if (fetchedFor.current === active.connectionId) return
    fetchedFor.current = active.connectionId
    void fetchAllTables(active).then(
      (rows) => {
        setTables(rows)
        setTablesError(null)
      },
      (err) => {
        setTables([])
        setTablesError(err instanceof Error ? err.message : String(err))
      }
    )
  }, [open, active])

  React.useEffect(() => {
    if (!active) {
      fetchedFor.current = null
      setTables([])
    }
  }, [active])

  async function runConnect(id: string) {
    close()
    try {
      await connect(id)
      navigate(ROUTES.database)
    } catch {
      // connect() surfaces the error via context state
    }
  }

  function runNavigate(path: string) {
    close()
    navigate(path)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter
      loop
      className={COMMAND_CLASSES}
      overlayClassName={OVERLAY_CLASSES}
      contentClassName={CONTENT_CLASSES}
    >
      <div className="relative border-b border-border">
        <IconSearch
          size={14}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle"
        />
        <Command.Input placeholder="Search tables, connections, actions…" />
      </div>

      <Command.List>
        <Command.Empty>
          <IconSearch size={20} className="text-text-subtle/70" />
          <span>No results found.</span>
        </Command.Empty>

        <Command.Group heading="Actions">
          <PaletteItem
            icon={<IconTerminal2 size={14} />}
            label="Open SQL editor"
            onSelect={() => runNavigate(ROUTES.query)}
            keywords={['sql', 'query', 'editor']}
          />
          <PaletteItem
            icon={<IconHistory size={14} />}
            label="Open query logs"
            onSelect={() => runNavigate(ROUTES.logs)}
            keywords={['logs', 'history']}
          />
          <PaletteItem
            icon={<IconDatabase size={14} />}
            label="Manage connections"
            onSelect={() => runNavigate(ROUTES.connections)}
            keywords={['connections', 'manage']}
          />
          {active && (
            <PaletteItem
              icon={<IconPlugOff size={14} />}
              label={`Disconnect from ${active.currentDatabase}`}
              onSelect={() => {
                close()
                void disconnect()
              }}
              keywords={['disconnect', 'close']}
              tone="danger"
            />
          )}
        </Command.Group>

        {active && recents.length > 0 && (
          <Command.Group heading="Recent">
            {recents.map((r) => (
              <PaletteItem
                key={`${r.schema}.${r.table}`}
                icon={<IconClock size={14} />}
                label={r.table}
                secondary={r.schema}
                onSelect={() => runNavigate(tableRoute(r.schema, r.table))}
                keywords={[r.schema, r.table]}
              />
            ))}
          </Command.Group>
        )}

        {connections.length > 0 && (
          <Command.Group heading="Connections">
            {connections.map((c) => {
              const isActive = active?.connectionId === c.id
              return (
                <PaletteItem
                  key={c.id}
                  icon={<IconPlug size={14} />}
                  label={c.name}
                  secondary={`${c.engine} · ${c.host || c.database}`}
                  tag={isActive ? 'connected' : undefined}
                  tagTone={isActive ? 'success' : undefined}
                  disabled={isConnecting}
                  onSelect={() => {
                    if (isActive) runNavigate(ROUTES.database)
                    else void runConnect(c.id)
                  }}
                  keywords={[c.name, c.engine, c.host, c.database].filter(Boolean) as string[]}
                />
              )
            })}
          </Command.Group>
        )}

        {active && tables.length > 0 && (
          <Command.Group heading="Tables">
            {tables.map((t) => (
              <PaletteItem
                key={`${t.schema}.${t.name}`}
                icon={<IconTable size={14} />}
                label={t.name}
                secondary={t.schema}
                tag={t.type !== 'table' ? t.type.replace('_', ' ') : undefined}
                onSelect={() => runNavigate(tableRoute(t.schema, t.name))}
                keywords={[t.schema, t.name]}
              />
            ))}
          </Command.Group>
        )}

        {active && tables.length === 0 && fetchedFor.current === active.connectionId && (
          <p className="px-3 py-3 text-xs text-text-subtle">
            {tablesError ? `Couldn't load tables: ${tablesError}` : 'No tables in this database.'}
          </p>
        )}
      </Command.List>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-elevated/30 px-3 py-2 text-xs text-text-subtle">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <IconCornerDownLeft size={9} />
            </Kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
        {active && (
          <span className="truncate font-mono">
            {active.currentDatabase}@{active.currentUser}
          </span>
        )}
      </div>
    </Command.Dialog>
  )
}

interface PaletteItemProps {
  icon: React.ReactNode
  label: string
  secondary?: string
  tag?: string
  tagTone?: 'default' | 'success'
  shortcut?: string
  onSelect: () => void
  keywords?: string[]
  disabled?: boolean
  tone?: 'default' | 'danger'
}

function PaletteItem({
  icon,
  label,
  secondary,
  tag,
  tagTone = 'default',
  shortcut,
  onSelect,
  keywords,
  disabled,
  tone = 'default'
}: PaletteItemProps) {
  const toneText =
    tone === 'danger'
      ? 'text-red-400/80 aria-selected:text-red-300 aria-selected:bg-red-500/10'
      : 'text-text-muted aria-selected:bg-surface-elevated aria-selected:text-text'

  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      value={[label, ...(keywords ?? [])].join(' ')}
      className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors aria-selected:[&_.kbd-shortcut]:opacity-100 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 ${toneText}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
          tone === 'danger'
            ? 'border-red-500/20 bg-red-500/10 text-red-400 group-aria-selected:border-red-500/30 group-aria-selected:bg-red-500/15'
            : 'border-border bg-surface-elevated text-text-muted group-aria-selected:border-border-strong group-aria-selected:bg-surface group-aria-selected:text-text'
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium">{label}</span>
        {secondary && (
          <span className="truncate font-mono text-xs text-text-subtle">{secondary}</span>
        )}
      </span>
      {tag && <Chip tone={tagTone === 'success' ? 'emerald' : 'neutral'}>{tag}</Chip>}
      {shortcut && (
        <span className="kbd-shortcut flex shrink-0 items-center gap-1 opacity-0 transition-opacity">
          <Kbd>⌘</Kbd>
          <Kbd>{shortcut}</Kbd>
        </span>
      )}
    </Command.Item>
  )
}

async function fetchAllTables(active: ActiveConnectionMeta): Promise<PaletteTable[]> {
  const schemas = await unwrap(window.api.db.listSchemas(active.connectionId))
  const lists = await Promise.all(
    schemas.map(async (s) => {
      try {
        const tables = await unwrap(window.api.db.listTables(active.connectionId, s.name))
        return tables.map<PaletteTable>((t) => ({ schema: t.schema, name: t.name, type: t.type }))
      } catch {
        return []
      }
    })
  )
  return lists.flat()
}
