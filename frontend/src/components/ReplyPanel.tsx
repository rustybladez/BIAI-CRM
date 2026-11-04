import { Check, Copy, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type ContactDetail, type ReplyDraft } from '../api'
import { FORMAT_LABEL, LANGUAGE_NAME } from '../lib/labels'
import { Button, Chip, ErrorNote, Spinner } from './ui'
import { cx } from '../lib/ui'

const LANGS = ['bangla', 'banglish', 'english']

export function ReplyPanel({ contact, onSent }: { contact: ContactDetail; onSent: (c: ContactDetail) => void }) {
  const latestEnquiryId = contact.enquiries.at(-1)?.id ?? null
  const seeded = contact.reply_draft && contact.reply_draft.enquiry_id === latestEnquiryId ? contact.reply_draft : null
  const [draft, setDraft] = useState<ReplyDraft | null>(seeded)
  const [body, setBody] = useState(seeded?.body ?? '')
  const [loading, setLoading] = useState<string | null>(null) // language being generated
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const started = useRef(false)

  const load = async (language?: string, regenerate = false) => {
    setLoading(language ?? contact.language)
    setError(null)
    try {
      const d = await api.reply(contact.id, language, regenerate)
      setDraft(d)
      setBody(d.body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a reply suggestion')
    } finally {
      setLoading(null)
    }
  }

  // No draft for the latest message yet (e.g. a freshly pasted one): ask the AI once.
  useEffect(() => {
    if (!seeded && !started.current) {
      started.current = true
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      // Clipboard can be blocked (e.g. no permission); the text is still selectable.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const markSent = async () => {
    setSending(true)
    setError(null)
    try {
      onSent(await api.markSent(contact.id, body))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark as sent')
    } finally {
      setSending(false)
    }
  }

  const isNone = draft?.format === 'none'
  return (
    <section aria-label="Suggested reply" className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">
          Suggested reply
          {draft && !isNone && <span className="ml-2 text-sm font-normal text-slate-500">{FORMAT_LABEL[draft.format]}</span>}
        </h3>
        {!isNone && (
          <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200" role="group" aria-label="Reply language">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => draft?.language !== l && load(l)}
                aria-pressed={draft?.language === l}
                disabled={loading !== null}
                className={cx(
                  'rounded-md px-2.5 py-1 text-sm font-medium transition',
                  draft?.language === l ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {LANGUAGE_NAME[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {loading && <Spinner label={`Writing a reply in ${LANGUAGE_NAME[loading]}… (AI, a few seconds)`} />}
        {error && <ErrorNote message={error} onRetry={() => load(draft?.language)} />}

        {draft && isNone && (
          <p className="text-sm text-slate-600">No reply: this looks like spam. It stays out of the pipeline.</p>
        )}

        {draft && !isNone && !loading && (
          <>
            {draft.check_before_sending && (
              <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <div className="font-medium">Check before sending</div>
                  <ul className="list-disc pl-4">
                    {draft.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(14, Math.max(5, Math.ceil(body.length / 70) + body.split('\n').length))}
              aria-label="Reply text"
              lang={draft.language === 'bangla' ? 'bn' : 'en'}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-[15px] leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {draft.needs_confirmation.length > 0 && (
              <div className="rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
                <div className="font-medium text-slate-700">Not in the FAQ, the reply says the team will confirm:</div>
                <ul className="mt-1 list-disc pl-5 text-slate-600">
                  {draft.needs_confirmation.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={markSent} loading={sending}>
                <Send className="size-4" /> Mark as sent
              </Button>
              <Button variant="ghost" onClick={() => load(draft.language, true)}>
                <RefreshCw className="size-4" /> Regenerate
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <span>Facts from the FAQ:</span>
              {draft.faq_keys_used.length ? (
                draft.faq_keys_used.map((k) => (
                  <Chip key={k} className="bg-white text-slate-600 ring-1 ring-slate-200">
                    {k.replaceAll('_', ' ')}
                  </Chip>
                ))
              ) : (
                <span>none</span>
              )}
              <span className="ml-auto">
                Demo FAQ, placeholder values{draft.model_used ? ` · ${draft.model_used} · ${draft.latency_ms} ms` : ''}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
