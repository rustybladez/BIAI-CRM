import { ArrowRightLeft, GitMerge, MessageSquareText, Send, StickyNote, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { ChannelIcon, PriorityBadge } from './ContactCard'
import { ReplyPanel } from './ReplyPanel'
import { Button, Chip, ErrorNote, Spinner } from './ui'
import { cx, inputClass } from '../lib/ui'

type Form = {
  name: string
  role: string
  company: string
  team_size: string
  phone: string
  interest: string
  message_type: string
  priority: string
  status: string
  follow_up_by: string
  summary: string
}

function toForm(c: ContactDetail): Form {
  return {
    name: c.name ?? '',
    role: c.role ?? '',
    company: c.company ?? '',
    team_size: c.team_size?.toString() ?? '',
    phone: c.phone ?? '',
    interest: c.interest,
    message_type: c.message_type,
    priority: c.priority,
    status: c.status ?? '',
    follow_up_by: toLocalInput(c.follow_up_by),
    summary: c.summary,
  }
}

function changes(before: Form, after: Form): ContactUpdate {
  const out: ContactUpdate = {}
  const text = (k: 'name' | 'role' | 'company' | 'phone') => {
    if (before[k] !== after[k]) out[k] = after[k].trim() || null
  }
  text('name')
  text('role')
  text('company')
  text('phone')
  if (before.team_size !== after.team_size) out.team_size = after.team_size ? Number(after.team_size) : null
  for (const k of ['interest', 'message_type', 'priority', 'summary'] as const) {
    if (before[k] !== after[k]) out[k] = after[k]
  }
  if (before.status !== after.status) out.status = after.status || null
  if (before.follow_up_by !== after.follow_up_by) out.follow_up_by = after.follow_up_by || null
  return out
}

const ACTIVITY_ICON = { inbound: MessageSquareText, reply_sent: Send, status_change: ArrowRightLeft, note: StickyNote, merge: GitMerge }

export function ContactDrawer({
  id,
  meta,
  onClose,
  onChanged,
}: {
  id: number
  meta: Meta
  onClose: () => void
  onChanged: () => void
}) {
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  const show = (c: ContactDetail) => {
    setContact(c)
    setForm(toForm(c))
  }

  useEffect(() => {
    let alive = true
    api.contact(id).then(
      (c) => alive && show(c),
      (e: Error) => alive && setError(e.message),
    )
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
    }
  }, [id, onClose])

  const save = async (update: ContactUpdate) => {
    if (!contact) return
    setSaving(true)
    setError(null)
    try {
      show(await api.updateContact(contact.id, update))
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const pending = contact && form ? changes(toForm(contact), form) : {}
  const dirty = Object.keys(pending).length > 0

  const field = (key: keyof Form, input: React.ReactNode) => {
    const unsure = contact?.low_confidence_fields.includes(key)
    return (
      <label className={cx('block rounded-lg p-1.5', unsure && 'bg-amber-50 ring-1 ring-amber-300')}>
        <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
          {FIELD_LABEL[key] ?? key}
          {unsure && (
            <span className="inline-flex items-center gap-0.5 text-amber-800">
              <TriangleAlert className="size-3" aria-hidden /> AI unsure, please check
            </span>
          )}
        </span>
        {input}
      </label>
    )
  }
  const text = (key: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    form &&
    field(
      key,
      <input {...props} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />,
    )
  const select = (key: keyof Form, options: { value: string; label: string }[]) =>
    form &&
    field(
      key,
      <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    )

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Contact details">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          {contact ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-slate-900">{displayName(contact)}</h2>
                <PriorityBadge priority={contact.priority} />
                {contact.overdue && <Chip className="bg-red-50 text-red-700 ring-1 ring-red-200">Overdue</Chip>}
                <Chip>{contact.status ?? 'Not a lead'}</Chip>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium">Why {contact.priority}:</span> {contact.priority_reason}
              </p>
            </div>
          ) : (
            <Spinner label="Loading contact…" />
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="px-6 pt-4">
            <ErrorNote message={error} />
          </div>
        )}

        {contact && form && (
          <div className="space-y-6 px-6 py-5">
            {contactFlags(contact).length > 0 && (
              <ul className="space-y-1.5">
                {contactFlags(contact).map((f) => {
                  const meta = FLAG[f]
                  if (!meta) return null
                  const Icon = meta.icon
                  return (
                    <li key={f} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1', TONE[meta.tone])}>
                      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-medium">{meta.label}.</span> {meta.explain}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            <ReplyPanel
              key={`${contact.id}-${contact.enquiries.at(-1)?.id}`}
              contact={contact}
              onSent={(c) => {
                show(c)
                onChanged()
              }}
            />

            <section aria-label="Details">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Details</h3>
                <span className="text-xs text-slate-500">Filled by AI from the message. Edit anything that is wrong.</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {text('name')}
                {text('role')}
                {text('company')}
                {text('team_size', { type: 'number', min: 1 })}
                {text('phone', { placeholder: contact.missing_phone ? 'No phone yet' : '' })}
                {select('status', [
                  ...meta.statuses.map((s) => ({ value: s, label: s })),
                  { value: '', label: 'Not a lead' },
                ])}
                {select('interest', meta.interests.map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i })))}
                {select('message_type', meta.message_types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })))}
                {select('priority', meta.priorities.map((p) => ({ value: p, label: p })))}
                {text('follow_up_by', { type: 'datetime-local' })}
                <div className="col-span-2">{text('summary')}</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="primary" disabled={!dirty} loading={saving} onClick={() => save(pending)}>
                  Save changes
                </Button>
                {dirty && (
                  <Button variant="ghost" onClick={() => setForm(toForm(contact))}>
                    Undo
                  </Button>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  Language: {LANGUAGE_NAME[contact.language]}
                  {contact.missing_info.length > 0 && ` · Still need: ${contact.missing_info.join(', ')}`}
                </span>
              </div>
            </section>

            <section aria-label="Timeline">
              <h3 className="mb-2 font-semibold text-slate-900">Timeline</h3>
              <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
                {contact.activities.map((a) => {
                  const Icon = ACTIVITY_ICON[a.kind as keyof typeof ACTIVITY_ICON] ?? StickyNote
                  const enquiry = a.kind === 'inbound' ? contact.enquiries.find((e) => e.message === a.body && e.received_at === a.at) : undefined
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[27px] top-0.5 rounded-full bg-white p-0.5 text-slate-500 ring-2 ring-slate-200">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{formatWhen(a.at)}</span>
                        {enquiry && (
                          <span className="inline-flex items-center gap-1">
                            · <ChannelIcon channel={enquiry.channel} /> {CHANNEL[enquiry.channel]?.short} · from {enquiry.sender_name_raw}
                          </span>
                        )}
                        {a.kind === 'reply_sent' && <span>· Reply sent</span>}
                        {a.kind === 'status_change' && <span>· Status changed</span>}
                        {a.kind === 'note' && <span>· Note</span>}
                      </div>
                      {a.kind === 'inbound' ? (
                        <blockquote className="mt-1 rounded-lg bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-800 ring-1 ring-slate-200">
                          {a.body}
                        </blockquote>
                      ) : (
                        <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{a.body || '—'}</p>
                      )}
                      {enquiry?.model_used && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Read by {enquiry.model_used} in {enquiry.latency_ms} ms
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (note.trim()) void save({ note: note.trim() }).then(() => setNote(''))
                }}
              >
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className={inputClass} />
                <Button type="submit" disabled={!note.trim()}>
                  Add
                </Button>
              </form>
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}
