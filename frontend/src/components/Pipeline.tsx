import * as Popover from '@radix-ui/react-popover'
import { ArrowDownWideNarrow, KanbanSquare, ListFilter, Rows3, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ContactSummary, Meta } from '../api'
import {
  activeFilterCount,
  applyFilters,
  loadLayout,
  NO_FILTERS,
  saveLayout,
  SORT_HELP,
  sortContacts,
  type Filters,
  type PipelineLayout,
  type SortMode,
} from '../lib/filters'
import { CHANNEL, FLAG, INTEREST_LABEL, LANGUAGE_LABEL, TONE, TYPE_LABEL, contactFlags, displayName, formatWhen } from '../lib/labels'
import { cx } from '../lib/ui'
import { ChannelIcon, ContactCard, PriorityBadge, StatusPill, WaitTime } from './ContactCard'

type Tab = 'pipeline' | 'not_a_lead'

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-medium transition',
            value === o.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FilterMenu({ meta, filters, onChange }: { meta: Meta; filters: Filters; onChange: (f: Filters) => void }) {
  const n = activeFilterCount(filters)
  const group = (title: string, key: 'interest' | 'channel' | 'priority', options: { value: string; label: string }[]) => (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-medium text-slate-500">{title}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = filters[key] === o.value
          return (
            <button
              key={o.value}
              onClick={() => onChange({ ...filters, [key]: on ? '' : o.value })}
              aria-pressed={on}
              className={cx(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition',
                on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-indigo-300',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300">
          <ListFilter className="size-4" aria-hidden /> Filter
          {n > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">{n}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          {group('Interest', 'interest', meta.interests.filter((i) => i !== 'not_applicable').map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i })))}
          {group('Channel', 'channel', meta.channels.map((c) => ({ value: c, label: CHANNEL[c]?.short ?? c })))}
          {group('Priority', 'priority', meta.priorities.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })))}
          <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-indigo-600" checked={filters.waitingOnly} onChange={(e) => onChange({ ...filters, waitingOnly: e.target.checked })} />
              Waiting for our reply
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-red-600" checked={filters.overdueOnly} onChange={(e) => onChange({ ...filters, overdueOnly: e.target.checked })} />
              Overdue only
            </label>
          </div>
          {n > 0 && (
            <button onClick={() => onChange(NO_FILTERS)} className="text-sm font-medium text-indigo-700 hover:underline">
              Clear all filters
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ActiveChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const chips: { label: string; clear: Filters }[] = []
  if (filters.interest) chips.push({ label: INTEREST_LABEL[filters.interest] ?? filters.interest, clear: { ...filters, interest: '' } })
  if (filters.channel) chips.push({ label: CHANNEL[filters.channel]?.short ?? filters.channel, clear: { ...filters, channel: '' } })
  if (filters.priority) chips.push({ label: `${filters.priority[0].toUpperCase()}${filters.priority.slice(1)} priority`, clear: { ...filters, priority: '' } })
  if (filters.waitingOnly) chips.push({ label: 'Waiting for reply', clear: { ...filters, waitingOnly: false } })
  if (filters.overdueOnly) chips.push({ label: 'Overdue', clear: { ...filters, overdueOnly: false } })
  return (
    <>
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => onChange(c.clear)}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label} <X className="size-3" aria-hidden />
        </button>
      ))}
    </>
  )
}

export function Pipeline({
  meta,
  contacts,
  filters,
  onFilters,
  sortMode,
  onSortMode,
  tab,
  onTab,
  onOpen,
  onMove,
}: {
  meta: Meta
  contacts: ContactSummary[]
  filters: Filters
  onFilters: (f: Filters) => void
  sortMode: SortMode
  onSortMode: (m: SortMode) => void
  tab: Tab
  onTab: (t: Tab) => void
  onOpen: (id: number, queue: number[]) => void
  onMove: (id: number, status: string) => void
}) {
  const [layout, setLayoutState] = useState<PipelineLayout>(loadLayout)
  const setLayout = (l: PipelineLayout) => {
    setLayoutState(l)
    saveLayout(l)
  }
  const pipeline = useMemo(() => contacts.filter((c) => c.status !== null), [contacts])
  const notALead = useMemo(() => contacts.filter((c) => c.status === null), [contacts])
  const visible = useMemo(() => sortContacts(applyFilters(pipeline, filters), sortMode), [pipeline, filters, sortMode])
  const now = `${meta.demo_now}:00+06:00`

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Contacts">
          {(
            [
              ['pipeline', 'Pipeline', pipeline.length],
              ['not_a_lead', 'Not a lead', notALead.length],
            ] as const
          ).map(([t, label, n]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTab(t)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium transition',
                tab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {label}
              <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600')}>{n}</span>
            </button>
          ))}
        </div>
        {tab === 'pipeline' && (
          <>
            <FilterMenu meta={meta} filters={filters} onChange={onFilters} />
            <ActiveChips filters={filters} onChange={onFilters} />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600" title={SORT_HELP[sortMode]}>
                <ArrowDownWideNarrow className="size-4" aria-hidden /> Sort
              </span>
              <Segmented
                label="Sort cards"
                value={sortMode}
                onChange={onSortMode}
                options={[
                  { value: 'priority', label: 'Priority first', title: SORT_HELP.priority },
                  { value: 'overdue', label: 'Overdue first', title: SORT_HELP.overdue },
                ]}
              />
              <Segmented
                label="Layout"
                value={layout}
                onChange={setLayout}
                options={[
                  { value: 'board', label: <><KanbanSquare className="size-4" aria-hidden /> Board</> },
                  { value: 'table', label: <><Rows3 className="size-4" aria-hidden /> Table</> },
                ]}
              />
            </div>
          </>
        )}
      </div>
      {tab === 'pipeline' && (
        <p className="-mt-1 text-xs text-slate-500" data-testid="sort-help">
          {SORT_HELP[sortMode]} {layout === 'board' && 'Drag a card to another column to change its status.'}
        </p>
      )}

      <div className="min-h-0 flex-1">
        {tab === 'not_a_lead' ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Spam and people who are not customers (for example job seekers). They stay out of the pipeline and get no sales reply.</p>
            <ContactTable contacts={notALead} now={now} onOpen={onOpen} />
          </div>
        ) : layout === 'table' ? (
          <div className="h-full overflow-y-auto">
            <ContactTable contacts={visible} now={now} onOpen={onOpen} />
          </div>
        ) : (
          <Board meta={meta} contacts={visible} now={now} onOpen={onOpen} onMove={onMove} />
        )}
      </div>
    </div>
  )
}

