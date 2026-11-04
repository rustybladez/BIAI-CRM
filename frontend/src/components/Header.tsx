import { ClipboardPaste, Clock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { demoNowIso, formatWhen } from '../lib/labels'
import { Button } from './ui'
import { cx, inputClass } from '../lib/ui'

export function Header({
  demoNow,
  urgent,
  overdue,
  overdueOnly,
  onToggleOverdue,
  onPaste,
  onSetClock,
  onReset,
}: {
  demoNow: string
  urgent: number
  overdue: number
  overdueOnly: boolean
  onToggleOverdue: () => void
  onPaste: () => void
  onSetClock: (value: string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(demoNow)
  const [busy, setBusy] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-slate-900">BIAI CRM</span>
          <span className="hidden text-sm text-slate-500 md:inline">Enquiries from WhatsApp, Facebook, web and phone</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white" data-testid="urgent-count">
            {urgent} urgent
          </span>
          <button
            onClick={onToggleOverdue}
            aria-pressed={overdueOnly}
            data-testid="overdue-count"
            className={cx(
              'rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 transition',
              overdueOnly ? 'bg-red-600 text-white ring-red-600' : 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',
            )}
            title="Show only overdue contacts"
          >
            {overdue} overdue
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editing ? (
            <form
              className="flex items-center gap-1"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                await onSetClock(value)
                setBusy(false)
                setEditing(false)
              }}
            >
              <input
                type="datetime-local"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={cx(inputClass, 'w-auto py-1')}
                aria-label="Demo time"
              />
              <Button type="submit" loading={busy}>
                Set
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <button
              onClick={() => {
                setValue(demoNow)
                setEditing(true)
              }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              title="All overdue / 48h checks use this time. Click to change."
              data-testid="demo-now"
            >
              <Clock className="size-4" aria-hidden />
              Demo time: <span className="font-medium text-slate-800">{formatWhen(demoNowIso(demoNow))}</span>
            </button>
          )}
          <Button
            variant="ghost"
            title="Reload the 20 sample enquiries and undo all changes"
            onClick={async () => {
              if (window.confirm('Reset the demo? This reloads the 20 sample enquiries and removes all changes.')) await onReset()
            }}
          >
            <RotateCcw className="size-4" /> Reset demo
          </Button>
          <Button variant="primary" onClick={onPaste}>
            <ClipboardPaste className="size-4" /> Paste message
          </Button>
        </div>
      </div>
    </header>
  )
}
