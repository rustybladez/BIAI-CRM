import { ChevronLeft, ChevronRight, Pencil, Phone, StickyNote, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type ContactDetail, type ContactUpdate, type Meta } from '../api'
import {
  CHANNEL,
  FIELD_LABEL,
  FLAG,
  INTEREST_LABEL,
  LANGUAGE_NAME,
  TONE,
  TYPE_LABEL,
  contactFlags,
  displayName,
  formatWhen,
  toLocalInput,
} from '../lib/labels'
import { cx, inputClass } from '../lib/ui'
import { ChannelIcon, PriorityBadge, StatusPill, WaitTime } from './ContactCard'
import { ReplyPanel } from './ReplyPanel'
import { Button, ErrorNote, Spinner, StatusSuggestion } from './ui'

const TZ = 'Asia/Dhaka'
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
const timeLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

// ---------------- Conversation ----------------

function Thread({ contact }: { contact: ContactDetail }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [contact.activities.length])

  const acts = contact.activities
  return (
    <div className="flex flex-col gap-2.5 px-6 py-5" aria-label="Conversation">
      {acts.map((a, i) => {
        const separator =
          i === 0 || dayKey(a.at) !== dayKey(acts[i - 1].at) ? (
            <div key={`d-${a.id}`} className="my-1 self-center rounded-full bg-white/80 px-3 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
              {dayLabel(a.at)}
            </div>
          ) : null
        if (a.kind === 'inbound') {
          const e = contact.enquiries.find((x) => x.message === a.body && x.received_at === a.at)
          const isCall = e?.channel === 'Phone call note'
          return [
            separator,
            <div key={a.id} className="flex max-w-[80%] flex-col gap-1 self-start">
              <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
                <ChannelIcon channel={e?.channel ?? null} />
                {e ? CHANNEL[e.channel]?.short : ''} · {e?.sender_name_raw}
              </div>
              <div
                className={cx(
                  'rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-xs',
                  isCall ? 'border border-dashed border-slate-300 bg-amber-50/60' : 'bg-white ring-1 ring-slate-200',
                )}
              >
                {isCall && (
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                    <Phone className="size-3" aria-hidden /> Call note by staff
                  </span>
                )}
                {a.body}
                <span className="mt-1 block text-right text-[10.5px] text-slate-400">{timeLabel(a.at)}</span>
              </div>
              {e?.model_used && <span className="px-1 text-[10.5px] text-slate-400">Read by AI ({e.model_used}, {((e.latency_ms ?? 0) / 1000).toFixed(1)} s)</span>}
            </div>,
          ]
        }
        if (a.kind === 'reply_sent') {
          return [
            separator,
            <div key={a.id} className="flex max-w-[80%] flex-col items-end gap-1 self-end">
              <span className="px-1 text-[11px] text-slate-500">You · marked as sent</span>
              <div className="whitespace-pre-line rounded-2xl rounded-tr-md bg-indigo-600 px-3.5 py-2.5 text-[15px] leading-relaxed text-white shadow-xs">
                {a.body || 'Reply sent'}
                <span className="mt-1 block text-right text-[10.5px] text-indigo-200">{timeLabel(a.at)}</span>
              </div>
            </div>,
          ]
        }
        if (a.kind === 'note') {
          return [
            separator,
            <div key={a.id} className="flex max-w-[70%] items-start gap-2 self-center rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Note</span> · {a.body} <span className="text-[10.5px] text-amber-700">{timeLabel(a.at)}</span>
              </span>
            </div>,
          ]
        }
        const text = a.kind === 'merge' ? 'Same phone number, merged into this contact' : a.kind === 'status_change' ? `Status: ${a.body}` : a.body
        return [
          separator,
          <div key={a.id} className="self-center rounded-full bg-slate-200/70 px-3 py-0.5 text-[11px] text-slate-600">
            {text} · {timeLabel(a.at)}
          </div>,
        ]
      })}
      {contact.flags.includes('repeat_no_reply') && contact.awaiting_reply && (
        <div className="self-center rounded-full bg-red-50 px-3 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200">
          Asked again with no reply in between, so priority was raised to urgent
        </div>
      )}
      <div ref={end} />
    </div>
  )
}

// ---------------- Properties ----------------

type FieldKind = 'text' | 'number' | 'select' | 'datetime'

