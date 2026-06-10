import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn',
  ghost: 'btn-ghost',
}

export function Button({ variant = 'secondary', className, children, ...props }: ButtonProps) {
  return (
    <button className={cn(variants[variant], className)} {...props}>
      {children}
    </button>
  )
}
