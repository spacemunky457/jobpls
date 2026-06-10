import { cn } from '../../lib/cn'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'danger'
}

const variants = {
  default: 'bg-surface-muted text-ink-muted border border-line',
  brand: 'bg-brand-50 text-brand-700 border border-brand-200',
  success: 'bg-green-50 text-green-800 border border-green-200',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200',
  danger: 'bg-red-50 text-red-800 border border-red-200',
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span className={cn('badge', variants[variant], className)} {...props}>
      {children}
    </span>
  )
}
