import { cn } from '../../lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

const paddingClass = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

export function Card({ padding = 'md', hover, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-surface shadow-tile ring-1 ring-ink/5',
        paddingClass[padding],
        hover && 'transition-all hover:-translate-y-0.5 hover:shadow-tile-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
