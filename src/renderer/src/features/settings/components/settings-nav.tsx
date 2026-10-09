import { useLocation, useNavigate } from 'react-router-dom'
import { IconChevronLeft, type Icon } from '@tabler/icons-react'
import { ROUTES } from '@renderer/config/routes'
import { cn } from '@renderer/lib/utils'

export interface SettingsNavItem {
  id: string
  label: string
  icon: Icon
}

interface SettingsNavProps {
  items: SettingsNavItem[]
  activeId: string
  onSelect: (id: string) => void
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Attio's settings take over the whole window: the app sidebar gives way to
 * this one, which holds a way back and the list of settings sections.
 */
export function SettingsNav({ items, activeId, onSelect }: SettingsNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  function goBack() {
    // 'default' is the key of the first entry in this window's history, so
    // there is nothing to go back to - land somewhere sensible instead.
    if (location.key === 'default') navigate(ROUTES.connections)
    else navigate(-1)
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg">
      {/* Same top row as the app sidebar: room for the macOS traffic lights,
          and the window's drag handle. */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center pr-2 [-webkit-app-region:drag]',
          IS_MAC ? 'pl-[84px]' : 'pl-2'
        )}
      >
        <button
          type="button"
          onClick={goBack}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-lg pr-2 pl-1 text-sm font-medium text-text-muted transition-colors hover:bg-surface-active/60 hover:text-text"
        >
          <IconChevronLeft size={16} stroke={1.75} />
          Back
        </button>
      </div>

      <div className="px-4 pt-3 pb-1.5 text-[13px] font-medium text-text-subtle">Settings</div>
      <nav aria-label="Settings sections" className="flex flex-col gap-px px-2">
        {items.map(({ id, label, icon: ItemIcon }) => {
          const isActive = id === activeId
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-text transition-colors',
                isActive ? 'bg-surface-active' : 'hover:bg-surface-active/60'
              )}
            >
              <ItemIcon size={16} stroke={1.75} className="shrink-0 text-text-muted" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
