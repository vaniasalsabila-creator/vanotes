import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { createProject, db } from '../lib/db'
import { DUMP_ID } from '../lib/quick'
import { signOut, useAuth } from '../lib/auth'
import ProjectDialog from './ProjectDialog'
import Bump from './Bump'
import { CalendarIcon, CheckSquareIcon, FeatherIcon, ListIcon, PlusIcon, SearchIcon, XIcon } from './Icons'
import { cx } from '../lib/utils'

const NewProjectCtx = createContext<() => void>(() => {})
export const useNewProject = () => useContext(NewProjectCtx)

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const newProject = useNewProject()
  const { pathname } = useLocation()
  const { session } = useAuth()
  const wrap = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ y: number; h: number } | null>(null)

  const data = useLiveQuery(async () => {
    const [projects, tasks, dumpNotes] = await Promise.all([
      db.projects.orderBy('updatedAt').reverse().toArray(),
      db.tasks.toArray(),
      db.notes.where('projectId').equals(DUMP_ID).count(),
    ])
    const open = new Map<string, number>()
    tasks.filter((t) => !t.done).forEach((t) => open.set(t.projectId, (open.get(t.projectId) ?? 0) + 1))
    return {
      projects: [...projects.filter((p) => p.id === DUMP_ID), ...projects.filter((p) => p.id !== DUMP_ID)],
      open,
      dumpNotes,
      total: [...open.values()].reduce((a, b) => a + b, 0),
    }
  })

  // The active "pill" is one element that glides between rows.
  const measure = useCallback(() => {
    const w = wrap.current
    const a = w?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!w || !a) return setPill(null)
    const wr = w.getBoundingClientRect()
    const ar = a.getBoundingClientRect()
    setPill({ y: ar.top - wr.top + w.scrollTop, h: ar.height })
  }, [])
  useLayoutEffect(measure, [measure, pathname, data?.projects.length])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const item = () =>
    'relative z-10 flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors hover:bg-paper/60 aria-[current=page]:font-medium aria-[current=page]:hover:bg-transparent'

  return (
    <div className="flex h-full flex-col" onClick={onNavigate}>
      <Link to="/" className="px-3 font-display text-2xl italic tracking-tight">
        vanotes
      </Link>

      <div ref={wrap} className="scroll-hide relative mt-8 min-h-0 flex-1 overflow-y-auto">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 rounded-xl bg-card shadow-[0_1px_0_var(--color-line)] ring-1 ring-line transition-[transform,height] duration-[380ms] ease-[var(--ease)]"
          style={pill ? { transform: `translateY(${pill.y}px)`, height: pill.h } : { opacity: 0 }}
        />

        <nav className="space-y-0.5">
          <NavLink to="/" end className={item}>
            <FeatherIcon /> desk
          </NavLink>
          <NavLink to="/tasks" className={item}>
            <CheckSquareIcon /> all tasks
            {!!data?.total && <Bump value={data.total} className="ml-auto font-mono text-xs text-muted" />}
          </NavLink>
          <NavLink to="/calendar" className={item}>
            <CalendarIcon /> calendar
          </NavLink>
          <NavLink to="/search" className={item}>
            <SearchIcon /> search
          </NavLink>
        </nav>

        <div className="mt-8 flex items-center justify-between px-3">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">projects</h2>
          <button onClick={newProject} aria-label="New project" className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
            <PlusIcon />
          </button>
        </div>
        <nav className="mt-2 space-y-0.5 pb-2">
          {data?.projects.map((p) => {
            const n = p.id === DUMP_ID ? data.dumpNotes : (data.open.get(p.id) ?? 0)
            return (
              <NavLink key={p.id} to={`/p/${p.id}`} data-nav-project={p.id} className={item}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
                {n > 0 && <Bump value={n} className="ml-auto font-mono text-xs text-muted" />}
              </NavLink>
            )
          })}
          {data && data.projects.length === 0 && <p className="px-3 font-mono text-sm text-muted">no projects yet</p>}
        </nav>
      </div>

      {session?.user.email && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-card/60 px-3 py-2">
          <span className="truncate font-mono text-xs text-muted" title={session.user.email}>
            {session.user.email}
          </span>
          <button onClick={() => void signOut()} className="shrink-0 text-xs text-accent hover:underline">
            sign out
          </button>
        </div>
      )}

      <p className="mt-3 px-3 font-mono text-[11px] leading-6 text-muted">
        <kbd className="rounded border border-line bg-card px-1.5">n</kbd> capture ·{' '}
        <kbd className="rounded border border-line bg-card px-1.5">/</kbd> search
      </p>
    </div>
  )
}

/** App frame: persists across pages so the sidebar can animate between them. */
export function Shell() {
  const [creating, setCreating] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const nav = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => setDrawer(false), [pathname])

  // n = capture, / = search (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input,textarea,[contenteditable="true"],[role="dialog"]')) return
      if (e.key === 'n') {
        e.preventDefault()
        if (pathname === '/') window.dispatchEvent(new Event('vanotes:focus-capture'))
        else nav('/')
      } else if (e.key === '/') {
        e.preventDefault()
        nav('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, pathname])

  return (
    <NewProjectCtx.Provider value={() => setCreating(true)}>
      <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen border-r border-line bg-side p-5 lg:block">
          <SidebarContent />
        </aside>

        {/* mobile / tablet top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/" className="font-display text-xl italic">
            vanotes
          </Link>
          <button onClick={() => setDrawer(true)} aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-xl bg-pill/70">
            <ListIcon />
          </button>
        </div>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
            <div className="anim-fade absolute inset-0 bg-ink/30" />
            <div className="absolute inset-y-0 right-0 w-72 max-w-[85vw] animate-[slide-in_0.3s_var(--ease)_both] bg-side p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-xl hover:bg-paper">
                <XIcon />
              </button>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 px-5 pb-36 pt-8 sm:px-10 lg:pb-20 lg:pt-12">
          <Outlet />
        </main>
      </div>

      {creating && (
        <ProjectDialog
          onClose={() => setCreating(false)}
          onSave={async (name, color) => {
            const p = await createProject(name, color)
            setCreating(false)
            nav(`/p/${p.id}`)
          }}
        />
      )}
    </NewProjectCtx.Provider>
  )
}

/** Page content container. Re-keyed per route so every screen eases in. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className={cx('page-enter mx-auto', wide ? 'max-w-6xl' : 'max-w-3xl')}>
      {children}
    </div>
  )
}

/** Compact floating button — mobile/tablet only. Desktop has the action in the page header. */
export function FloatingAction({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-20 flex h-14 items-center gap-2.5 rounded-2xl bg-ink px-5 text-paper shadow-[0_10px_30px_-8px_rgba(43,38,34,0.55)] transition active:scale-95 lg:hidden"
    >
      <FeatherIcon />
      {label}
    </button>
  )
}

export const PillButton = ({
  className,
  variant,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'soft' }) => (
  <button
    {...p}
    className={cx(
      'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm transition disabled:opacity-40',
      variant === 'solid' ? 'bg-ink text-paper hover:bg-black' : 'bg-pill hover:bg-[#e3d9c5]',
      className,
    )}
  />
)
