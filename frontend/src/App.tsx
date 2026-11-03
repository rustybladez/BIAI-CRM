import { useEffect, useState } from 'react'
import { getMeta, type Meta } from './api'

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMeta().then(setMeta, (e: Error) => setError(e.message))
  }, [])

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans text-slate-800">
      <h1 className="text-2xl font-semibold">BIAI CRM</h1>
      <p className="mt-1 text-sm text-slate-500">Placeholder page (M0). Checks that the API is reachable.</p>

      {error && <p className="mt-6 rounded bg-red-50 p-3 text-red-700">API error: {error}</p>}
      {!meta && !error && <p className="mt-6 text-slate-500">Loading…</p>}
      {meta && (
        <section className="mt-6 space-y-3">
          <p data-testid="demo-now" className="text-sm">
            Demo time: <span className="font-mono">{meta.demo_now}</span>
          </p>
          <div className="grid grid-cols-5 gap-2">
            {meta.statuses.map((s) => (
              <div key={s} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-sm font-medium">
                {s}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
