import { ArrowRight, Phone, Reply, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { reports, type ContactSummary, type Meta, type WeeklyReport } from '../api'
import { NO_FILTERS, sortContacts, type Filters } from '../lib/filters'
import { CHANNEL, STATUS_BAR, displayName } from '../lib/labels'
import { cx } from '../lib/ui'
import { ChannelIcon, PriorityBadge, WaitTime } from './ContactCard'
import { Chip, Spinner } from './ui'

type QueueTab = 'waiting' | 'urgent' | 'overdue' | 'due'

export type GoTo = { tab?: 'pipeline' | 'not_a_lead'; filters?: Filters } | 'reports'

function greeting(demoNow: string): string {
  const h = Number(demoNow.slice(11, 13))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function Kpi({
  label,
  value,
  sub,
  tone,
  onClick,
  testId,
}: {
  label: string
  value: number | string
  sub: React.ReactNode
  tone?: 'red'
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="group flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-md"
    >
      <span className="flex items-center text-[13px] font-medium text-slate-500">
        {label}
        <ArrowRight className="ml-auto size-3.5 text-slate-300 transition group-hover:text-indigo-500" aria-hidden />
      </span>
      <span className={cx('text-3xl font-bold tabular-nums tracking-tight', tone === 'red' ? 'text-red-600' : 'text-slate-900')}>{value}</span>
      <span className="text-xs text-slate-500">{sub}</span>
    </button>
  )
}

export function Today({
  meta,
  contacts,
  refreshKey,
  onOpen,
  onGo,
}: {
  meta: Meta
  contacts: ContactSummary[]
  refreshKey: number
  onOpen: (id: number, queue: number[]) => void
  onGo: (to: GoTo) => void
}) {
  const [tab, setTab] = useState<QueueTab>('waiting')
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)
  const now = `${meta.demo_now}:00+06:00`

  useEffect(() => {
    let alive = true
    reports.weekly().then((r) => alive && setWeekly(r), () => alive && setWeekly(null))
    return () => {
      alive = false
    }
  }, [refreshKey])

  const pipeline = useMemo(() => contacts.filter((c) => c.status !== null), [contacts])
  const waiting = useMemo(() => sortContacts(pipeline.filter((c) => c.awaiting_reply && c.status !== 'Lost'), 'priority'), [pipeline])
  const lists: Record<QueueTab, ContactSummary[]> = {
    waiting,
    urgent: waiting.filter((c) => c.priority === 'urgent'),
    overdue: sortContacts(pipeline.filter((c) => c.overdue), 'priority'),
    due: sortContacts(pipeline.filter((c) => c.due_today), 'priority'),
  }
  const overdue = lists.overdue.length
  const urgent = pipeline.filter((c) => c.priority === 'urgent')
  const corporate = pipeline.filter((c) => c.interest === 'corporate')
  const people = corporate.reduce((n, c) => n + (c.team_size ?? 0), 0)
  const notALead = contacts.filter((c) => c.status === null)
  const st = weekly?.stats

  const overduePhrase = overdue === 1 ? '1 person is overdue' : `${overdue} people are overdue`
  const headline =
    overdue || urgent.length
      ? `${greeting(meta.demo_now)}. ${overduePhrase} and ${urgent.length} ${urgent.length === 1 ? 'is' : 'are'} urgent.`
      : `${greeting(meta.demo_now)}. Nobody is overdue.`
  const queue = lists[tab]

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl" data-testid="today-headline">
          {headline}
        </h2>
        <p className="text-sm text-slate-500">
          {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(now))} ·{' '}
          {plural(waiting.length, 'person is', 'people are')} waiting for a reply
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Kpi
          label="Waiting for reply"
          value={waiting.length}
          testId="kpi-waiting"
          sub={<><b className="font-semibold text-red-600">{overdue} overdue</b> · {waiting.length - overdue} on time</>}
          onClick={() => onGo({ tab: 'pipeline', filters: { ...NO_FILTERS, waitingOnly: true } })}
        />
        <Kpi
          label="Urgent"
          value={urgent.length}
          tone={urgent.length ? 'red' : undefined}
          testId="kpi-urgent"
          sub={urgent.map((c) => displayName(c).split(' ')[0]).join(', ') || 'None'}
          onClick={() => onGo({ tab: 'pipeline', filters: { ...NO_FILTERS, priority: 'urgent' } })}
        />
        <Kpi
          label="New this week"
          value={st?.this_week.new_contacts ?? '…'}
          sub={st ? `${plural(st.this_week.messages_received, 'message')} · ${plural(st.this_week.replies_sent, 'reply', 'replies')} sent` : 'Loading'}
          onClick={() => onGo('reports')}
        />
        <Kpi
          label="Corporate pipeline"
          value={people}
          sub={`people to train · ${plural(corporate.length, 'company', 'companies')}`}
          onClick={() => onGo({ tab: 'pipeline', filters: { ...NO_FILTERS, interest: 'corporate' } })}
        />
        <Kpi
          label="Not a lead"
          value={notALead.length}
          sub={notALead.map((c) => (c.message_type === 'spam' ? 'spam' : 'not a customer')).join(' · ') || 'None'}
          onClick={() => onGo({ tab: 'not_a_lead' })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white" aria-label="Needs you now">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
            <h3 className="text-base font-semibold text-slate-900">Needs you now</h3>
            <button onClick={() => onGo({ tab: 'pipeline' })} className="ml-auto text-[13px] font-medium text-indigo-700 hover:underline">
              Open pipeline →
            </button>
          </div>
          <div className="flex flex-wrap gap-1 px-5 pb-2 pt-3" role="tablist" aria-label="Queue">
            {(
              [
                ['waiting', 'All waiting'],
                ['urgent', 'Urgent'],
                ['overdue', 'Overdue'],
                ['due', 'Due today'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ring-1 transition',
                  tab === t ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'text-slate-600 ring-transparent hover:bg-slate-50',
                )}
              >
                {label}
                <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>{lists[t].length}</span>
              </button>
            ))}
          </div>
          <ul className="max-h-[440px] overflow-y-auto px-3 pb-3" data-testid="queue">
            {queue.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Nothing here. Nice work.</li>}
            {queue.map((c) => {
              const call = c.channel === 'Phone call note' || c.flags.includes('callback_requested')
              return (
                <li key={c.id} className="border-t border-slate-100 first:border-0">
                  <div className="flex items-center gap-2 rounded-xl px-1 py-2.5 hover:bg-slate-50 sm:gap-3 sm:px-2">
                    <span className="hidden w-16 shrink-0 sm:block"><PriorityBadge priority={c.priority} /></span>
                    <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(c.id, queue.map((q) => q.id))}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="sm:hidden"><PriorityBadge priority={c.priority} /></span>
                        <span className="font-semibold text-slate-900">{displayName(c)}</span>
                        {c.overdue && <Chip className="bg-red-50 text-red-700 ring-1 ring-red-200">Overdue</Chip>}
                        {c.flags.includes('repeat_no_reply') && <Chip className="bg-slate-100 text-slate-600">asked again</Chip>}
                      </span>
                      <span className="flex items-center gap-1.5 text-[13px] text-slate-500">
                        <ChannelIcon channel={c.channel} />
                        <span className="truncate">
                          {c.channel ? CHANNEL[c.channel]?.short : ''} · {c.summary}
                        </span>
                      </span>
                    </button>
                    <WaitTime contact={c} now={now} className="shrink-0 text-right text-xs sm:w-24 sm:text-sm" compact />
                    <button
                      onClick={() => onOpen(c.id, queue.map((q) => q.id))}
                      className={cx(
                        'inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition sm:w-20',
                        c.priority === 'urgent' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-slate-700 ring-1 ring-slate-200 hover:bg-white hover:ring-indigo-300',
                      )}
                    >
                      {call ? <Phone className="size-3.5" aria-hidden /> : <Reply className="size-3.5" aria-hidden />}
                      {call ? 'Call' : 'Reply'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-indigo-200 bg-white p-5" aria-label="Weekly brief">
            <div className="flex items-center gap-2">
              <h3 className="whitespace-nowrap text-base font-semibold text-slate-900">Weekly brief</h3>
              <button onClick={() => onGo('reports')} className="ml-auto whitespace-nowrap text-[13px] font-medium text-indigo-700 hover:underline">
                Full report →
              </button>
            </div>
            <Chip className="mt-1 bg-indigo-50 text-indigo-700">
              <Sparkles className="size-3" aria-hidden /> Written by AI · numbers computed by code
            </Chip>
            {!weekly && <div className="mt-3"><Spinner label="Loading…" /></div>}
            {weekly?.summary && <p className="mt-2 line-clamp-6 text-sm leading-relaxed text-slate-700" data-testid="brief">{weekly.summary.overview}</p>}
            {weekly && !weekly.summary && (
              <p className="mt-2 text-sm text-slate-600">
                The data changed since the last brief.{' '}
                <button onClick={() => onGo('reports')} className="font-medium text-indigo-700 hover:underline">
                  Write a new one in Reports
                </button>
                .
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Pipeline overview">
            <div className="flex items-center">
              <h3 className="text-base font-semibold text-slate-900">Pipeline</h3>
              <button onClick={() => onGo({ tab: 'pipeline' })} className="ml-auto text-[13px] font-medium text-indigo-700 hover:underline">
                Board →
              </button>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
              {meta.statuses.map((s) => {
                const n = pipeline.filter((c) => c.status === s).length
                return n ? <span key={s} className={STATUS_BAR[s]} style={{ width: `${(n / pipeline.length) * 100}%` }} title={`${s}: ${n}`} /> : null
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {meta.statuses.map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <i className={cx('inline-block size-2 rounded-sm', STATUS_BAR[s])} />
                  {s} <b className="font-semibold tabular-nums">{pipeline.filter((c) => c.status === s).length}</b>
                </span>
              ))}
            </div>
          </section>

          {st && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Messages by channel">
              <h3 className="text-base font-semibold text-slate-900">Messages by channel</h3>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(st.messages_by_channel).map(([k, v]) => {
                  const max = Math.max(...Object.values(st.messages_by_channel))
                  return (
                    <li key={k} className="grid grid-cols-[96px_1fr_24px] items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><ChannelIcon channel={k} className="text-slate-400" />{CHANNEL[k]?.short ?? k}</span>
                      <span className="h-2 rounded-full bg-indigo-400" style={{ width: `${(v / max) * 100}%` }} />
                      <span className="text-right font-semibold tabular-nums text-slate-700">{v}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
