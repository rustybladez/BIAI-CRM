import { GitMerge, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type AnalyseResult, type Extraction, type IntakeMessage, type Meta } from '../api'
import { FIELD_LABEL, FLAG, INTEREST_LABEL, LANGUAGE_NAME, TYPE_LABEL } from '../lib/labels'
import { Button, Chip, ErrorNote, Spinner } from './ui'
import { cx, inputClass } from '../lib/ui'

// INVENTED messages for the live demo. Never the 20 sample enquiries.
const SAMPLES: { label: string; msg: IntakeMessage }[] = [
  {
    label: 'বাংলা · company',
    msg: {
      channel: 'Website form',
      sender_name: 'Nusrat Jahan (HR Manager, a pharma company in Tejgaon)',
      phone: '',
      received_at: null,
      message: 'আমাদের ৩০ জন কর্মীর জন্য AI ট্রেনিং দরকার। অনলাইনে হলে ভালো হয়। আমার নম্বর ০১৯৮৮৭৬৫৪৩২, কাল সকালে কল দিবেন?',
    },
  },
  {
    label: 'Banglish · fellowship',
    msg: {
      channel: 'WhatsApp',
      sender_name: 'Shuvo',
      phone: '01822334455',
      received_at: null,
      message: 'Bhai fellowship er fee koto? Kisti te dewa jabe? Ami ei mash ei join korte chai.',
    },
  },
  {
    label: 'English · student',
    msg: {
      channel: 'Facebook Messenger',
      sender_name: 'Tanjila Haque',
      phone: '',
      received_at: null,
      message: "Hi! I'm a final-year CSE student. Is the bootcamp OK for beginners, and is there a student discount?",
    },
  },
]

const EMPTY: IntakeMessage = { channel: 'WhatsApp', sender_name: '', phone: '', received_at: null, message: '' }

