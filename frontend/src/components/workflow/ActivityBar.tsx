import { useQuery } from '@tanstack/react-query'
import { FileText, Mail, Radar, Rocket, Sparkles, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fetchAutomation } from '../../api/client'
import { cn } from '../../lib/cn'
import { useActivity } from './ActivityContext'

/** One label/style per automation phase, shared with the Home automation tile so
 * the same activity never has two names. */
export const AUTOMATION_PHASES: Record<string, { label: string; icon: LucideIcon; chip: string }> = {
  queued: { label: 'Starting…', icon: Timer, chip: 'bg-brand-50 text-brand-700 ring-brand-200' },
  discovering: { label: 'Discovering jobs…', icon: Radar, chip: 'bg-blue-50 text-blue-700 ring-blue-200' },
  assessing: { label: 'Assessing matches…', icon: Sparkles, chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  expiring: { label: 'Retiring stale postings…', icon: Timer, chip: 'bg-surface-muted text-ink-muted ring-line' },
  digesting: { label: 'Emailing digest…', icon: Mail, chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
}

const BROWSER_META: Record<string, { label: string; icon: LucideIcon; chip: string }> = {
  assess: { label: 'Assessing matches', icon: Sparkles, chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  tailor: { label: 'Tailoring CVs', icon: FileText, chip: 'bg-purple-50 text-purple-700 ring-purple-200' },
  apply: { label: 'Auto-applying', icon: Rocket, chip: 'bg-green-50 text-green-700 ring-green-200' },
}

function Chip({ icon: Icon, label, detail, className }: {
  icon: LucideIcon
  label: string
  detail?: string
  className: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', className)}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      <Icon size={13} />
      {label}
      {detail && <span className="font-normal opacity-75">{detail}</span>}
    </span>
  )
}

/** Slim bar under the stepper, visible on EVERY page while anything runs:
 * the server-side automation cycle (with its current phase) and/or
 * browser-driven work. Renders nothing when the pipeline is idle. */
export function ActivityBar() {
  const { activity } = useActivity()
  const { data: auto } = useQuery({
    queryKey: ['automation'],
    queryFn: fetchAutomation,
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 30_000),
  })
  const run = auto?.running ? auto.last_run : null
  if (!run && !activity) return null

  const phase = run ? AUTOMATION_PHASES[run.phase] ?? AUTOMATION_PHASES.queued : null
  const runDetail = run
    ? [run.found > 0 && `${run.found} found`, run.assessed > 0 && `${run.assessed} assessed`]
        .filter(Boolean).join(' · ') || undefined
    : undefined

  const browser = activity ? BROWSER_META[activity.kind] : null
  const browserDetail = activity?.total
    ? `${activity.done ?? 0}/${activity.total}${activity.browser ? ' · in your browser' : ''}`
    : activity?.browser ? 'in your browser' : 'on the server'

  return (
    <div className="shrink-0 border-b border-line bg-white px-4 py-1.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        {run && phase && (
          <Chip icon={phase.icon} label={`Automation · ${phase.label}`} detail={runDetail} className={phase.chip} />
        )}
        {activity && browser && (
          <Chip icon={browser.icon} label={browser.label} detail={browserDetail} className={browser.chip} />
        )}
      </div>
    </div>
  )
}