function Property({
  label,
  field,
  display,
  value,
  kind = 'text',
  options,
  unsure,
  onSave,
}: {
  label: string
  field: string
  display: React.ReactNode
  value: string
  kind?: FieldKind
  options?: { value: string; label: string }[]
  unsure?: boolean
  onSave: (v: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const commit = async () => {
    if (draft === value) return setEditing(false)
    setBusy(true)
    const ok = await onSave(draft)
    setBusy(false)
    if (ok) setEditing(false)
  }
  return (
    <div className={cx('grid grid-cols-[104px_1fr] items-start gap-2 rounded-lg px-2 py-1.5', unsure && !editing && 'bg-amber-50 ring-1 ring-amber-200')} data-field={field}>
      <span className="pt-0.5 text-[13px] text-slate-500">{label}</span>
      {editing ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void commit()
          }}
        >
          {kind === 'select' ? (
            <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} aria-label={label}>
              {options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={kind === 'number' ? 'number' : kind === 'datetime' ? 'datetime-local' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
              className={inputClass}
              aria-label={label}
            />
          )}
          <span className="flex gap-1.5">
            <Button type="submit" variant="primary" loading={busy} className="px-2 py-1 text-xs">
              Save
            </Button>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </span>
        </form>
      ) : (
        <button
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          className="group flex min-w-0 items-start gap-1 text-left text-sm text-slate-800"
          aria-label={`Edit ${label}`}
        >
          <span className="min-w-0 break-words">{display || <span className="text-slate-400">—</span>}</span>
          <Pencil className="mt-0.5 size-3 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" aria-hidden />
          {unsure && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-amber-800">
              <TriangleAlert className="size-3" aria-hidden /> AI unsure, check
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function Properties({
  contact,
  meta,
  now,
  save,
}: {
  contact: ContactDetail
  meta: Meta
  now: string
  save: (u: ContactUpdate) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const c = contact
  const unsure = (k: string) => c.low_confidence_fields.includes(k)
  const latest = c.enquiries.at(-1)
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {contactFlags(c).length > 0 && (
        <ul className="space-y-1.5" aria-label="Flags">
          {contactFlags(c).map((f) => {
            const meta = FLAG[f]
            if (!meta) return null
            const Icon = meta.icon
            return (
              <li key={f} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ring-1', TONE[meta.tone])}>
                <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">{meta.label}.</span> {meta.explain}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <section aria-label="Details" className="flex flex-col gap-0.5">
        <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h3>
        <Property
          label="Status"
          field="status"
          kind="select"
          value={c.status ?? ''}
          display={<StatusPill status={c.status} />}
          options={[...meta.statuses.map((s) => ({ value: s, label: s })), { value: '', label: 'Not a lead' }]}
          onSave={(v) => save({ status: v || null })}
        />
        <Property
          label="Priority"
          field="priority"
          kind="select"
          value={c.priority}
          display={
            <span className="flex flex-col items-start gap-0.5">
              <PriorityBadge priority={c.priority} />
              <span className="text-[13px] text-slate-600">{c.priority_reason}</span>
            </span>
          }
          options={meta.priorities.map((p) => ({ value: p, label: p }))}
          onSave={(v) => save({ priority: v })}
        />
        {c.awaiting_reply && c.status !== null && (
          <div className="grid grid-cols-[104px_1fr] gap-2 px-2 py-1.5 text-sm">
            <span className="text-[13px] text-slate-500">Waiting</span>
            <span>
              <WaitTime contact={c} now={now} /> <span className="text-slate-500">for our reply</span>
            </span>
          </div>
        )}
        <Property
          label={FIELD_LABEL.interest}
          field="interest"
          kind="select"
          value={c.interest}
          unsure={unsure('interest')}
          display={`${INTEREST_LABEL[c.interest]}${c.team_size ? ` · ${c.team_size} people` : ''}`}
          options={meta.interests.map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i }))}
          onSave={(v) => save({ interest: v })}
        />
        <Property
          label="Type"
          field="message_type"
          kind="select"
          value={c.message_type}
          unsure={unsure('message_type')}
          display={TYPE_LABEL[c.message_type]}
          options={meta.message_types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))}
          onSave={(v) => save({ message_type: v })}
        />
        <Property label="Name" field="name" value={c.name ?? ''} unsure={unsure('name')} display={c.name} onSave={(v) => save({ name: v.trim() || null })} />
        <Property label="Role" field="role" value={c.role ?? ''} unsure={unsure('role')} display={c.role} onSave={(v) => save({ role: v.trim() || null })} />
        <Property label="Company" field="company" value={c.company ?? ''} unsure={unsure('company')} display={c.company} onSave={(v) => save({ company: v.trim() || null })} />
        <Property
          label="Team size"
          field="team_size"
          kind="number"
          value={c.team_size?.toString() ?? ''}
          unsure={unsure('team_size')}
          display={c.team_size}
          onSave={(v) => save({ team_size: v ? Number(v) : null })}
        />
        <Property
          label="Phone"
          field="phone"
          value={c.phone ?? ''}
          unsure={unsure('phone_in_message')}
          display={c.phone ?? <span className="text-amber-700">No phone yet</span>}
          onSave={(v) => save({ phone: v.trim() || null })}
        />
        <Property
          label="Language"
          field="language"
          kind="select"
          value={c.language}
          unsure={unsure('language')}
          display={LANGUAGE_NAME[c.language]}
          options={meta.languages.map((l) => ({ value: l, label: LANGUAGE_NAME[l] ?? l }))}
          onSave={(v) => save({ language: v })}
        />
        <Property
          label="Follow up by"
          field="follow_up_by"
          kind="datetime"
          value={toLocalInput(c.follow_up_by)}
          unsure={unsure('follow_up_by')}
          display={c.follow_up_by ? formatWhen(c.follow_up_by) : null}
          onSave={(v) => save({ follow_up_by: v || null })}
        />
        <Property label="Summary" field="summary" value={c.summary} unsure={unsure('summary')} display={c.summary} onSave={(v) => save({ summary: v })} />
        {c.missing_info.length > 0 && (
          <div className="grid grid-cols-[104px_1fr] gap-2 px-2 py-1.5 text-sm">
            <span className="text-[13px] text-slate-500">Still need</span>
            <span className="text-slate-800">{c.missing_info.join(', ')}</span>
          </div>
        )}
      </section>

      <form
        className="flex flex-col gap-1.5 border-t border-slate-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) void save({ note: note.trim() }).then((ok) => ok && setNote(''))
        }}
      >
        <label htmlFor="note" className="px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Add a note
        </label>
        <div className="flex gap-2">
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called, sending the proposal" className={inputClass} />
          <Button type="submit" disabled={!note.trim()}>
            Add
          </Button>
        </div>
      </form>
      {latest?.model_used && (
        <p className="px-0.5 text-[11px] text-slate-400">
          Fields filled by AI ({latest.model_used}). Click any value to correct it; corrected fields lose the "AI unsure" mark.
        </p>
      )}
    </div>
  )
}

// ---------------- Panel ----------------

export function ContactPanel({
  id,
  meta,
  queue,
  onNavigate,
  onClose,
  onChanged,
  onToast,
}: {
  id: number
  meta: Meta
  queue: number[]
  onNavigate: (id: number) => void
  onClose: () => void
  onChanged: () => void
  onToast: (message: string) => void
}) {
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = `${meta.demo_now}:00+06:00`
  const index = queue.indexOf(id)
  const prev = index > 0 ? queue[index - 1] : null
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null

  useEffect(() => {
    let alive = true
    api.contact(id).then(
      (c) => alive && setContact(c),
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.key === 'Escape' && !typing) onClose()
      if (typing) return
      if (e.key === 'j' && next) onNavigate(next)
      if (e.key === 'k' && prev) onNavigate(prev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose, onNavigate])

  const save = async (update: ContactUpdate): Promise<boolean> => {
    if (!contact) return false
    setError(null)
    try {
      const updated = await api.updateContact(contact.id, update)
      setContact(updated)
      onChanged()
      if (update.status !== undefined && update.status !== contact.status) onToast(`${displayName(updated)} moved to ${updated.status ?? 'Not a lead'}`)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return false
    }
  }

  const channels = useMemo(() => contact?.channels.map((ch) => CHANNEL[ch]?.short ?? ch).join(', '), [contact])

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Contact details">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[1120px] flex-col bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-6 py-3">
          {contact ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight text-slate-900">{displayName(contact)}</h2>
                <PriorityBadge priority={contact.priority} />
                <StatusPill status={contact.status} />
                {contact.suggested_status && (
                  <StatusSuggestion
                    status={contact.suggested_status}
                    onMove={() => void save({ status: contact.suggested_status })}
                    onDismiss={() => void save({ dismiss_suggestion: true })}
                  />
                )}
                {contact.overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">Overdue</span>}
              </div>
              <p className="truncate text-[13px] text-slate-500">
                {[contact.role, contact.company].filter(Boolean).join(', ')}
                {(contact.role || contact.company) && ' · '}
                {contact.phone ?? 'No phone yet'} · {channels} · {contact.enquiry_count} {contact.enquiry_count === 1 ? 'message' : 'messages'}
              </p>
            </div>
          ) : (
            <Spinner label="Loading contact…" />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {index >= 0 && queue.length > 1 && (
              <>
                <span className="mr-1 text-xs tabular-nums text-slate-500" data-testid="queue-position">
                  {index + 1} of {queue.length}
                </span>
                <button disabled={!prev} onClick={() => prev && onNavigate(prev)} className="rounded-lg p-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40" aria-label="Previous contact (k)" title="Previous (k)">
                  <ChevronLeft className="size-4" />
                </button>
                <button disabled={!next} onClick={() => next && onNavigate(next)} className="rounded-lg p-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40" aria-label="Next contact (j)" title="Next (j)">
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        </header>

        {error && (
          <div className="px-6 pt-3">
            <ErrorNote message={error} />
          </div>
        )}

        {contact && (
          // Phones: one scrolling column (conversation, reply, details). Desktop: two columns that scroll on their own.
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
            <div className="flex flex-col bg-slate-50 lg:min-h-0 lg:border-r lg:border-slate-200">
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <Thread contact={contact} />
              </div>
              <div className="shrink-0 px-3 pb-3 lg:max-h-[56%] lg:overflow-y-auto lg:px-4">
                <ReplyPanel
                  key={`${contact.id}-${contact.enquiries.at(-1)?.id}`}
                  contact={contact}
                  onSent={(c) => {
                    setContact(c)
                    onChanged()
                    onToast(c.status === 'Contacted' ? `Reply logged · ${displayName(c)} moved to Contacted` : 'Reply logged')
                  }}
                />
              </div>
            </div>
            <div className="lg:min-h-0 lg:overflow-y-auto">
              <Properties contact={contact} meta={meta} now={now} save={save} />
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
