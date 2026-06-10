import { cn } from '../../lib/cn'

/**
 * Lightweight table primitives that give every data table the same
 * borders, header styling, hover states and density. Compose them like
 * native table elements but skip the repetitive Tailwind.
 */

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function THead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'sticky top-0 z-10 bg-surface-muted text-[11px] font-medium uppercase tracking-wide text-ink-muted',
        className,
      )}
      {...props}
    >
      {children}
    </thead>
  )
}

export function TH({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-3 py-2 font-medium', className)} {...props}>
      {children}
    </th>
  )
}

export function TBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-line', className)} {...props}>
      {children}
    </tbody>
  )
}

interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean
}

export function TR({ interactive, className, children, ...props }: TRProps) {
  return (
    <tr
      className={cn(interactive && 'cursor-pointer hover:bg-surface-muted/70 transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2 align-middle', className)} {...props}>
      {children}
    </td>
  )
}
