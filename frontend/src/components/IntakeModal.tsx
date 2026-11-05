import { GitMerge, Sparkles, TriangleAlert, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type AnalyseResult, type Extraction, type IntakeMessage, type Meta } from '../api'
import { CHANNEL, FIELD_LABEL, FLAG, INTEREST_LABEL, LANGUAGE_NAME, TYPE_LABEL } from '../lib/labels'
import { ChannelIcon } from './ContactCard'
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
  {
    // A row copied from a sheet: time, channel, name, phone and message all inside the paste.
    label: 'Messy paste',
    msg: {
      channel: null,
      sender_name: '',
      phone: '',
      received_at: null,
      message:
        '27/10/2026 21:40,WhatsApp,Sabbir Hossain,+880 1712-000042,"Salam vai. Bootcamp er next batch kobe? Weekend e class hoy? Kal shondhar por ekta call diyen plz"',
    },
  },
]

const EMPTY: IntakeMessage = { channel: null, sender_name: '', phone: '', received_at: null, message: '' }

const TIME_SOURCE: Record<AnalyseResult['received_at_source'], string> = {
  form: 'as entered',
  message: 'from the paste',
  demo_clock: 'not in the paste: demo clock',
}

// Empty name or channel after analysis: staff fill it in. Only the channel is required to save.
function PleaseFill({ empty, label, children }: { empty: boolean; label: string; children: React.ReactNode }) {
  return (
    <label className={cx('block rounded-lg p-1.5', empty && 'bg-red-50 ring-1 ring-red-300')}>
      <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        {empty && <span className="text-red-700">Please fill</span>}
      </span>
      {children}
    </label>
  )
}

