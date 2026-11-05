import * as Popover from '@radix-ui/react-popover'
import { BarChart3, Clock, KanbanSquare, LayoutDashboard, Menu, MessageSquarePlus, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type ContactSummary } from '../api'
import { CHANNEL, demoNowIso, displayName, formatWhen } from '../lib/labels'
import type { View } from '../lib/nav'
import { cx, inputClass } from '../lib/ui'
import { ChannelIcon, PriorityBadge, StatusPill } from './ContactCard'
import { Button } from './ui'

const NAV: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'today', label: 'Today', icon: LayoutDashboard },
  { view: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
]

export function Sidebar({
  view,
  onView,
  counts,
  onNew,
  demoNow,
  onSetClock,
  onReset,
  className = 'flex',
  onClose,
}: {
  view: View
  onView: (v: View) => void
  counts: { overdue: number; pipeline: number }
  onNew: () => void
  demoNow: string
  onSetClock: (v: string) => Promise<void>
  onReset: () => Promise<void>
  className?: string
  onClose?: () => void
}) {
  return (
    <aside className={cx('w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4', className)}>
      <div className="flex items-center gap-2 px-2 pb-4">
        <Logo />
        {onClose && (
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
            <X className="size-5" />
          </button>
        )}
      </div>
      <Button
        variant="primary"
        className="mb-3 w-full py-2"
        onClick={() => {
          onNew()
          onClose?.()
        }}
        title="Paste a message (shortcut: n)"
      >
        <MessageSquarePlus className="size-4" /> New enquiry
      </Button>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(({ view: v, label, icon: Icon }) => {
          const count = v === 'today' ? counts.overdue : v === 'pipeline' ? counts.pipeline : null
          return (
            <button
              key={v}
              onClick={() => {
                onView(v)
                onClose?.()
              }}
              aria-current={view === v ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                view === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {count !== null && count > 0 && (
                <span
                  className={cx(
                    'ml-auto rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    v === 'today' ? 'bg-red-600 text-white' : 'text-slate-400',
                  )}
                  title={v === 'today' ? `${count} overdue` : `${count} in the pipeline`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="flex-1" />
      <DemoBox demoNow={demoNow} onSetClock={onSetClock} onReset={onReset} />
    </aside>
  )
}

function DemoBox({
  demoNow,
  onSetClock,
  onReset,
}: {
  demoNow: string
  onSetClock: (v: string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(demoNow)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-2.5 text-xs text-amber-900" aria-label="Demo controls">
      <div className="font-semibold">Demo mode</div>
      <p className="mt-0.5 text-amber-800">Sample data from late October. Overdue times use this clock:</p>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o) setValue(demoNow)
        }}
      >
        <Popover.Trigger asChild>
          <button className="mt-1.5 flex w-full items-center gap-1.5 rounded-md bg-white px-2 py-1 text-left font-medium text-slate-800 ring-1 ring-amber-200 hover:ring-amber-400" data-testid="demo-now">
            <Clock className="size-3.5 text-amber-700" aria-hidden />
            {formatWhen(demoNowIso(demoNow))}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                await onSetClock(value)
                setBusy(false)
                setOpen(false)
              }}
            >
              <label className="block text-xs font-medium text-slate-500" htmlFor="demo-clock">
                Demo time (Dhaka)
              </label>
              <input id="demo-clock" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} aria-label="Demo time" />
              <div className="flex flex-wrap gap-1">
                {[
                  ['2026-10-26T10:00', 'Mon 26, 10:00'],
                  ['2026-10-28T12:00', 'Wed 28, 12:00'],
                  ['2026-10-29T18:00', 'Thu 29, 18:00'],
                ].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setValue(v)} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-indigo-50">
                    {l}
                  </button>
                ))}
              </div>
              <Button type="submit" variant="primary" loading={busy} className="w-full">
                Set demo time
              </Button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {confirmReset ? (
        <div className="mt-2 space-y-1.5">
          <p>Reload the 20 sample enquiries and undo every change?</p>
          <div className="flex gap-1.5">
            <button
              className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700"
              onClick={async () => {
                setConfirmReset(false)
                await onReset()
              }}
            >
              Reset
            </button>
            <button className="rounded-md px-2 py-1 font-medium text-amber-900 hover:bg-amber-100" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="mt-1.5 inline-flex items-center gap-1 font-medium text-amber-800 hover:underline" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="size-3" aria-hidden /> Reset demo data
        </button>
      )}
    </section>
  )
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">B</span>
      <span className="text-[15px] font-bold tracking-tight text-slate-900">BIAI CRM</span>
    </span>
  )
}

/** Phone widths (below md): logo, menu button and New enquiry instead of the sidebar. */
export function MobileBar({ onMenu, onNew, overdue }: { onMenu: () => void; onNew: () => void; overdue: number }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 md:hidden">
      <button onClick={onMenu} className="relative rounded-lg p-2 text-slate-700 hover:bg-slate-100" aria-label="Open menu">
        <Menu className="size-5" />
        {overdue > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white" aria-label={`${overdue} overdue`}>
            {overdue}
          </span>
        )}
      </button>
      <Logo />
      <Button variant="primary" className="ml-auto" onClick={onNew}>
        <MessageSquarePlus className="size-4" /> New enquiry
      </Button>
    </div>
  )
}

/** The sidebar as a slide-over from the left, for phone widths. */
export function MobileMenu({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">{children}</div>
    </div>
  )
}

export function TopBar({ title, children, onOpen }: { title: string; children?: ReactNode; onOpen: (id: number) => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:gap-4 md:px-6">
      <h1 className="shrink-0 text-base font-bold tracking-tight text-slate-900 md:text-lg">{title}</h1>
      {children}
      <div className="ml-auto min-w-0 flex-1 md:flex-none">
        <GlobalSearch onOpen={onOpen} />
      </div>
    </header>
  )
}

function GlobalSearch({ onOpen }: { onOpen: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ContactSummary[] | null>(null)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let alive = true
    const t = setTimeout(() => {
      api.search(term).then(
        (r) => alive && setResults(r),
        () => alive && setResults([]),
      )
    }, 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const shown = q.trim().length >= 2 ? results : null
  return (
    <Popover.Root open={open && shown !== null} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQ('')
                input.current?.blur()
              }
              if (e.key === 'Enter' && shown?.[0]) {
                onOpen(shown[0].id)
                setOpen(false)
                input.current?.blur()
              }
            }}
            placeholder="Search name, phone or message"
            aria-label="Search contacts"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-sm md:w-80 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-400">/</kbd>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[min(26rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {shown && shown.length === 0 && <p className="p-3 text-sm text-slate-500">No contact matches "{q.trim()}".</p>}
          <ul className="max-h-96 overflow-y-auto">
            {shown?.slice(0, 8).map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    onOpen(c.id)
                    setOpen(false)
                    input.current?.blur()
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-slate-50"
                >
                  <ChannelIcon channel={c.channel} className="mt-1 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-900">{displayName(c)}</span>
                      <StatusPill status={c.status} />
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.channel ? CHANNEL[c.channel]?.short : ''} · {c.summary}
                    </span>
                  </span>
                  <PriorityBadge priority={c.priority} />
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
