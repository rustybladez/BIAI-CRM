import { LoaderCircle, Sparkles, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/ui'

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        className ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </span>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export function Button({
  variant = 'secondary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed',
        VARIANT[variant],
        className,
      )}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-medium underline">
          Try again
        </button>
      )}
    </div>
  )
}


// "AI suggests: Interested · Move". Never applied without the click.
export function StatusSuggestion({
  status,
  onMove,
  onDismiss,
  busy,
}: {
  status: string
  onMove: () => void
  onDismiss?: () => void
  busy?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 py-0.5 pl-2.5 pr-1 text-[13px] text-violet-900 ring-1 ring-violet-200">
      <Sparkles className="size-3.5" aria-hidden />
      <span>
        AI suggests: <strong>{status}</strong>
      </span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={onMove}
        disabled={busy}
        className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:bg-violet-300"
      >
        Move
      </button>
      {onDismiss && (
        <button type="button" onClick={onDismiss} disabled={busy} className="rounded-full p-0.5 text-violet-700 hover:bg-violet-100" aria-label="Dismiss suggestion" title="Dismiss">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}
