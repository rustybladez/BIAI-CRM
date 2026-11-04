import { CalendarClock, Clock } from 'lucide-react'
import type { ContactSummary } from '../api'
import { CHANNEL, FLAG, INTEREST_LABEL, LANGUAGE_LABEL, PRIORITY_STYLE, TONE, TYPE_LABEL, contactFlags, displayName, formatWhen } from '../lib/labels'
import { Chip } from './ui'
import { cx } from '../lib/ui'

export function PriorityBadge({ priority }: { priority: string }) {
  return <Chip className={cx('uppercase tracking-wide', PRIORITY_STYLE[priority])}>{priority}</Chip>
}

export function ChannelIcon({ channel, className }: { channel: string | null; className?: string }) {
  const c = channel ? CHANNEL[channel] : undefined
  if (!c) return null
  const Icon = c.icon
  return <Icon className={cx('size-3.5 shrink-0', className)} aria-label={channel ?? ''} />
}

export function FlagChips({ contact, withLabels = false }: { contact: ContactSummary; withLabels?: boolean }) {
  const flags = contactFlags(contact)
  if (!flags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => {
        const meta = FLAG[f]
        if (!meta) return null
        const Icon = meta.icon
        return (
          <Chip key={f} className={cx('ring-1', TONE[meta.tone])} title={`${meta.label}: ${meta.explain}`}>
            <Icon className="size-3" aria-hidden />
            {withLabels ? meta.label : <span className="sr-only">{meta.label}</span>}
          </Chip>
        )
      })}
    </div>
  )
}

export function ContactCard({
  contact,
  onOpen,
  draggable = true,
}: {
  contact: ContactSummary
  onOpen: (id: number) => void
  draggable?: boolean
}) {
  const c = contact
  const supportish = c.message_type === 'support' || c.message_type === 'complaint'
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/contact-id', String(c.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(c.id)}
      data-testid={`card-${c.id}`}
      className={cx(
        'group w-full rounded-xl border bg-white p-3 text-left shadow-xs transition hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-indigo-500',
        c.overdue ? 'border-red-300' : 'border-slate-200',
        supportish && 'border-l-4 border-l-violet-400',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-slate-500">
            <ChannelIcon channel={c.channel} />
            <span className="truncate text-xs">{c.channel ? CHANNEL[c.channel]?.short : ''}</span>
            {c.enquiry_count > 1 && (
              <span className="shrink-0 rounded bg-slate-100 px-1 text-[11px] font-medium text-slate-600" title={`${c.enquiry_count} messages`}>
                ×{c.enquiry_count}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">{displayName(c)}</div>
          {(c.role || c.company) && (
            <div className="truncate text-xs text-slate-500">{[c.role, c.company].filter(Boolean).join(', ')}</div>
          )}
        </div>
        <PriorityBadge priority={c.priority} />
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.summary}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {supportish && <Chip className="bg-violet-100 text-violet-800">{TYPE_LABEL[c.message_type]}</Chip>}
        <Chip className="bg-indigo-50 text-indigo-700">
          {INTEREST_LABEL[c.interest]}
          {c.team_size ? ` · ${c.team_size} people` : ''}
        </Chip>
        <Chip className="bg-slate-100 text-slate-700">{LANGUAGE_LABEL[c.language]}</Chip>
        {c.overdue && (
          <Chip className="bg-red-50 text-red-700 ring-1 ring-red-200" title="No reply yet and the follow-up time has passed">
            <Clock className="size-3" aria-hidden /> Overdue
          </Chip>
        )}
        {c.due_today && (
          <Chip className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" title={`Follow up by ${formatWhen(c.follow_up_by)}`}>
            <CalendarClock className="size-3" aria-hidden /> Due today
          </Chip>
        )}
      </div>
      <div className="mt-2">
        <FlagChips contact={c} />
      </div>
    </button>
  )
}
