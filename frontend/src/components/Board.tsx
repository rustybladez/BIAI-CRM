import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import { useState } from 'react'
import type { ContactSummary, Meta } from '../api'
import { CHANNEL, INTEREST_LABEL, TYPE_LABEL, displayName } from '../lib/labels'
import { ChannelIcon, ContactCard } from './ContactCard'
import { NO_FILTERS, SORT_HELP, type Filters, type SortMode } from '../lib/filters'
import { cx, inputClass } from '../lib/ui'

export function FilterBar({ meta, filters, onChange }: { meta: Meta; filters: Filters; onChange: (f: Filters) => void }) {
  const active = filters.interest || filters.channel || filters.priority || filters.overdueOnly
  const select = (key: 'interest' | 'channel' | 'priority', label: string, options: { value: string; label: string }[]) => (
    <label className="flex items-center gap-1.5 text-sm text-slate-600">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={filters[key]}
        onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
        className={cx(inputClass, 'w-auto py-1')}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {select(
        'interest',
        'Interests',
        meta.interests.filter((i) => i !== 'not_applicable').map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i })),
      )}
      {select('channel', 'Channels', meta.channels.map((c) => ({ value: c, label: CHANNEL[c]?.short ?? c })))}
      {select('priority', 'Priorities', meta.priorities.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })))}
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-300">
        <input
          type="checkbox"
          checked={filters.overdueOnly}
          onChange={(e) => onChange({ ...filters, overdueOnly: e.target.checked })}
          className="accent-red-600"
        />
        Overdue only
      </label>
      {active && (
        <button onClick={() => onChange(NO_FILTERS)} className="text-sm text-indigo-700 underline">
          Clear filters
        </button>
      )}
    </div>
  )
}

export function Board({
  meta,
  contacts,
  onOpen,
  onMove,
}: {
  meta: Meta
  contacts: ContactSummary[]
  onOpen: (id: number) => void
  onMove: (id: number, status: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  return (
    <div className="grid min-w-[1100px] grid-cols-5 gap-3">
      {meta.statuses.map((status) => {
        const items = contacts.filter((c) => c.status === status)
        const people = items.filter((c) => c.interest === 'corporate').reduce((n, c) => n + (c.team_size ?? 0), 0)
        return (
          <section
            key={status}
            aria-label={`${status} column`}
            data-testid={`column-${status}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(status)
            }}
            onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = Number(e.dataTransfer.getData('text/contact-id'))
              if (id && contacts.find((c) => c.id === id)?.status !== status) onMove(id, status)
            }}
            className={cx(
              'flex min-h-[60vh] flex-col rounded-2xl bg-slate-100/70 p-2 transition',
              dragOver === status && 'bg-indigo-100 ring-2 ring-indigo-300',
            )}
          >
            <header className="flex items-baseline justify-between px-1.5 pb-2 pt-1">
              <h2 className="font-semibold text-slate-800">
                {status} <span className="font-normal text-slate-500">{items.length}</span>
              </h2>
              {people > 0 && <span className="text-xs text-slate-500">{people} people (corporate)</span>}
            </header>
            <div className="flex flex-col gap-2">
              {items.map((c) => (
                <ContactCard key={c.id} contact={c} onOpen={onOpen} />
              ))}
              {items.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">Drop a card here</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function NotALeadTray({ contacts, onOpen }: { contacts: ContactSummary[]; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl bg-slate-100/70 p-3" aria-label="Not a lead">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left font-semibold text-slate-700"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Inbox className="size-4 text-slate-500" />
        Not a lead <span className="font-normal text-slate-500">{contacts.length}</span>
        <span className="ml-1 text-sm font-normal text-slate-500">Spam and non-customers, kept out of the pipeline</span>
      </button>
      {open && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c.id)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 p-3 text-left text-slate-600 hover:bg-white"
              >
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ChannelIcon channel={c.channel} />
                  {c.channel ? CHANNEL[c.channel]?.short : ''} · {TYPE_LABEL[c.message_type]}
                </div>
                <div className="mt-0.5 font-medium text-slate-700">{displayName(c)}</div>
                <p className="mt-1 line-clamp-2 text-sm">{c.summary}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SortControl({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const options: { value: SortMode; label: string }[] = [
    { value: 'priority', label: 'Priority first' },
    { value: 'overdue', label: 'Overdue first' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
        <ArrowDownWideNarrow className="size-4" aria-hidden /> Sort cards:
      </span>
      <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-slate-300" role="radiogroup" aria-label="Sort cards">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={mode === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-md px-2.5 py-1 text-sm font-medium transition',
              mode === o.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500" data-testid="sort-help">
        {SORT_HELP[mode]}
      </span>
    </div>
  )
}
