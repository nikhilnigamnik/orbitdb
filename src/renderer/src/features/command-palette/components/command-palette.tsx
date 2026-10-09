import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  IconDatabase,
  IconTable,
  IconTerminal2,
  IconHistory,
  IconPlugOff,
  IconSearch,
  IconCornerDownLeft,
  IconClock,
  IconSun,
  IconMoon,
  IconDeviceDesktop
} from '@tabler/icons-react'
import { Chip } from '@renderer/components/ui/chip'
import { Kbd } from '@renderer/components/ui/kbd'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { useTheme } from '@renderer/features/settings/theme'
import { ENGINE_ICON } from '@renderer/features/connections/components/engine-icons'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { CONNECTION_TILE_CLASS } from '@renderer/config/site'
import { loadRecent, type TableRef } from '@renderer/features/database/lib/table-prefs'
import type {
  ActiveConnectionMeta,
  SavedConnection,
  TableInfo,
  ThemePreference
} from '@renderer/types'

import { PALETTE_TABLE_LIMIT, filterItems } from '../lib/palette-filter'

interface PaletteTable {
  schema: string
  name: string
  type: TableInfo['type']
}

interface PaletteAction {
  id: string
  icon: React.ReactNode
  label: string
  keywords: string[]
  onSelect: () => void
  tone?: 'default' | 'danger'
}

const THEME_ACTIONS: {
  theme: ThemePreference
  icon: React.ReactNode
  label: string
  keywords: string[]
}[] = [
  {
    theme: 'dark',
    icon: <IconMoon size={16} />,
    label: 'Switch to dark theme',
    keywords: ['dark']
  },
  {
    theme: 'light',
    icon: <IconSun size={16} />,
    label: 'Switch to light theme',
    keywords: ['light']
  },
  {
    theme: 'system',
    icon: <IconDeviceDesktop size={16} />,
    label: 'Use system theme',
    keywords: ['system', 'auto']
  }
]

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Same scrim as the Dialog primitive, so the palette dims the app the way every
// other modal does.
const OVERLAY_CLASSES = 'fixed inset-0 z-40 bg-overlay animate-fade-in'

const CONTENT_CLASSES = [
  'fixed inset-x-0 top-[14vh] z-50 mx-auto w-[min(640px,calc(100vw-2rem))]',
  'overflow-hidden rounded-2xl bg-popover text-text shadow-pop',
  'animate-scale-in'
].join(' ')

