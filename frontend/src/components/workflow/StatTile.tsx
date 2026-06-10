import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

interface StatTileProps {
  value: number
  label: string
  to?: string
  accent?: string
  className?: string
}

/** Compact vertical stat tile: accent bar, big value, quiet label. */
export function StatTile({ value, label, to, accent = 'bg-brand-500', className }: StatTileProps) {
  const inner = (
    <>
      <span className={cn('h-1 w-6 rounded-full', accent)} />
      <span className="mt-2.5 text-2xl font-semibold leading-none tracking-tight text-ink">{value}</span>
      <span className="mt-1 text-xs text-ink-muted">{label}</span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={cn('tile tile-interactive min-h-[88px] items-start justify-start', className)}
      >
        {inner}
      </Link>
    )
  }

  return <div className={cn('tile min-h-[88px] items-start', className)}>{inner}</div>
}
