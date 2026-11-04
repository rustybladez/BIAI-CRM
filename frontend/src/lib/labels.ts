import {
  Baby,
  Globe,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Phone,
  PhoneCall,
  PhoneOff,
  Repeat,
  GitMerge,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react'

// Colour meaning (PRD §8): red = urgent / overdue, amber = needs a human check, grey = not a lead.

export const LANGUAGE_LABEL: Record<string, string> = { bangla: 'বাংলা', banglish: 'Banglish', english: 'EN' }
export const LANGUAGE_NAME: Record<string, string> = { bangla: 'বাংলা', banglish: 'Banglish', english: 'English' }

export const INTEREST_LABEL: Record<string, string> = {
  bootcamp: 'Bootcamp',
  fellowship: 'Fellowship',
  corporate: 'Corporate',
  other: 'Other',
  unclear: 'Program not stated',
  not_applicable: '—',
}

export const TYPE_LABEL: Record<string, string> = {
  lead: 'Lead',
  support: 'Support',
  complaint: 'Complaint',
  spam: 'Spam',
  irrelevant: 'Not a customer',
}

export const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-600 text-white',
  high: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  medium: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  low: 'bg-white text-slate-500 ring-1 ring-slate-200',
}

export const CHANNEL: Record<string, { icon: LucideIcon; short: string }> = {
  WhatsApp: { icon: MessageCircle, short: 'WhatsApp' },
  'Facebook Messenger': { icon: MessagesSquare, short: 'Messenger' },
  'Facebook comment': { icon: MessageSquareText, short: 'FB comment' },
  'Website form': { icon: Globe, short: 'Website' },
  'Phone call note': { icon: Phone, short: 'Phone call' },
}

/** Flags in plain language, with an icon. `tone` drives the colour. */
export const FLAG: Record<string, { icon: LucideIcon; label: string; explain: string; tone: 'red' | 'amber' | 'slate' }> = {
  repeat_no_reply: {
    icon: Repeat,
    label: 'Asked again',
    explain: 'Wrote again before we replied, so priority was raised to urgent.',
    tone: 'red',
  },
  duplicate_merged: {
    icon: GitMerge,
    label: 'Merged',
    explain: 'Several messages from the same phone number were merged into this contact.',
    tone: 'slate',
  },
  payment_unverified: {
    icon: Wallet,
    label: 'Payment not confirmed',
    explain: 'Says they paid, but we have no confirmation yet.',
    tone: 'amber',
  },
  refund_request: { icon: Undo2, label: 'Refund', explain: 'Wants to cancel or get money back.', tone: 'red' },
  public_complaint_risk: {
    icon: Megaphone,
    label: 'May post publicly',
    explain: 'Threatens to complain in public (e.g. on Facebook).',
    tone: 'red',
  },
  minor: { icon: Baby, label: 'Under 18', explain: 'Looks like a school student: no hard selling, no personal details.', tone: 'amber' },
  callback_requested: { icon: PhoneCall, label: 'Wants a call', explain: 'Asked us to call, or said they will call again.', tone: 'slate' },
  group_or_bulk: { icon: Users, label: 'Group', explain: 'Enquiring for a team or several people.', tone: 'slate' },
  missing_phone: { icon: PhoneOff, label: 'No phone', explain: 'No phone number yet: the reply asks for one.', tone: 'amber' },
}

export const TONE: Record<string, string> = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
}

export const FORMAT_LABEL: Record<string, string> = {
  text: 'Message',
  public_comment: 'Public comment reply',
  call_script: 'Call script',
  none: 'No reply',
}

export const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  role: 'Role',
  company: 'Company',
  team_size: 'Team size',
  phone: 'Phone',
  phone_in_message: 'Phone',
  interest: 'Interest',
  message_type: 'Type',
  language: 'Language',
  status: 'Status',
  priority: 'Priority',
  follow_up_by: 'Follow up by',
  summary: 'Summary',
}

export function contactFlags(c: { flags: string[]; missing_phone: boolean }): string[] {
  return c.missing_phone ? [...c.flags, 'missing_phone'] : c.flags
}

export function displayName(c: { name: string | null; channel?: string | null }): string {
  return c.name ?? 'Unknown sender'
}

// ---- Dates: the API sends Dhaka times with an offset; always show them in Asia/Dhaka ----
const TZ = 'Asia/Dhaka'

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** 'YYYY-MM-DDTHH:MM' in Dhaka time, for <input type="datetime-local"> and the API. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}

/** API demo_now is 'YYYY-MM-DDTHH:MM' Dhaka time without offset. */
export function demoNowIso(demoNow: string): string {
  return `${demoNow}:00+06:00`
}
