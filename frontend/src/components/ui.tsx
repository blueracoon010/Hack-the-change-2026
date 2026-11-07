// Reusable UI building blocks. Use these instead of styling from scratch so every page looks consistent.
import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-brand text-white hover:brightness-110 shadow-sm shadow-brand/30',
    secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
    ghost: 'text-fg hover:bg-surface-2',
    danger: 'bg-danger text-white hover:brightness-110',
  }[variant]
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold transition disabled:opacity-60 disabled:cursor-not-allowed', styles, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ className, children, as: Tag = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string }) {
  return <Tag className={cx('rounded-2xl border border-line bg-surface p-5 shadow-sm', className)} {...rest}>{children}</Tag>
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }

export function Field({ label, hint, error, type, className, ...rest }: FieldProps) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx('w-full rounded-xl border bg-surface px-3.5 py-2.5 text-fg placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15', error ? 'border-danger' : 'border-line', isPassword && 'pr-11')}
          {...rest}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg">
            {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        )}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </div>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm font-semibold text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{children}</span>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

export function StatCard({ label, value, unit, icon, tone = 'brand', hint }: {
  label: string; value: string; unit?: string; icon?: ReactNode; tone?: 'brand' | 'accent' | 'pink'; hint?: string
}) {
  const toneBg = { brand: 'bg-brand-tint text-brand-strong', accent: 'bg-accent-soft text-[#05634f]', pink: 'bg-pink text-[#8a1838]' }[tone]
  return (
    <Card as="div" className="animate-in">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted">{label}</p>
        {icon && <span className={cx('grid size-9 place-items-center rounded-xl', toneBg)} aria-hidden>{icon}</span>}
      </div>
      <p className="mt-3 text-3xl font-extrabold tabular-nums">
        {value}{unit && <span className="ml-1 text-base font-bold text-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </Card>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 justify-center text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}…
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
      <AlertCircle className="size-8 text-danger" aria-hidden />
      <p className="max-w-md text-muted">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" aria-hidden /> Try again</Button>}
    </div>
  )
}

/** Segmented control (e.g. 1D / 7D / 30D). */
export function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-bold transition', o.value === value ? 'bg-brand text-white' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p id={id} className="font-bold">{label}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  )
}

export { cx }
