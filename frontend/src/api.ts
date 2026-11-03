export type Meta = {
  statuses: string[]
  message_types: string[]
  interests: string[]
  languages: string[]
  priorities: string[]
  flags: string[]
  channels: string[]
  demo_now: string
}

export async function getMeta(): Promise<Meta> {
  const res = await fetch('/api/meta')
  if (!res.ok) throw new Error(`GET /api/meta failed: ${res.status}`)
  return res.json()
}
