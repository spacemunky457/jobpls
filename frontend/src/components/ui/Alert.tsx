import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

type AlertVariant = 'info' | 'success' | 'error'

interface AlertProps {
  variant?: AlertVariant
  children: React.ReactNode
  className?: string
}

const styles: Record<AlertVariant, { box: string; Icon: typeof Info }> = {
  info: { box: 'bg-blue-50 border-blue-200 text-blue-900', Icon: Info },
  success: { box: 'bg-green-50 border-green-200 text-green-900', Icon: CheckCircle },
  error: { box: 'bg-red-50 border-red-200 text-red-900', Icon: AlertCircle },
}

export function Alert({ variant = 'info', children, className }: AlertProps) {
  const { box, Icon } = styles[variant]
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', box, className)}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  )
}
