import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

export interface SettingsSectionItem {
  slug: string
  label: string
}

interface SettingsNavProps {
  sections: readonly SettingsSectionItem[]
}

/**
 * Centered horizontal section nav for Settings — a segmented pill bar that
 * mirrors the app's PipelineStepper language. Wraps gracefully and scrolls
 * horizontally on small screens. The active pill uses the brand color.
 */
export function SettingsNav({ sections }: SettingsNavProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-px">
      <div className="inline-flex min-w-full gap-1 rounded-xl border border-line bg-surface p-1 shadow-tile sm:flex-wrap">
        {sections.map((section) => (
          <NavLink
            key={section.slug}
            to={`/settings/${section.slug}`}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white shadow-tile'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )
            }
          >
            {section.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
