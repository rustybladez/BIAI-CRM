// Hash routing: #today, #pipeline, #reports, optionally followed by /c/<contact id>.
export type View = 'today' | 'pipeline' | 'reports'

export type Route = { view: View; contactId: number | null }

export function parseHash(hash: string): Route {
  const [v, c, id] = hash.replace(/^#/, '').split('/')
  const view: View = v === 'pipeline' || v === 'reports' ? v : 'today'
  const contactId = c === 'c' && id && /^\d+$/.test(id) ? Number(id) : null
  return { view, contactId }
}

export function toHash(r: Route): string {
  return `#${r.view}${r.contactId ? `/c/${r.contactId}` : ''}`
}
