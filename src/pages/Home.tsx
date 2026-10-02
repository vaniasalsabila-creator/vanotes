import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { Page, useNewProject } from '../components/Layout'
import { PlusIcon } from '../components/Icons'
import EventRow from '../components/EventRow'
import QuickNote from '../components/QuickNote'
import { useTickDelay } from '../components/TaskCheck'
import { setTaskDone } from '../lib/tasks'
import { cx, dayLabel, shortDate, timeLabel } from '../lib/utils'

const DAY = 86_400_000
const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0)

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening'
}

function useDeskData() {
  return useLiveQuery(async () => {
    const dayStart = startOfDay(Date.now())
    const [projects, notes, tasks, todays, hasCalendar] = await Promise.all([
      db.projects.orderBy('updatedAt').reverse().toArray(),
      db.notes.toArray(),
      db.tasks.toArray(),
      db.events.where('start').between(dayStart, dayStart + DAY).toArray(),
      db.events.count(),
    ])
    const pById = new Map(projects.map((p) => [p.id, p]))
    const nById = new Map(notes.map((n) => [n.id, n]))
    const byNewest = [...notes].sort((a, b) => b.createdAt - a.createdAt)

    // days with any activity: a note written or a task finished
    const active = new Set<number>()
    notes.forEach((n) => active.add(startOfDay(n.createdAt)))
    tasks.forEach((t) => t.doneAt && active.add(startOfDay(t.doneAt)))

    return {
      active,
      doneToday: tasks.filter((t) => t.doneAt && t.done && t.doneAt >= dayStart).length,
      meetings: todays.sort((a, b) => +b.allDay - +a.allDay || a.start - b.start),
      hasCalendar: hasCalendar > 0,
      projects: projects.map((p) => ({
        ...p,
        noteCount: notes.filter((n) => n.projectId === p.id).length,
        openTasks: tasks.filter((t) => t.projectId === p.id && !t.done).length,
        peek: byNewest
          .filter((n) => n.projectId === p.id)
          .slice(0, 2)
          .map((n) => n.title || n.bodyText.split('\n')[0]),
      })),
      upNext: tasks
        .filter((t) => !t.done)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6)
        .map((t) => ({ ...t, project: pById.get(t.projectId), note: nById.get(t.noteId) })),
      recent: notes
        .filter((n) => n.title || n.bodyText)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map((n) => ({ ...n, project: pById.get(n.projectId) })),
    }
  })
}
type DeskData = NonNullable<ReturnType<typeof useDeskData>>

