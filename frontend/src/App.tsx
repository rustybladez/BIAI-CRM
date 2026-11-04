import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type ContactSummary, type Meta } from './api'
import { Board, FilterBar, NotALeadTray } from './components/Board'
import { ContactDrawer } from './components/ContactDrawer'
import { FollowUps } from './components/FollowUps'
import { Header, type View } from './components/Header'
import { IntakeModal } from './components/IntakeModal'
import { ErrorNote, Spinner } from './components/ui'
import { NO_FILTERS, applyFilters, type Filters } from './lib/filters'

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [openId, setOpenId] = useState<number | null>(null)
  const [pasting, setPasting] = useState(false)
  const [view, setViewState] = useState<View>(() => (window.location.hash === '#followups' ? 'followups' : 'board'))
  const [refreshKey, setRefreshKey] = useState(0)
  const setView = (v: View) => {
    setViewState(v)
    window.history.replaceState(null, '', v === 'board' ? '#' : '#followups')
  }

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.meta(), api.contacts()])
      setMeta(m)
      setContacts(c)
      setError(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the CRM')
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([api.meta(), api.contacts()]).then(
      ([m, c]) => {
        if (!alive) return
        setMeta(m)
        setContacts(c)
      },
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [])

  const pipeline = useMemo(() => (contacts ?? []).filter((c) => c.status !== null), [contacts])
  const notALead = useMemo(() => (contacts ?? []).filter((c) => c.status === null), [contacts])
  const visible = useMemo(() => applyFilters(pipeline, filters), [pipeline, filters])
  const closeDrawer = useCallback(() => setOpenId(null), [])

  const move = async (id: number, status: string) => {
    // Optimistic: move the card now, then reload (order / overdue may change).
    setContacts((cs) => cs && cs.map((c) => (c.id === id ? { ...c, status } : c)))
    try {
      await api.updateContact(id, { status })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the card')
    }
    await load()
  }

  if (!meta || !contacts) {
    return (
      <div className="grid min-h-screen place-items-center">
        {error ? <ErrorNote message={error} onRetry={load} /> : <Spinner label="Loading enquiries…" />}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header
        view={view}
        onView={setView}
        demoNow={meta.demo_now}
        urgent={pipeline.filter((c) => c.priority === 'urgent').length}
        overdue={pipeline.filter((c) => c.overdue).length}
        overdueOnly={filters.overdueOnly}
        onToggleOverdue={() => {
          setView('board')
          setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))
        }}
        onPaste={() => setPasting(true)}
        onSetClock={async (v) => {
          try {
            await api.setClock(v)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not set the demo time')
          }
          await load()
        }}
        onReset={async () => {
          setOpenId(null)
          await api.reset()
          setFilters(NO_FILTERS)
          await load()
        }}
      />

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6">
        {error && <ErrorNote message={error} onRetry={load} />}
        {view === 'followups' ? (
          <FollowUps refreshKey={refreshKey} onOpen={setOpenId} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FilterBar meta={meta} filters={filters} onChange={setFilters} />
              <p className="text-sm text-slate-500">
                {pipeline.length} in the pipeline · drag a card to change its status · click to open
              </p>
            </div>
            <div className="overflow-x-auto pb-2">
              <Board meta={meta} contacts={visible} onOpen={setOpenId} onMove={move} />
            </div>
            <NotALeadTray contacts={notALead} onOpen={setOpenId} />
          </>
        )}
      </main>

      {openId !== null && <ContactDrawer key={openId} id={openId} meta={meta} onClose={closeDrawer} onChanged={load} />}
      {pasting && (
        <IntakeModal
          meta={meta}
          onClose={() => setPasting(false)}
          onSaved={async (id) => {
            setPasting(false)
            await load()
            setOpenId(id)
          }}
        />
      )}
    </div>
  )
}
