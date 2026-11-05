import { Clock } from 'lucide-react'
import type { ContactSummary } from '../api'
import {
  CHANNEL,
  FLAG,
  INTEREST_LABEL,
  LANGUAGE_LABEL,
  PRIORITY_STYLE,
  STATUS_STYLE,
  TONE,
  contactFlags,
  displayName,
  hoursSince,
  waitLabel,
} from '../lib/labels'
import { cx } from '../lib/ui'
import { Chip } from './ui'

export function PriorityBadge({ priority }: { priority: string }) {
  return <Chip className={cx('uppercase tracking-wide', PRIORITY_STYLE[priority])}>{priority}</Chip>
}

export function StatusPill({ status }: { status: string | null }) {
  return <Chip className={cx('ring-1', status ? STATUS_STYLE[status] : 'bg-slate-100 text-slate-500 ring-slate-200')}>{status ?? 'Not a lead'}</Chip>
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
            {withLabels || meta.tone !== 'slate' ? meta.label : <span className="sr-only">{meta.label}</span>}
          </Chip>
        )
      })}
    </div>
  )
}

/** Wait time for a contact we still owe a reply. */
export function WaitTime({ contact, now, className, compact = false }: { contact: ContactSummary; now: string; className?: string; compact?: boolean }) {
  if (!contact.awaiting_reply || contact.status === null) return null
  const h = hoursSince(contact.waiting_since, now)
  if (h === null) return null
  return (
    <span
      className={cx('inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums', contact.overdue ? 'font-semibold text-red-600' : 'text-slate-500', className)}
      title={contact.overdue ? `Overdue: waiting ${waitLabel(h)} for our reply` : `Waiting ${waitLabel(h)} for our reply`}
    >
      {contact.overdue && compact && <Clock className="size-3" aria-label="Overdue" />}
      {waitLabel(h)}
      {contact.overdue && !compact ? ' overdue' : ''}
    </span>
  )
}

/** Compact three-line card: name + priority, one-line summary, channel / interest / language + wait. */
export function ContactCard({
  contact,
  now,
  onOpen,
  draggable = true,
}: {
  contact: ContactSummary
  now: string
  onOpen: (id: number) => void
  draggable?: boolean
}) {
  const c = contact
  const supportish = c.message_type === 'support' || c.message_type === 'complaint'
  const alerts = contactFlags(c).filter((f) => FLAG[f]?.tone === 'red' && f !== 'repeat_no_reply')
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
        'group flex w-full flex-col gap-1 rounded-xl border bg-white px-3 py-2.5 text-left shadow-xs transition hover:border-indigo-300 hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-indigo-500',
        c.overdue ? 'border-red-200' : 'border-slate-200',
        supportish && 'border-l-[3px] border-l-violet-400',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="truncate text-[13.5px] font-semibold text-slate-900">{displayName(c)}</span>
        {c.enquiry_count > 1 && (
          <span className="shrink-0 rounded bg-slate-100 px-1 text-[11px] font-medium text-slate-600" title={`${c.enquiry_count} messages`}>
            ×{c.enquiry_count}
          </span>
        )}
        <span className="ml-auto shrink-0">
          <PriorityBadge priority={c.priority} />
        </span>
      </span>
      <span className="line-clamp-1 w-full text-[13px] text-slate-600">{c.summary}</span>
      <span className="flex w-full items-center gap-1.5 text-[11.5px] text-slate-500">
        <ChannelIcon channel={c.channel} />
        <span className="truncate">
          {[supportish ? (c.message_type === 'complaint' ? 'Complaint' : 'Support') : INTEREST_LABEL[c.interest], c.team_size ? `${c.team_size} people` : null, LANGUAGE_LABEL[c.language]]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {alerts.length > 0 && (
          <span className="flex shrink-0 gap-0.5" aria-label={alerts.map((f) => FLAG[f].label).join(', ')}>
            {alerts.map((f) => {
              const Icon = FLAG[f].icon
              return (
                <span key={f} title={FLAG[f].label} className="text-red-600">
                  <Icon className="size-3.5" aria-hidden />
                </span>
              )
            })}
          </span>
        )}
        <WaitTime contact={c} now={now} className="ml-auto" compact />
      </span>
    </button>
  )
}