export function IntakeModal({
  meta,
  onClose,
  onSaved,
}: {
  meta: Meta
  onClose: () => void
  onSaved: (contactId: number) => void
}) {
  const [msg, setMsg] = useState<IntakeMessage>({ ...EMPTY, received_at: meta.demo_now })
  const [result, setResult] = useState<AnalyseResult | null>(null)
  const [ex, setEx] = useState<Extraction | null>(null)
  const [busy, setBusy] = useState<'analyse' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const payload = (): IntakeMessage => ({ ...msg, phone: msg.phone?.trim() || null, received_at: msg.received_at || null })

  const analyse = async () => {
    setBusy('analyse')
    setError(null)
    setResult(null)
    try {
      const r = await api.analyse(payload())
      setResult(r)
      setEx(r.extraction)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!result || !ex) return
    setBusy('save')
    setError(null)
    try {
      const r = await api.save(payload(), result, ex)
      onSaved(r.contact_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(null)
    }
  }

  const canAnalyse = msg.sender_name.trim() && msg.message.trim()
  const unsure = (k: string) => ex?.low_confidence_fields.includes(k)
  const exField = (k: keyof Extraction, input: React.ReactNode) => (
    <label className={cx('block rounded-lg p-1.5', unsure(k) && 'bg-amber-50 ring-1 ring-amber-300')}>
      <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {FIELD_LABEL[k] ?? k}
        {unsure(k) && (
          <span className="inline-flex items-center gap-0.5 text-amber-800">
            <TriangleAlert className="size-3" aria-hidden /> AI unsure, please check
          </span>
        )}
      </span>
      {input}
    </label>
  )
  const exText = (k: 'name' | 'role' | 'company' | 'summary') =>
    ex && exField(k, <input value={ex[k] ?? ''} onChange={(e) => setEx({ ...ex, [k]: e.target.value || null })} className={inputClass} />)
  const exSelect = (k: 'interest' | 'message_type' | 'language' | 'priority', options: { value: string; label: string }[]) =>
    ex &&
    exField(
      k,
      <select value={ex[k]} onChange={(e) => setEx({ ...ex, [k]: e.target.value })} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Paste a message">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Paste a message</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Try an invented example:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setMsg({ ...s.msg, received_at: meta.demo_now })
                  setResult(null)
                  setError(null)
                }}
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Channel</span>
              <select value={msg.channel} onChange={(e) => setMsg({ ...msg, channel: e.target.value })} className={inputClass}>
                {meta.channels.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Received</span>
              <input
                type="datetime-local"
                value={msg.received_at ?? ''}
                onChange={(e) => setMsg({ ...msg, received_at: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Sender name (as shown in the app)</span>
              <input value={msg.sender_name} onChange={(e) => setMsg({ ...msg, sender_name: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Phone (optional)</span>
              <input value={msg.phone ?? ''} onChange={(e) => setMsg({ ...msg, phone: e.target.value })} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Message (Bangla, Banglish or English)</span>
            <textarea
              rows={4}
              value={msg.message}
              onChange={(e) => setMsg({ ...msg, message: e.target.value })}
              className={cx(inputClass, 'text-[15px] leading-relaxed')}
            />
          </label>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={analyse} disabled={!canAnalyse} loading={busy === 'analyse'}>
              <Sparkles className="size-4" /> Analyse with AI
            </Button>
            {busy === 'analyse' && <Spinner label="Reading the message… (a few seconds)" />}
          </div>
          {error && <ErrorNote message={error} onRetry={result ? save : analyse} />}

          {result && ex && (
            <section className="space-y-3 rounded-2xl border border-slate-200 p-4" aria-label="Review">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">Check what the AI found</h3>
                <span className="text-xs text-slate-500">
                  {result.model_used} · {result.latency_ms} ms
                </span>
              </div>

              {result.duplicate ? (
                <div className="flex gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 ring-1 ring-indigo-200">
                  <GitMerge className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Same phone as <strong>{result.duplicate.name ?? 'an existing contact'}</strong>: this message will be merged
                    into their record.
                    {result.duplicate.would_escalate && (
                      <strong className="text-red-700"> They asked before and got no reply, so they will become urgent.</strong>
                    )}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  New contact
                  {result.phone ? `, phone ${result.phone}` : ''}
                  {result.missing_phone && (
                    <span className="text-amber-800"> · no phone number yet (the reply will ask for one)</span>
                  )}
                  {result.status === null && <span> · will go to "Not a lead"</span>}
                </p>
              )}

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {exText('name')}
                {exText('role')}
                {exText('company')}
                {exField(
                  'team_size',
                  <input
                    type="number"
                    min={1}
                    value={ex.team_size ?? ''}
                    onChange={(e) => setEx({ ...ex, team_size: e.target.value ? Number(e.target.value) : null })}
                    className={inputClass}
                  />,
                )}
                {exSelect('message_type', meta.message_types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })))}
                {exSelect('interest', meta.interests.map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i })))}
                {exSelect('language', meta.languages.map((l) => ({ value: l, label: LANGUAGE_NAME[l] ?? l })))}
                {exSelect('priority', meta.priorities.map((p) => ({ value: p, label: p })))}
                {exField(
                  'follow_up_by',
                  <input
                    type="datetime-local"
                    value={ex.follow_up_by ?? ''}
                    onChange={(e) => setEx({ ...ex, follow_up_by: e.target.value || null })}
                    className={inputClass}
                  />,
                )}
                <div className="col-span-2 sm:col-span-3">{exText('summary')}</div>
              </div>
              <p className="text-sm text-slate-600">
                <span className="font-medium">Priority reason:</span> {ex.priority_reason}
              </p>
              {ex.flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ex.flags.map((f) => (
                    <Chip key={f} className="bg-slate-100 text-slate-700">
                      {FLAG[f]?.label ?? f}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={save} loading={busy === 'save'}>
                  {result.duplicate ? 'Save and merge' : 'Save contact'}
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