function Board({
  meta,
  contacts,
  now,
  onOpen,
  onMove,
}: {
  meta: Meta
  contacts: ContactSummary[]
  now: string
  onOpen: (id: number, queue: number[]) => void
  onMove: (id: number, status: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  return (
    <div className="h-full overflow-x-auto">
      <div
        className="grid h-full min-w-[980px] gap-3"
        style={{
          gridTemplateColumns: meta.statuses
            .map((s) => (contacts.some((c) => c.status === s) ? 'minmax(230px, 1fr)' : 'minmax(150px, 0.6fr)'))
            .join(' '),
        }}
      >
        {meta.statuses.map((status) => {
          const items = contacts.filter((c) => c.status === status)
          const ids = items.map((c) => c.id)
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
                'flex min-h-0 flex-col rounded-2xl bg-slate-100 transition',
                dragOver === status && 'bg-indigo-50 ring-2 ring-indigo-300',
              )}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <StatusPill status={status} />
                <span className="text-sm font-semibold tabular-nums text-slate-600">{items.length}</span>
                {people > 0 && (
                  <span className="ml-auto text-[11px] text-slate-500" title="People to train across the corporate leads in this column">
                    {people} to train
                  </span>
                )}
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" data-testid={`column-scroll-${status}`}>
                {items.map((c) => (
                  <ContactCard key={c.id} contact={c} now={now} onOpen={(id) => onOpen(id, ids)} />
                ))}
                {items.length === 0 && (
                  <p className="rounded-xl border-2 border-dashed border-slate-200 px-2 py-6 text-center text-sm text-slate-400">Drag a card here</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function ContactTable({
  contacts,
  now,
  onOpen,
}: {
  contacts: ContactSummary[]
  now: string
  onOpen: (id: number, queue: number[]) => void
}) {
  const ids = contacts.map((c) => c.id)
  if (!contacts.length) return <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nobody matches these filters.</p>
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
      <table className="w-full min-w-[860px] text-left text-sm" data-testid="contact-table">
        <thead className="sticky top-0 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            {['Contact', 'Status', 'Priority', 'Interest', 'Channel', 'Language', 'Waiting', 'Follow up by', 'Flags'].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} onClick={() => onOpen(c.id, ids)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-indigo-50/40">
              <td className="px-3 py-2">
                <button className="text-left font-medium text-slate-900 hover:text-indigo-700" onClick={(e) => (e.stopPropagation(), onOpen(c.id, ids))}>
                  {displayName(c)}
                </button>
                {c.enquiry_count > 1 && <span className="ml-1 text-xs text-slate-400">×{c.enquiry_count}</span>}
                <div className="max-w-56 truncate text-xs text-slate-500">{[c.role, c.company].filter(Boolean).join(', ') || c.summary}</div>
              </td>
              <td className="px-3 py-2"><StatusPill status={c.status} /></td>
              <td className="px-3 py-2"><PriorityBadge priority={c.priority} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                {c.message_type === 'lead' ? INTEREST_LABEL[c.interest] : TYPE_LABEL[c.message_type]}
                {c.team_size ? ` · ${c.team_size}` : ''}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                <span className="inline-flex items-center gap-1.5"><ChannelIcon channel={c.channel} className="text-slate-400" />{c.channel ? CHANNEL[c.channel]?.short : ''}</span>
              </td>
              <td className="px-3 py-2 text-slate-700">{LANGUAGE_LABEL[c.language]}</td>
              <td className="px-3 py-2"><WaitTime contact={c} now={now} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{c.follow_up_by ? formatWhen(c.follow_up_by) : '—'}</td>
              <td className="px-3 py-2">
                <span className="flex gap-1">
                  {contactFlags(c).map((f) => {
                    const meta = FLAG[f]
                    if (!meta) return null
                    const Icon = meta.icon
                    return (
                      <span key={f} title={`${meta.label}: ${meta.explain}`} className={cx('rounded-md p-1 ring-1', TONE[meta.tone])}>
                        <Icon className="size-3.5" aria-label={meta.label} />
                      </span>
                    )
                  })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
