import type { ContactSummary } from '../api'

export type Filters = { interest: string; channel: string; priority: string; overdueOnly: boolean; waitingOnly: boolean }
export const NO_FILTERS: Filters = { interest: '', channel: '', priority: '', overdueOnly: false, waitingOnly: false }

export function applyFilters(items: ContactSummary[], f: Filters): ContactSummary[] {
  return items.filter(
    (c) =>
      (!f.interest || c.interest === f.interest) &&
      (!f.channel || c.channels.includes(f.channel)) &&
      (!f.priority || c.priority === f.priority) &&
      (!f.overdueOnly || c.overdue) &&
      (!f.waitingOnly || (c.awaiting_reply && c.status !== 'Lost')),
  )
}

// Card order inside each column. Mirrors sort_key in backend/api/models.py.
export type SortMode = 'priority' | 'overdue'

export const SORT_HELP: Record<SortMode, string> = {
  priority: 'Most urgent first; overdue before others at the same priority; then longest waiting.',
  overdue: 'All overdue cards first, then by priority; then longest waiting.',
}

const RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export function sortContacts(items: ContactSummary[], mode: SortMode): ContactSummary[] {
  const key = (c: ContactSummary): number[] => {
    const rank = RANK[c.priority] ?? 9
    const overdue = c.overdue ? 0 : 1
    const waited = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : Number.MAX_SAFE_INTEGER
    return mode === 'overdue' ? [overdue, rank, waited] : [rank, overdue, waited]
  }
  return [...items].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return a.id - b.id
  })
}

const SORT_STORAGE_KEY = 'biai-crm.sort'

export function loadSortMode(): SortMode {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === 'overdue' ? 'overdue' : 'priority'
  } catch {
    return 'priority'
  }
}

export function saveSortMode(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode)
  } catch {
    // storage blocked: the choice just lasts for this visit
  }
}

export function activeFilterCount(f: Filters): number {
  return [f.interest, f.channel, f.priority].filter(Boolean).length + Number(f.overdueOnly) + Number(f.waitingOnly)
}

const VIEW_STORAGE_KEY = 'biai-crm.pipeline-view'
export type PipelineLayout = 'board' | 'table'

export function loadLayout(): PipelineLayout {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'board'
  } catch {
    return 'board'
  }
}

export function saveLayout(l: PipelineLayout): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, l)
  } catch {
    // storage blocked
  }
}
