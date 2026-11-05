import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type ContactSummary, type Meta } from './api'
import { ContactPanel } from './components/ContactPanel'
import { IntakeModal } from './components/IntakeModal'
import { Pipeline } from './components/Pipeline'
import { Reports } from './components/Reports'
import { MobileBar, MobileMenu, Sidebar, TopBar } from './components/Shell'
import { Today, type GoTo } from './components/Today'
import { ErrorNote, Spinner } from './components/ui'
import { NO_FILTERS, loadSortMode, saveSortMode, sortContacts, type Filters, type SortMode } from './lib/filters'
import { parseHash, toHash, type Route, type View } from './lib/nav'

const TITLES: Record<View, string> = { today: 'Today', pipeline: 'Pipeline', reports: 'Reports' }

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route, setRouteState] = useState<Route>(() => parseHash(window.location.hash))
  const [queue, setQueue] = useState<number[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [tab, setTab] = useState<'pipeline' | 'not_a_lead'>('pipeline')
  const [sortMode, setSortModeState] = useState<SortMode>(loadSortMode)
  const [pasting, setPasting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const setRoute = useCallback((r: Route) => {
    setRouteState(r)
    window.history.replaceState(null, '', toHash(r))
  }, [])

  useEffect(() => {
    const onHash = () => setRouteState(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // n = new enquiry (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey && route.contactId === null) {
        e.preventDefault()
        setPasting(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route.contactId])

  const pipeline = useMemo(() => (contacts ?? []).filter((c) => c.status !== null), [contacts])
  const defaultQueue = useMemo(() => sortContacts(pipeline, sortMode).map((c) => c.id), [pipeline, sortMode])

  const openContact = (id: number, q?: number[]) => {
    setQueue(q && q.includes(id) ? q : defaultQueue.includes(id) ? defaultQueue : [id])
    setRoute({ ...route, contactId: id })
  }
  const closeContact = useCallback(() => setRoute({ ...route, contactId: null }), [route, setRoute])
  const navigate = useCallback((id: number) => setRoute({ ...route, contactId: id }), [route, setRoute])

  const go = (to: GoTo) => {
    if (to === 'reports') return setRoute({ view: 'reports', contactId: null })
    setTab(to.tab ?? 'pipeline')
    setFilters(to.filters ?? NO_FILTERS)
    setRoute({ view: 'pipeline', contactId: null })
  }

  const move = async (id: number, status: string) => {
    setContacts((cs) => cs && cs.map((c) => (c.id === id ? { ...c, status } : c)))
    try {
      await api.updateContact(id, { status })
      const name = contacts?.find((c) => c.id === id)?.name ?? 'Contact'
      setToast(`${name} moved to ${status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the card')
    }
    await load()
  }

  if (!meta || !contacts) {
    return (
      <div className="grid h-screen place-items-center">
        {error ? <ErrorNote message={error} onRetry={load} /> : <Spinner label="Loading enquiries…" />}
      </div>
    )
  }

  const sidebar = (className: string, onClose?: () => void) => (
    <Sidebar
      className={className}
      onClose={onClose}
      view={route.view}
      onView={(v) => setRoute({ view: v, contactId: null })}
      counts={{ overdue: pipeline.filter((c) => c.overdue).length, pipeline: pipeline.length }}
      onNew={() => setPasting(true)}
      demoNow={meta.demo_now}
      onSetClock={async (v) => {
        try {
          await api.setClock(v)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not set the demo time')
        }
        await load()
      }}
      onReset={async () => {
        setRoute({ ...route, contactId: null })
        await api.reset()
        setFilters(NO_FILTERS)
        await load()
        setToast('Demo data reset: 20 sample enquiries reloaded')
      }}
    />
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {sidebar('hidden md:flex')}
      <MobileMenu open={menuOpen} onClose={closeMenu}>
        {sidebar('flex h-full w-full', closeMenu)}
      </MobileMenu>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar onMenu={() => setMenuOpen(true)} onNew={() => setPasting(true)} overdue={pipeline.filter((c) => c.overdue).length} />
        <TopBar title={TITLES[route.view]} onOpen={(id) => openContact(id)} />
        <main className={route.view === 'pipeline' ? 'min-h-0 flex-1 overflow-hidden p-3 md:p-5' : 'min-h-0 flex-1 overflow-y-auto p-4 md:p-6'}>
          {error && (
            <div className="mb-3">
              <ErrorNote message={error} onRetry={load} />
            </div>
          )}
          {route.view === 'today' && <Today meta={meta} contacts={contacts} refreshKey={refreshKey} onOpen={openContact} onGo={go} />}
          {route.view === 'pipeline' && (
            <Pipeline
              meta={meta}
              contacts={contacts}
              filters={filters}
              onFilters={setFilters}
              sortMode={sortMode}
              onSortMode={(m) => {
                setSortModeState(m)
                saveSortMode(m)
              }}
              tab={tab}
              onTab={setTab}
              onOpen={openContact}
              onMove={move}
            />
          )}
          {route.view === 'reports' && <Reports refreshKey={refreshKey} onOpen={(id) => openContact(id)} />}
        </main>
      </div>

      {route.contactId !== null && (
        <ContactPanel
          key={route.contactId}
          id={route.contactId}
          meta={meta}
          queue={queue.length ? queue : defaultQueue}
          onNavigate={navigate}
          onClose={closeContact}
          onChanged={load}
          onToast={setToast}
        />
      )}
      {pasting && (
        <IntakeModal
          meta={meta}
          onClose={() => setPasting(false)}
          onSaved={async (id) => {
            setPasting(false)
            await load()
            openContact(id)
            setToast('Enquiry saved')
          }}
        />
      )}
      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <CheckCircle2 className="size-4 text-emerald-400" aria-hidden /> {toast}
        </div>
      )}
    </div>
  )
}
