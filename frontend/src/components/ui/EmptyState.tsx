import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({ icon, title, description, actionLabel, actionTo, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn('card text-center py-10 px-6', className)}>
      {icon && <div className="flex justify-center mb-3 text-ink-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">{description}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="inline-block mt-4">
          <Button variant="primary">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <div className="mt-4">
          <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  )
}
