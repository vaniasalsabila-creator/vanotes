import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CalEvent } from '../lib/db'
import { createNoteFromEvent } from '../lib/calendar'
import { cx, eventRange } from '../lib/utils'
import { useNewProject } from './Layout'
import { VideoIcon, XIcon } from './Icons'
import ProjectMark from './ProjectMark'
import Portal from './Portal'

/** Re-renders every `ms`, so "in 8 min" stays honest while the page is open. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function statusOf(e: CalEvent, now: number): { kind: 'now' | 'soon' | 'past' | 'later'; label?: string } {
  if (e.allDay) return { kind: 'later' }
  if (now >= e.start && now < e.end) return { kind: 'now', label: 'now' }
  if (now >= e.end) return { kind: 'past' }
  const mins = Math.round((e.start - now) / 60_000)
  if (mins <= 60) return { kind: 'soon', label: mins <= 1 ? 'starting' : `in ${mins} min` }
  return { kind: 'later' }
}

const LAST_KEY = 'vanotes:lastProject'
const lastProject = () => {
  try {
    return localStorage.getItem(LAST_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function ProjectPicker({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const nav = useNavigate()
  const newProject = useNewProject()
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray())
  const last = lastProject()
  const sorted = projects && [...projects].sort((a, b) => +(b.id === last) - +(a.id === last))

  const pick = async (projectId: string) => {
    try {
      localStorage.setItem(LAST_KEY, projectId)
    } catch {
      /* per-viewer convenience only */
    }
    const note = await createNoteFromEvent(event, projectId)
    nav(`/p/${projectId}/n/${note.id}`)
  }

  return (
    <Portal>
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Choose project" className="page-enter w-full max-w-sm rounded-3xl bg-paper p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">start a note</h2>
            <p className="mt-1 truncate font-mono text-xs text-muted">{event.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-pill">
            <XIcon />
          </button>
        </div>
        <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-muted">in which project?</p>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {sorted?.map((p) => (
            <li key={p.id}>
              <button onClick={() => void pick(p.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-card">
                <ProjectMark project={p} size={18} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        {projects?.length === 0 && (
          <button onClick={() => { onClose(); newProject() }} className="mt-2 h-10 w-full rounded-xl bg-ink text-sm text-paper">
            create a project first
          </button>
        )}
      </div>
    </div>
    </Portal>
  )
}

export default function EventRow({ event, showDate, index = 0 }: { event: CalEvent; showDate?: boolean; index?: number }) {
  const nav = useNavigate()
  const [picking, setPicking] = useState(false)
  const note = useLiveQuery(async () => (event.noteId ? ((await db.notes.get(event.noteId)) ?? null) : null), [event.noteId])
  const now = useNow()
  const st = statusOf(event, now)
  const past = st.kind === 'past'

  return (
    <li
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      className={cx(
        'rise-in group flex items-start gap-4 rounded-2xl border bg-card px-4 py-3.5 transition-[border-color,opacity,box-shadow] duration-500',
        st.kind === 'now' ? 'border-accent/60 shadow-[0_0_0_3px_rgba(181,101,74,0.1)]' : 'border-line',
        past && 'opacity-70',
      )}
    >
      <p className="w-36 shrink-0 whitespace-nowrap pt-0.5 font-mono text-xs leading-relaxed text-muted">
        {showDate && <span className="block text-ink">{new Date(event.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
        {eventRange(event)}
        {st.label && (
          <span key={st.label} className="anim-pop mt-1 flex items-center gap-1.5 text-accent">
            {st.kind === 'now' && <span className="live h-1.5 w-1.5 rounded-full bg-accent" />}
            {st.label}
          </span>
        )}
      </p>
      <div className="min-w-0 flex-1">
        <h3 className={cx('font-display text-lg leading-snug', past && 'text-muted')}>{event.title}</h3>
        {(event.location || event.link) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {event.link && (
              <a href={event.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                <VideoIcon /> join
              </a>
            )}
            {event.location && event.location !== event.link && !/^https?:/i.test(event.location) && <span className="truncate">{event.location}</span>}
          </p>
        )}
      </div>
      {note ? (
        <button onClick={() => nav(`/p/${note.projectId}/n/${note.id}`)} className="shrink-0 rounded-xl bg-pill px-3.5 py-2 text-xs hover:bg-[#e3d9c5]">
          open note
        </button>
      ) : (
        <button onClick={() => setPicking(true)} className="shrink-0 rounded-xl bg-ink px-3.5 py-2 text-xs text-paper hover:bg-black">
          start note
        </button>
      )}
      {picking && <ProjectPicker event={event} onClose={() => setPicking(false)} />}
    </li>
  )
}
