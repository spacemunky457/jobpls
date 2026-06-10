import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  subtitle?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Right-hand slide-over panel for detail views. Closes on backdrop click
 * or Escape, and locks body scroll while open.
 */
export function Drawer({ open, onClose, title, subtitle, footer, children, className }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-xl animate-slide-in flex-col bg-surface shadow-pop sm:my-2 sm:mr-2 sm:rounded-2xl sm:ring-1 sm:ring-ink/5',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-sm text-ink-muted">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