const COMMAND_CLASSES = [
  'flex flex-col',
  '[&_[cmdk-input]]:h-12 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:bg-transparent [&_[cmdk-input]]:pr-4 [&_[cmdk-input]]:pl-11',
  '[&_[cmdk-input]]:text-sm [&_[cmdk-input]]:text-text [&_[cmdk-input]]:outline-none',
  '[&_[cmdk-input]]:placeholder:text-text-subtle',
  '[&_[cmdk-list]]:max-h-[56vh] [&_[cmdk-list]]:overflow-y-auto [&_[cmdk-list]]:scroll-py-1.5 [&_[cmdk-list]]:p-1.5',
  '[&_[cmdk-group]]:mb-1 [&_[cmdk-group]:last-child]:mb-0',
  '[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-8 [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-2.5',
  '[&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle',
  '[&_[cmdk-empty]]:flex [&_[cmdk-empty]]:flex-col [&_[cmdk-empty]]:items-center [&_[cmdk-empty]]:justify-center [&_[cmdk-empty]]:gap-3 [&_[cmdk-empty]]:py-10',
  '[&_[cmdk-empty]]:text-sm [&_[cmdk-empty]]:font-medium [&_[cmdk-empty]]:text-text'
].join(' ')

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { connections, active, connect, disconnect, isConnecting } = useConnection()
  const { theme, setTheme } = useTheme()

  const [tables, setTables] = React.useState<PaletteTable[]>([])
  const [tablesError, setTablesError] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  const [recents, setRecents] = React.useState<TableRef[]>([])
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

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

  function runSetTheme(next: ThemePreference) {
    close()
    // A failed save already put the old theme back; the palette has closed,
    // so there is nowhere left to report it.
    void setTheme(next).catch(() => undefined)
  }

  const themeActions: PaletteAction[] = THEME_ACTIONS.filter((a) => a.theme !== theme).map((a) => ({
    id: `action:theme-${a.theme}`,
    icon: a.icon,
    label: a.label,
    keywords: ['theme', 'appearance', 'mode', ...a.keywords],
    onSelect: () => runSetTheme(a.theme)
  }))

  const actions: PaletteAction[] = [
    {
      id: 'action:sql',
      icon: <IconTerminal2 size={16} />,
      label: 'Open SQL editor',
      keywords: ['sql', 'query', 'editor'],
      onSelect: () => runNavigate(ROUTES.query)
    },
    {
      id: 'action:logs',
      icon: <IconHistory size={16} />,
      label: 'Open query logs',
      keywords: ['logs', 'history'],
      onSelect: () => runNavigate(ROUTES.logs)
    },
    {
      id: 'action:connections',
      icon: <IconDatabase size={16} />,
      label: 'Manage connections',
      keywords: ['connections', 'manage'],
      onSelect: () => runNavigate(ROUTES.connections)
    },
    ...(active
      ? [
          {
            id: 'action:disconnect',
            icon: <IconPlugOff size={16} />,
            label: `Disconnect from ${active.currentDatabase}`,
            keywords: ['disconnect', 'close'],
            onSelect: () => {
              close()
              void disconnect()
            },
            tone: 'danger' as const
          }
        ]
      : []),
    // Found by typing ("dark", "theme"), not listed on an empty palette, where
    // they would push the actions people open it for further down.
    ...(search.trim() ? themeActions : [])
  ]

  // Filtering is done here rather than by cmdk: it scores and reorders every
  // item it holds on each keystroke, which degrades badly past a couple of
  // thousand tables. Here the tables are capped before they are rendered.
  const shownActions = filterItems(actions, search, (a) => [a.label, ...a.keywords]).items
  const shownRecents = active ? filterItems(recents, search, (r) => [r.table, r.schema]).items : []
  const shownConnections = filterItems(connections, search, (c) =>
    [c.name, c.engine, c.host, c.database].filter((field): field is string => !!field)
  ).items
  const shownTables = React.useMemo(
    () => filterItems(tables, search, (t) => [t.name, t.schema], PALETTE_TABLE_LIMIT),
    [tables, search]
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter={false}
      loop
      className={COMMAND_CLASSES}
      overlayClassName={OVERLAY_CLASSES}
      contentClassName={CONTENT_CLASSES}
    >
      <div className="relative border-b border-border">
        <IconSearch
          size={16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-subtle"
        />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search tables, connections, actions…"
        />
      </div>

      <Command.List>
        <Command.Empty>
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
            <IconSearch size={20} />
          </span>
          <span>No results found.</span>
        </Command.Empty>

        {shownActions.length > 0 && (
          <Command.Group heading="Actions">
            {shownActions.map((action) => (
              <PaletteItem
                key={action.id}
                value={action.id}
                icon={action.icon}
                label={action.label}
                onSelect={action.onSelect}
                tone={action.tone}
              />
            ))}
          </Command.Group>
        )}

        {shownRecents.length > 0 && (
          <Command.Group heading="Recent">
            {shownRecents.map((r) => (
              <PaletteItem
                key={`${r.schema}.${r.table}`}
                value={`recent:${r.schema}.${r.table}`}
                icon={<IconClock size={16} />}
                label={r.table}
                secondary={r.schema}
                onSelect={() => runNavigate(tableRoute(r.schema, r.table))}
              />
            ))}
          </Command.Group>
        )}

        {shownConnections.length > 0 && (
          <Command.Group heading="Connections">
            {shownConnections.map((c) => {
              const isActive = active?.connectionId === c.id
              return (
                <PaletteItem
                  key={c.id}
                  value={`connection:${c.id}`}
                  icon={<ConnectionTile connection={c} />}
                  label={c.name}
                  secondary={`${c.engine} · ${c.host || c.database}`}
                  tag={isActive ? 'connected' : undefined}
                  tagTone={isActive ? 'success' : undefined}
                  disabled={isConnecting}
                  onSelect={() => {
                    if (isActive) runNavigate(ROUTES.database)
                    else void runConnect(c.id)
                  }}
                />
              )
            })}
          </Command.Group>
        )}

        {active && shownTables.items.length > 0 && (
          <Command.Group heading="Tables">
            {shownTables.items.map((t) => (
              <PaletteItem
                key={`${t.schema}.${t.name}`}
                value={`table:${t.schema}.${t.name}`}
                icon={<IconTable size={16} />}
                label={t.name}
                secondary={t.schema}
                tag={t.type !== 'table' ? t.type.replace('_', ' ') : undefined}
                onSelect={() => runNavigate(tableRoute(t.schema, t.name))}
              />
            ))}
            {shownTables.total > shownTables.items.length && (
              <p className="px-2.5 py-2 text-xs text-text-muted">
                Showing {formatNumber(shownTables.items.length)} of{' '}
                {formatNumber(shownTables.total)} tables - keep typing to narrow
              </p>
            )}
          </Command.Group>
        )}

        {active && tables.length === 0 && fetchedFor.current === active.connectionId && (
          <p className="px-2.5 py-2 text-xs text-text-muted">
            {tablesError ? `Couldn't load tables: ${tablesError}` : 'No tables in this database.'}
          </p>
        )}
      </Command.List>

      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border px-3 text-[12px] text-text-subtle">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </span>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <IconCornerDownLeft size={10} />
            </Kbd>
            select
          </span>
          <span className="flex items-center gap-1.5">
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
  /** Unique across the whole palette: cmdk tracks the selection by it. */
  value: string
  icon: React.ReactNode
  label: string
  secondary?: string
  tag?: string
  tagTone?: 'default' | 'success'
  shortcut?: string
  onSelect: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}

function PaletteItem({
  value,
  icon,
  label,
  secondary,
  tag,
  tagTone = 'default',
  shortcut,
  onSelect,
  disabled,
  tone = 'default'
}: PaletteItemProps) {
  const isDanger = tone === 'danger'

  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      value={value}
      className={cn(
        'group flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors aria-selected:bg-surface-elevated aria-selected:[&_.kbd-shortcut]:opacity-100 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50',
        isDanger ? 'text-danger' : 'text-text'
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center',
          isDanger ? 'text-danger' : 'text-text-subtle group-aria-selected:text-text-muted'
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-medium">{label}</span>
        {secondary && <span className="truncate text-[12px] text-text-subtle">{secondary}</span>}
      </span>
      {tag && <Chip tone={tagTone === 'success' ? 'emerald' : 'neutral'}>{tag}</Chip>}
      {shortcut && (
        <span className="kbd-shortcut flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity">
          <Kbd>⌘</Kbd>
          <Kbd>{shortcut}</Kbd>
        </span>
      )}
    </Command.Item>
  )
}

/**
 * The connection's own tile, as the sidebar's switcher draws it: a coloured
 * initial when the user gave it a colour, the engine's mark otherwise.
 */
function ConnectionTile({ connection }: { connection: SavedConnection }) {
  if (connection.color) {
    return (
      <span
        className={cn(
          'flex size-5 items-center justify-center rounded-md text-[12px] font-semibold',
          CONNECTION_TILE_CLASS[connection.color]
        )}
      >
        {connection.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  const EngineIcon = ENGINE_ICON[connection.engine]
  return (
    <span className="flex size-5 items-center justify-center rounded-md bg-control shadow-control">
      <EngineIcon className="size-3.5" />
    </span>
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