/** Last seven days as dots + the current run. Quiet motivation, never nagging. */
function Streak({ active, doneToday }: { active: Set<number>; doneToday: number }) {
  const today = startOfDay(Date.now())
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY)
  let streak = 0
  // today may still be empty; the run is alive if yesterday counts
  for (let d = active.has(today) ? today : today - DAY; active.has(d); d -= DAY) streak++

  const line =
    streak >= 2 ? `${streak} days in a row` : streak === 1 ? 'day 1 — nice start' : 'write something to start a streak'

  return (
    <div className="anim-fade shrink-0 text-right" aria-label={line}>
      <div className="flex justify-end gap-2">
        {days.map((d, i) => {
          const on = active.has(d)
          const isToday = d === today
          return (
            <div key={d} className="flex flex-col items-center gap-1" title={new Date(d).toDateString()}>
              <span
                style={{ animationDelay: `${i * 60 + 150}ms` }}
                className={cx(
                  'anim-pop block h-3 w-3 rounded-full border transition-colors duration-500',
                  on ? 'border-accent bg-accent' : isToday ? 'border-dashed border-muted' : 'border-line bg-pill',
                )}
              />
              <span className={cx('font-mono text-[9px] uppercase leading-none', isToday ? 'text-ink' : 'text-muted/70')}>
                {new Date(d).toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {line}
        {doneToday > 0 && <span> · {doneToday} done today</span>}
      </p>
    </div>
  )
}

function UpNextRow({ t, index }: { t: DeskData['upNext'][number]; index: number }) {
  const tick = useTickDelay(t.done, (v) => void setTaskDone(t.id, v))
  return (
    <li style={{ '--i': index } as React.CSSProperties} className="rise-in flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-card">
      <input type="checkbox" className="check mt-1" checked={tick.checked} onChange={(e) => tick.onChange(e.target.checked)} aria-label={`Complete ${t.text}`} />
      <Link to={`/p/${t.projectId}/n/${t.noteId}`} className="min-w-0 flex-1">
        <p className="font-mono text-[15px] leading-snug">
          <span className="strike" data-done={tick.checked}>{t.text}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: t.project?.color }} />
          {t.project?.name}
        </p>
      </Link>
    </li>
  )
}

function Desk() {
  const data = useDeskData()
  return (
    <>
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">{greeting()}.</h1>
        </div>
        <div className="hidden sm:block">{data && <Streak active={data.active} doneToday={data.doneToday} />}</div>
      </div>
      <QuickNote />
      {data && <DeskBody data={data} />}
    </>
  )
}

function DeskBody({ data }: { data: DeskData }) {
  const newProject = useNewProject()
  return (
    <>
      {data.projects.length === 0 ? (
        <div className="anim-pop mt-12 max-w-md rounded-3xl border border-dashed border-muted/50 p-8 font-mono leading-relaxed">
          <p>start with a project.</p>
          <p className="mt-2 text-sm text-muted">
            write notes inside it; any checklist line you add turns into a task here automatically.
          </p>
          <button onClick={newProject} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-5 font-sans text-sm text-paper">
            <PlusIcon /> new project
          </button>
        </div>
      ) : (
        <>
          <section className="mt-12">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">today’s meetings</h2>
              <Link to="/calendar" className="text-xs text-muted transition-colors hover:text-ink">
                {data.hasCalendar ? 'calendar →' : 'import your calendar →'}
              </Link>
            </div>
            {data.meetings.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {data.meetings.map((e, i) => (
                  <EventRow key={e.id} event={e} index={i} />
                ))}
              </ul>
            ) : (
              data.hasCalendar && <p className="mt-4 font-mono text-sm text-muted">no meetings today.</p>
            )}
          </section>

          <section className="mt-12 grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">up next</h2>
              <ul className="mt-4 space-y-1">
                {data.upNext.length === 0 && <li className="font-mono text-sm text-muted">nothing open — nice.</li>}
                {data.upNext.map((t, i) => (
                  <UpNextRow key={t.id} t={t} index={i} />
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">recently touched</h2>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {data.recent.length === 0 && <li className="py-3 font-mono text-sm text-muted">no notes yet.</li>}
                {data.recent.map((n, i) => (
                  <li key={n.id} style={{ '--i': i } as React.CSSProperties} className="rise-in">
                    <Link to={`/p/${n.projectId}/n/${n.id}`} className="group flex items-baseline gap-3 py-3 transition-colors hover:text-accent">
                      <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[3px]" style={{ background: n.project?.color }} />
                      <span className="min-w-0 flex-1 truncate transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-1">
                        {n.title || n.bodyText.split('\n')[0]}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted">
                        {dayLabel(n.updatedAt) === 'Today' ? timeLabel(n.updatedAt) : shortDate(n.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">projects</h2>
            <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((p, i) => (
                <Link key={p.id} to={`/p/${p.id}`} style={{ '--i': i } as React.CSSProperties} className="rise-in group relative block">
                  {/* the two latest notes peek out of the folder on hover */}
                  {p.peek.map((title, k) => (
                    <span
                      key={k}
                      aria-hidden
                      style={{ left: `${6.5 + k * 1.2}rem`, right: `${1 + k * 1.5}rem`, transitionDelay: `${k * 40}ms` }}
                      className={cx(
                        'absolute top-3 truncate rounded-t-md border border-b-0 border-line bg-[#fbf7ee] px-2.5 pt-0.5 font-mono text-[10px] leading-4 text-muted transition-transform duration-300 ease-[var(--ease)]',
                        k === 0 ? 'group-hover:-translate-y-[13px]' : 'group-hover:-translate-y-[25px]',
                      )}
                    >
                      {title}
                    </span>
                  ))}
                  <div className="relative z-10 h-3 w-16 rounded-t-lg transition-all duration-300 ease-[var(--ease)] group-hover:w-24" style={{ background: p.color }} />
                  <div className="relative z-10 rounded-b-2xl rounded-tr-2xl border border-line bg-card p-5 transition duration-300 ease-[var(--ease)] group-hover:shadow-[0_12px_28px_-18px_rgba(43,38,34,0.5)]">
                    <h3 className="font-display text-xl leading-snug">{p.name}</h3>
                    <p className="mt-6 font-mono text-xs text-muted">
                      {p.noteCount} {p.noteCount === 1 ? 'note' : 'notes'} · {p.openTasks} open
                    </p>
                  </div>
                </Link>
              ))}
              <button onClick={newProject} className="flex min-h-32 items-center justify-center gap-2 self-end rounded-2xl border border-dashed border-muted/60 text-sm text-muted transition hover:border-ink hover:text-ink">
                <PlusIcon /> new project
              </button>
            </div>
          </section>
        </>
      )}
    </>
  )
}

export default function Home() {
  return (
    <Page>
      <Desk />
    </Page>
  )
}
