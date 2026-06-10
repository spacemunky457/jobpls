import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import type { Stats } from '../../api/client'

const STEPS = [
  { to: '/', label: 'Overview', end: true, statKey: 'total' as const, hint: 'Discover & summary' },
  { to: '/inbox', label: 'Review', end: false, statKey: 'new' as const, hint: 'Assess & approve' },
  { to: '/applications', label: 'Prepare', end: false, statKey: 'approved' as const, hint: 'Tailor drafts' },
  { to: '/tracker', label: 'Track', end: false, statKey: 'applied' as const, hint: 'Sent applications' },
]

interface PipelineStepperProps {
  stats?: Stats
}

function stepStat(statKey: typeof STEPS[number]['statKey'], stats: Stats) {
  switch (statKey) {
    case 'total': return `${stats.new} new`
    case 'new': return `${stats.assessed} assessed`
    case 'approved': return `${stats.drafted} drafted`
    case 'applied': return `${stats.applied} applied`
  }
}

export function PipelineStepper({ stats }: PipelineStepperProps) {
  return (
    <nav className="shrink-0 border-b border-line bg-white">
      <div className="mx-auto w-full max-w-7xl overflow-x-auto px-3 py-2 sm:px-6">
        <div className="flex min-w-max items-stretch gap-1 rounded-2xl bg-surface-muted p-1">
          {STEPS.map((step, i) => (
            <NavLink
              key={step.to}
              to={step.to}
              end={step.end}
              className={({ isActive }) =>
                cn(
                  'group relative min-w-[128px] flex-1 rounded-xl px-3 py-1.5 transition-all',
                  isActive ? 'bg-surface shadow-tile ring-1 ring-ink/5' : 'hover:bg-white/60',
                )
              }
            >
              {({ isActive }) => (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors',
                      isActive ? 'bg-brand-600 text-white' : 'bg-white text-ink-muted ring-1 ring-line group-hover:text-ink',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-medium leading-tight', isActive ? 'text-ink' : 'text-ink-muted')}>
                      {step.label}
                    </span>
                    <span className={cn('block text-[11px] leading-tight', isActive ? 'text-brand-600' : 'text-ink-muted/80')}>
                      {stats ? stepStat(step.statKey, stats) : step.hint}
                    </span>
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
