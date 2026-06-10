import { cn } from '../../lib/cn'

type ContainerWidth = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Controls the max-width of the centered content area. */
  width?: ContainerWidth
}

const widthClass: Record<ContainerWidth, string> = {
  sm: 'max-w-2xl', // narrow forms / single-column reading
  md: 'max-w-4xl', // detail / list views
  lg: 'max-w-5xl', // dashboards
  xl: 'max-w-7xl', // wide tables
  full: 'max-w-none',
}

/**
 * Centers page content with a comfortable max-width.
 * Use as the root of a page so the main scroll area stays balanced
 * instead of hugging the left edge.
 */
export function Container({ width = 'lg', className, children, ...props }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full', widthClass[width], className)} {...props}>
      {children}
    </div>
  )
}
