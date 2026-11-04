import { Download, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { reports, type WeeklyReport } from '../api'
import { CHANNEL, INTEREST_LABEL, LANGUAGE_NAME } from '../lib/labels'
import { cx } from '../lib/ui'
import { PriorityBadge, StatusPill } from './ContactCard'
import { Button, Chip, ErrorNote, Spinner } from './ui'

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: 'red' }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className={cx('text-2xl font-semibold tabular-nums', tone === 'red' ? 'text-red-600' : 'text-slate-900')}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function Breakdown({ title, data, label }: { title: string; data: Record<string, number>; label?: (k: string) => string }) {
  const max = Math.max(1, ...Object.values(data))
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-medium text-slate-500">{title}</div>
      {/* Label column sizes to the longest label, so labels are never cut off; bars scale to the largest value. */}
      <ul className="grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        {Object.entries(data).map(([k, v]) => (
          <li key={k} className="contents">
            <span className="whitespace-nowrap text-slate-700">{label ? label(k) : k}</span>
            <span className="h-2 rounded-full bg-slate-100" aria-hidden>
              <span className="block h-2 rounded-full bg-indigo-400" style={{ width: v ? `${Math.max(3, (v / max) * 100)}%` : 0 }} />
            </span>
            <span className="text-right tabular-nums text-slate-600">{v}</span>
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
    <section aria-label="Weekly summary" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">This week</h2>
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
          {s.unverified_numbers.length === 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <ShieldCheck className="size-3.5" aria-hidden /> Every number below was checked against the data
            </p>
          )}
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

      {st.corporate.list.length > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-slate-200">
          <h3 className="px-4 pt-3 font-semibold text-slate-900">
            Corporate leads <span className="font-normal text-slate-500">· {st.corporate.total_people_to_train} people to train</span>
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-4 py-1.5 font-medium">Company</th>
                <th className="px-4 py-1.5 font-medium">Contact</th>
                <th className="px-4 py-1.5 text-right font-medium">Team size</th>
                <th className="px-4 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {st.corporate.list.map((c) => (
                <tr key={c.contact_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-800">{c.company ?? '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => onOpen(c.contact_id)} className="font-medium text-indigo-700 hover:underline">
                      {c.name ?? 'Unknown'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.team_size ?? '—'}</td>
                  <td className="px-4 py-2"><StatusPill status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}


export function Reports({ refreshKey, onOpen }: { refreshKey: number; onOpen: (id: number) => void }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <WeeklySummary key={refreshKey} onOpen={onOpen} />
    </div>
  )
}
