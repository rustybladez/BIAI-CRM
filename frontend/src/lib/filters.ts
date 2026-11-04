import type { ContactSummary } from '../api'

export type Filters = { interest: string; channel: string; priority: string; overdueOnly: boolean }
export const NO_FILTERS: Filters = { interest: '', channel: '', priority: '', overdueOnly: false }

export function applyFilters(items: ContactSummary[], f: Filters): ContactSummary[] {
  return items.filter(
    (c) =>
      (!f.interest || c.interest === f.interest) &&
      (!f.channel || c.channels.includes(f.channel)) &&
      (!f.priority || c.priority === f.priority) &&
      (!f.overdueOnly || c.overdue),
  )
}
