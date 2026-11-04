import { CalendarClock, Clock, Download, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { reports, type ContactSummary, type Followups, type WeeklyReport } from '../api'
import { CHANNEL, INTEREST_LABEL, LANGUAGE_NAME, displayName, formatWhen } from '../lib/labels'
import { cx } from '../lib/ui'
import { ChannelIcon, FlagChips, PriorityBadge } from './ContactCard'
import { Button, Chip, ErrorNote, Spinner } from './ui'

function hoursSince(iso: string | null, nowIso: string): number | null {
  if (!iso) return null
  return Math.floor((new Date(nowIso).getTime() - new Date(iso).getTime()) / 3_600_000)
}

function Row({ c, now, onOpen }: { c: ContactSummary; now: string; onOpen: (id: number) => void }) {
  const waited = hoursSince(c.last_inbound_at, now)
  return (
    <li>
      <button
        onClick={() => onOpen(c.id)}
        className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs hover:shadow-md"
      >
        <PriorityBadge priority={c.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-slate-900">{displayName(c)}</span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <ChannelIcon channel={c.channel} /> {c.channel ? CHANNEL[c.channel]?.short : ''}
            </span>
            <Chip>{c.status}</Chip>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">{c.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            {c.follow_up_by && <>Follow up by {formatWhen(c.follow_up_by)} · </>}
            {waited !== null && <>waiting {waited} h for our reply · </>}
            {c.priority_reason}
          </p>
          <div className="mt-1.5">
            <FlagChips contact={c} withLabels />
          </div>
        </div>
      </button>
    </li>
  )
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: 'red' }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className={cx('text-2xl font-semibold tabular-nums', tone === 'red' ? 'text-red-600' : 'text-slate-900')}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function Breakdown({ title, data, label }: { title: string; data: Record<string, number>; label?: (k: string) => string }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{title}</div>
      <ul className="space-y-1">
        {Object.entries(data).map(([k, v]) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 truncate text-slate-700">{label ? label(k) : k}</span>
            <span className="h-2 rounded-full bg-indigo-400" style={{ width: `${Math.max(4, (v / total) * 100)}%` }} aria-hidden />
            <span className="tabular-nums text-slate-600">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeeklySummary({ onOpen }: { onOpen: (id: number) => void }) {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    reports.weekly().then(setReport, (e: Error) => setError(e.message))
  }, [])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await reports.generateWeekly()
      setReport(r)
      if (r.error) setError(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the summary')
    } finally {
      setBusy(false)
    }
  }

  if (!report) return error ? <ErrorNote message={error} /> : <Spinner label="Loading figures…" />
  const st = report.stats
  const s = report.summary
  return (
    <section aria-label="Weekly summary" className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Weekly summary</h2>
          <p className="text-xs text-slate-500">
            Week from {st.week_starts.replace(', 00:00', '')} to {st.as_of} · numbers computed by code, words written by AI
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export.csv" download className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white">
            <Download className="size-4" /> Export CSV
          </a>
          <Button variant={s ? 'secondary' : 'primary'} onClick={generate} loading={busy}>
            <Sparkles className="size-4" /> {s ? 'Regenerate' : 'Generate weekly summary'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        <Tile label="messages this week" value={st.this_week.messages_received} />
        <Tile label="new contacts" value={st.this_week.new_contacts} />
        <Tile label="waiting for our reply" value={st.waiting_for_our_reply} />
        <Tile label="overdue" value={st.overdue_count} tone="red" />
        <Tile label="urgent" value={st.urgent_count} tone="red" />
        <Tile label={`people to train (${st.corporate.leads} corporate leads)`} value={st.corporate.total_people_to_train} />
      </div>

      {busy && <Spinner label="Writing the summary from these figures… (AI, a few seconds)" />}
      {error && <ErrorNote message={error} onRetry={generate} />}
      {!s && !busy && !error && (
        <p className="text-sm text-slate-600">The data changed since the last summary. Generate a new one to see the AI's overview.</p>
      )}

      {s && !busy && (
        <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          {s.unverified_numbers.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Check: these numbers are not in the computed figures: {s.unverified_numbers.join(', ')}
            </div>
          )}
          <p className="leading-relaxed text-slate-800" data-testid="summary-overview">
            {s.overview}
          </p>
          <div>
            <h3 className="mb-2 font-semibold text-slate-900">Chase first</h3>
            <ol className="space-y-1.5" data-testid="chase-first">
              {s.chase_first.map((c, i) => (
                <li key={c.contact_id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 w-4 shrink-0 text-right font-semibold text-slate-400">{i + 1}</span>
                  <button onClick={() => onOpen(c.contact_id)} className="shrink-0 font-semibold text-indigo-700 hover:underline">
                    {c.name}
                  </button>
                  <PriorityBadge priority={c.priority} />
                  {c.overdue && <Chip className="bg-red-50 text-red-700 ring-1 ring-red-200">Overdue</Chip>}
                  <span className="text-slate-700">{c.reason}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-medium">Worth knowing:</span> {s.observation}
          </p>
          <p className="text-xs text-slate-400">
            {s.model_used} · {s.latency_ms} ms · generated {s.generated_at}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Breakdown title="Pipeline by status" data={st.pipeline_by_status} />
        <Breakdown title="Messages by channel" data={st.messages_by_channel} label={(k) => CHANNEL[k]?.short ?? k} />
        <Breakdown title="Contacts by language" data={st.contacts_by_language} label={(k) => LANGUAGE_NAME[k] ?? k} />
        <Breakdown title="Pipeline by interest" data={st.pipeline_by_interest} label={(k) => INTEREST_LABEL[k] ?? k} />
      </div>
    </section>
  )
}

export function FollowUps({ refreshKey, onOpen }: { refreshKey: number; onOpen: (id: number) => void }) {
  const [data, setData] = useState<Followups | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reports.followups().then(setData, (e: Error) => setError(e.message))
  }, [refreshKey])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        {error && <ErrorNote message={error} />}
        {!data && !error && <Spinner label="Loading follow-ups…" />}
        {data && (
          <>
            <section aria-label="Overdue">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Clock className="size-5 text-red-600" /> Overdue <span className="font-normal text-slate-500">{data.overdue.length}</span>
              </h2>
              <p className="mb-3 text-sm text-slate-500">No reply yet, and their follow-up time has passed or they have waited over 48 hours.</p>
              {data.overdue.length ? (
                <ul className="space-y-2">
                  {data.overdue.map((c) => (
                    <Row key={c.id} c={c} now={data.now} onOpen={onOpen} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Nobody is overdue. Nice work.</p>
              )}
            </section>
            <section aria-label="Due today">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <CalendarClock className="size-5 text-amber-600" /> Due later today{' '}
                <span className="font-normal text-slate-500">{data.due_today.length}</span>
              </h2>
              {data.due_today.length ? (
                <ul className="space-y-2">
                  {data.due_today.map((c) => (
                    <Row key={c.id} c={c} now={data.now} onOpen={onOpen} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No follow-ups due later today.</p>
              )}
            </section>
          </>
        )}
      </div>
      <WeeklySummary key={refreshKey} onOpen={onOpen} />
    </div>
  )
}