export function IntakeModal({
  meta,
  onClose,
  onSaved,
}: {
  meta: Meta
  onClose: () => void
  onSaved: (contactId: number) => void
}) {
  // received_at starts empty: a time in the paste wins, else the server uses the demo clock.
  const [msg, setMsg] = useState<IntakeMessage>(EMPTY)
  const [result, setResult] = useState<AnalyseResult | null>(null)
  const [ex, setEx] = useState<Extraction | null>(null)
  // Check step: form value first, then what the AI found in the paste. Staff can change both.
  const [check, setCheck] = useState<{ channel: string | null; received_at: string }>({ channel: null, received_at: '' })
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
      setCheck({ channel: r.channel, received_at: r.received_at })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!result || !ex || !check.channel) return
    setBusy('save')
    setError(null)
    try {
      const r = await api.save({ ...payload(), channel: check.channel, received_at: check.received_at || null }, result, ex)
      onSaved(r.contact_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(null)
    }
  }

  // AI down: start from a blank record so the enquiry can still be saved.
  const fillByHand = () => {
    const manual: Extraction = {
      message_type: 'lead',
      message_type_reason: 'Entered by hand.',
      name: msg.sender_name.replace(/\s*\(.*\)\s*$/, '').trim() || null,
      role: null,
      company: null,
      team_size: null,
      phone_in_message: null,
      channel_in_message: null,
      received_at_in_message: null,
      interest: 'unclear',
      interest_detail: null,
      language: /[\u0980-\u09FF]/.test(msg.message) ? 'bangla' : 'english',
      status: 'New',
      priority: 'medium',
      priority_reason: 'Entered by hand while the AI was unavailable.',
      follow_up_by: null,
      flags: [],
      summary: msg.message.slice(0, 140),
      missing_info: [],
      low_confidence_fields: [],
    }
    const received_at = msg.received_at || meta.demo_now
    setResult({
      extraction: manual,
      model_used: 'entered by hand',
      latency_ms: 0,
      phone: null,
      missing_phone: !msg.phone,
      status: 'New',
      duplicate: null,
      channel: msg.channel,
      received_at,
      received_at_source: msg.received_at ? 'form' : 'demo_clock',
    })
    setEx(manual)
    setCheck({ channel: msg.channel, received_at })
    setError(null)
  }

  const canAnalyse = msg.message.trim()
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

  const isManual = result?.model_used === 'entered by hand'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="New enquiry">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3.5">
          <h2 className="text-lg font-semibold text-slate-900">New enquiry</h2>
          <ol className="ml-2 hidden items-center gap-1.5 text-xs text-slate-400 sm:flex" aria-label="Steps">
            <li className={cx(!result && 'font-semibold text-indigo-700')}>1 Paste</li>
            <li>→</li>
            <li className={cx(result && 'font-semibold text-indigo-700')}>2 Check</li>
            <li>→</li>
            <li>3 Save</li>
          </ol>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Left: the message */}
          <div
            className="space-y-3.5 px-6 py-5"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canAnalyse && !busy) void analyse()
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-slate-500">Invented examples:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setMsg(s.msg)
                    setResult(null)
                    setError(null)
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[13px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-500">Channel</legend>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={msg.channel === null}
                  onClick={() => setMsg({ ...msg, channel: null })}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 transition',
                    msg.channel === null ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-indigo-300',
                  )}
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  Auto-detect
                </button>
                {meta.channels.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={msg.channel === c}
                    onClick={() => setMsg({ ...msg, channel: c })}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 transition',
                      msg.channel === c ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-indigo-300',
                    )}
                  >
                    <ChannelIcon channel={c} />
                    {CHANNEL[c]?.short ?? c}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Sender name (optional, as shown in the app)</span>
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
                rows={6}
                value={msg.message}
                onChange={(e) => setMsg({ ...msg, message: e.target.value })}
                placeholder="Paste the message here…"
                className={cx(inputClass, 'text-[15px] leading-relaxed')}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Received (optional: else the time in the paste, else the demo clock)</span>
              <input type="datetime-local" value={msg.received_at ?? ''} onChange={(e) => setMsg({ ...msg, received_at: e.target.value || null })} className={inputClass} />
            </label>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={analyse} disabled={!canAnalyse} loading={busy === 'analyse'}>
                <Sparkles className="size-4" /> Analyse with AI
              </Button>
              <span className="text-xs text-slate-400">Ctrl + Enter</span>
            </div>
          </div>

          {/* Right: what the AI found */}
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 md:border-l md:border-t-0" aria-label="Review">
            {!result && !busy && !error && (
              <div className="my-auto space-y-2 py-6 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">The AI will read the message and fill in:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>who it is (name, role, company, team size, phone in the text)</li>
                  <li>what they want, the language, and whether it is a lead, support, a complaint or spam</li>
                  <li>priority with a reason, and any deadline ("tomorrow after 5 PM")</li>
                </ul>
                <p className="text-slate-500">You check everything before it is saved. Fields the AI is unsure about are marked in amber.</p>
              </div>
            )}
            {busy === 'analyse' && (
              <div className="my-auto py-6">
                <Spinner label="Reading the message… (a few seconds)" />
              </div>
            )}
            {error && <ErrorNote message={error} onRetry={result ? save : analyse} />}
            {error && !result && (
              <p className="text-sm text-slate-600">
                Or{' '}
                <button onClick={fillByHand} className="font-medium text-indigo-700 underline">
                  fill in the details by hand
                </button>{' '}
                so the enquiry is not lost.
              </p>
            )}

            {result && ex && (
              <section className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{isManual ? 'Fill in the details' : 'Check what the AI found'}</h3>
                  {!isManual && (
                    <span className="text-xs text-slate-500">
                      {result.model_used} · {(result.latency_ms / 1000).toFixed(1)} s
                    </span>
                  )}
                </div>

                {result.duplicate ? (
                  <div className="flex gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 ring-1 ring-indigo-200">
                    <GitMerge className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      Same phone as <strong>{result.duplicate.name ?? 'an existing contact'}</strong>: this message will be merged into their record.
                      {result.duplicate.would_escalate && <strong className="text-red-700"> They asked before and got no reply, so they will become urgent.</strong>}
                    </span>
                  </div>
                ) : (
                  <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
                    New contact
                    {result.phone ? `, phone ${result.phone}` : ''}
                    {result.missing_phone && <span className="text-amber-800"> · no phone number yet (the reply will ask for one)</span>}
                    {result.status === null && <span> · will go to "Not a lead"</span>}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <PleaseFill empty={!check.channel} label="Channel">
                    <select
                      value={check.channel ?? ''}
                      onChange={(e) => setCheck({ ...check, channel: e.target.value || null })}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {meta.channels.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </PleaseFill>
                  <label className="block p-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      Received <span className="font-normal text-slate-400">({TIME_SOURCE[result.received_at_source]})</span>
                    </span>
                    <input
                      type="datetime-local"
                      value={check.received_at}
                      onChange={(e) => setCheck({ ...check, received_at: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  {ex.name?.trim() ? (
                    exText('name')
                  ) : (
                    <PleaseFill empty label="Name">
                      <input value={ex.name ?? ''} onChange={(e) => setEx({ ...ex, name: e.target.value || null })} className={inputClass} />
                    </PleaseFill>
                  )}
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
                      aria-label="Team size"
                    />,
                  )}
                  {exSelect('message_type', meta.message_types.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })))}
                  {exSelect('interest', meta.interests.map((i) => ({ value: i, label: INTEREST_LABEL[i] ?? i })))}
                  {exSelect('language', meta.languages.map((l) => ({ value: l, label: LANGUAGE_NAME[l] ?? l })))}
                  {exSelect('priority', meta.priorities.map((p) => ({ value: p, label: p })))}
                  <div className="col-span-2">
                    {exField(
                      'follow_up_by',
                      <input
                        type="datetime-local"
                        value={ex.follow_up_by ?? ''}
                        onChange={(e) => setEx({ ...ex, follow_up_by: e.target.value || null })}
                        className={inputClass}
                      />,
                    )}
                  </div>
                  <div className="col-span-2">{exText('summary')}</div>
                </div>
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Why {ex.priority}:</span> {ex.priority_reason}
                </p>
                {ex.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ex.flags.map((f) => (
                      <Chip key={f} className="bg-white text-slate-700 ring-1 ring-slate-200">
                        {FLAG[f]?.label ?? f}
                      </Chip>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-end gap-2 pt-2">
                  {!check.channel && <span className="mr-auto text-sm text-red-700">Choose the channel to save.</span>}
                  <Button onClick={onClose}>Cancel</Button>
                  <Button variant="primary" onClick={save} disabled={!check.channel} loading={busy === 'save'}>
                    {result.duplicate ? 'Save and merge' : 'Save contact'}
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
