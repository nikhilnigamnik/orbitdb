import { ENGINE_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { DatabaseEngine } from '@renderer/types'

import { ENGINE_ICON } from './engine-icons'

interface ConnectionEnginePickerProps {
  value: DatabaseEngine
  onChange: (engine: DatabaseEngine) => void
}

const ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'd1']

const ENGINE_STYLES: Record<DatabaseEngine, { bg: string; iconClass: string; tagline: string }> = {
  postgres: { bg: 'bg-info/10', iconClass: 'text-info', tagline: 'PostgreSQL' },
  mysql: { bg: 'bg-orange/10', iconClass: 'text-orange', tagline: 'MySQL / MariaDB' },
  d1: { bg: 'bg-warning/12', iconClass: 'text-warning', tagline: 'Cloudflare SQLite' }
}

export function ConnectionEnginePicker({ value, onChange }: ConnectionEnginePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ENGINES.map((engine) => {
        const style = ENGINE_STYLES[engine]
        const Icon = ENGINE_ICON[engine]
        const isSelected = value === engine
        return (
          <button
            key={engine}
            type="button"
            onClick={() => onChange(engine)}
            aria-pressed={isSelected}
            title={style.tagline}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-surface px-2 py-3 text-center transition-[background-color,box-shadow]',
              isSelected
                ? 'shadow-control ring-2 ring-accent'
                : 'shadow-control hover:bg-surface-elevated/60'
            )}
          >
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-lg',
                style.bg,
                style.iconClass
              )}
              aria-hidden
            >
              <Icon className="size-4" />
            </div>
            <p
              className={cn(
                'truncate text-xs font-medium transition-colors',
                isSelected ? 'text-text' : 'text-text-muted'
              )}
            >
              {ENGINE_LABEL[engine]}
            </p>
          </button>
        )
      })}
    </div>
  )
}
