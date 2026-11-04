// Typed client for the FastAPI backend (/api). Types mirror backend/api/*.py.

export type Meta = {
  statuses: string[]
  message_types: string[]
  interests: string[]
  languages: string[]
  priorities: string[]
  flags: string[]
  system_flags: string[]
  channels: string[]
  demo_now: string
}

export type ReplyDraft = {
  id: number
  enquiry_id: number | null
  language: string
  format: 'text' | 'public_comment' | 'call_script' | 'none'
  body: string
  faq_keys_used: string[]
  needs_confirmation: string[]
  model_used: string | null
  latency_ms: number | null
  created_at: string
  unverified_numbers: string[]
  warnings: string[]
  check_before_sending: boolean
}

export type ContactSummary = {
  id: number
  name: string | null
  role: string | null
  company: string | null
  team_size: number | null
  phone: string | null
  missing_phone: boolean
  message_type: string
  interest: string
  language: string
  status: string | null
  priority: string
  priority_reason: string
  flags: string[]
  follow_up_by: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  summary: string
  missing_info: string[]
  low_confidence_fields: string[]
  channel: string | null
  channels: string[]
  enquiry_count: number
  awaiting_reply: boolean
  overdue: boolean
  due_today: boolean
}

export type Enquiry = {
  id: number
  seed_id: number | null
  channel: string
  received_at: string
  sender_name_raw: string
  phone_raw: string | null
  message: string
  extraction: Record<string, unknown>
  model_used: string | null
  latency_ms: number | null
}

export type Activity = { id: number; kind: string; body: string; at: string }

export type ContactDetail = ContactSummary & {
  enquiries: Enquiry[]
  activities: Activity[]
  reply_draft: ReplyDraft | null
}

export type Extraction = {
  message_type: string
  message_type_reason: string
  name: string | null
  role: string | null
  company: string | null
  team_size: number | null
  phone_in_message: string | null
  interest: string
  interest_detail: string | null
  language: string
  status: string | null
  priority: string
  priority_reason: string
  follow_up_by: string | null
  flags: string[]
  summary: string
  missing_info: string[]
  low_confidence_fields: string[]
}

export type IntakeMessage = {
  channel: string
  sender_name: string
  phone: string | null
  received_at: string | null
  message: string
}

export type AnalyseResult = {
  extraction: Extraction
  model_used: string
  latency_ms: number
  phone: string | null
  missing_phone: boolean
  status: string | null
  duplicate: {
    contact_id: number
    name: string | null
    status: string | null
    priority: string
    would_escalate: boolean
  } | null
}

export type ContactUpdate = Partial<{
  name: string | null
  role: string | null
  company: string | null
  team_size: number | null
  phone: string | null
  message_type: string
  interest: string
  language: string
  status: string | null
  priority: string
  priority_reason: string
  follow_up_by: string | null
  summary: string
  note: string
}>

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) detail = data.detail.map((d: { msg: string }) => d.msg).join('; ')
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  meta: () => request<Meta>('GET', '/meta'),
  contacts: () => request<ContactSummary[]>('GET', '/contacts'),
  contact: (id: number) => request<ContactDetail>('GET', `/contacts/${id}`),
  updateContact: (id: number, update: ContactUpdate) => request<ContactDetail>('PATCH', `/contacts/${id}`, update),
  reply: (id: number, language?: string, regenerate = false) =>
    request<ReplyDraft>('POST', `/contacts/${id}/reply`, { language, regenerate }),
  markSent: (id: number, body?: string) => request<ContactDetail>('POST', `/contacts/${id}/reply/sent`, { body }),
  analyse: (msg: IntakeMessage) => request<AnalyseResult>('POST', '/intake/analyse', msg),
  save: (msg: IntakeMessage, analysed: AnalyseResult, extraction: Extraction) =>
    request<{ contact_id: number; merged: boolean }>('POST', '/intake/save', {
      ...msg,
      extraction,
      model_used: analysed.model_used,
      latency_ms: analysed.latency_ms,
    }),
  setClock: (demo_now: string) => request<{ demo_now: string }>('PUT', '/demo/clock', { demo_now }),
  reset: () => request<{ enquiries: number }>('POST', '/demo/reset'),
}

export type Followups = { now: string; overdue: ContactSummary[]; due_today: ContactSummary[] }

export type WeeklyStats = {
  as_of: string
  week_starts: string
  contacts_total: number
  messages_total: number
  this_week: { messages_received: number; new_contacts: number; replies_sent: number }
  pipeline_total: number
  pipeline_by_status: Record<string, number>
  waiting_for_our_reply: number
  overdue_count: number
  urgent_count: number
  not_a_lead: Record<string, number>
  messages_by_channel: Record<string, number>
  pipeline_by_interest: Record<string, number>
  contacts_by_language: Record<string, number>
  missing_phone: number
  corporate: { leads: number; total_people_to_train: number }
}

export type WeeklyReport = {
  stats: WeeklyStats
  summary: {
    overview: string
    observation: string
    chase_first: { contact_id: number; name: string; priority: string; overdue: boolean; reason: string }[]
    model_used: string | null
    latency_ms: number | null
    generated_at: string
    unverified_numbers: string[]
  } | null
  error: string | null
}

export const reports = {
  followups: () => request<Followups>('GET', '/followups'),
  weekly: () => request<WeeklyReport>('GET', '/summary/weekly'),
  generateWeekly: () => request<WeeklyReport>('POST', '/summary/weekly'),
}
