import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { createNote, db, deleteNote, deleteProject, updateProject, type Note } from '../lib/db'
import { FloatingAction, Page } from '../components/Layout'
import ProjectDialog from '../components/ProjectDialog'
import NoteBody from '../components/NoteBody'
import Gallery from '../components/Gallery'
import TaskRows, { type TaskWithSource } from '../components/TaskRows'
import MoveMenu from '../components/MoveMenu'
import IconPicker from '../components/IconPicker'
import ProjectMark from '../components/ProjectMark'
import { exitItem, reduced } from '../lib/motion'
import { DUMP_ID } from '../lib/quick'
import { DotsIcon, DrawCheck, FeatherIcon, TrashIcon } from '../components/Icons'
import { cx, groupByDay, timeLabel } from '../lib/utils'

function NoteCard({ note, index }: { note: Note; index: number }) {
  const nav = useNavigate()
  const el = useRef<HTMLElement>(null)

  // A ring that fades out: used when a task in this note is ticked elsewhere, and once for a note you just wrote.
  const ring = (delay = 0) => {
    if (reduced()) return
    el.current?.animate(
      [
        { boxShadow: '0 0 0 0 rgba(181,101,74,0.55)' },
        { boxShadow: '0 0 0 5px rgba(181,101,74,0.22)', offset: 0.4 },
        { boxShadow: '0 0 0 0 rgba(181,101,74,0)' },
      ],
      { duration: 1100, delay, easing: 'ease-out' },
    )
  }
  useEffect(() => {
    if (Date.now() - note.createdAt < 4000) ring(350)
    const onFlash = (e: Event) => (e as CustomEvent).detail?.noteId === note.id && ring()
    window.addEventListener('vanotes:flash', onFlash)
    return () => window.removeEventListener('vanotes:flash', onFlash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])
  const images = useLiveQuery(() => db.images.where('noteId').equals(note.id).sortBy('order'), [note.id])
  const edit = () => nav(`/p/${note.projectId}/n/${note.id}`)

  return (
    <article
      ref={el}
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      className="rise-in group relative cursor-pointer rounded-2xl border border-line bg-card p-5 transition duration-300 ease-[var(--ease)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(43,38,34,0.6)]"
      onClick={(e) => {
        // Let links, checkboxes and thumbnails do their own thing.
        if (!(e.target as HTMLElement).closest('a,input,label,button,img')) edit()
      }}
    >
      {/* node on the timeline rail */}
      <span className="absolute -left-[32px] top-6 h-2 w-2 rounded-full bg-muted ring-4 ring-paper sm:-left-[40px]" />

      <div className="flex items-start justify-between gap-3">
        {note.title || !note.bodyText ? (
          <h3 className={cx('font-display text-xl leading-snug', !note.title && 'text-muted')}>{note.title || 'Untitled note'}</h3>
        ) : (
          <span /> /* quick notes have no title — the text speaks for itself */
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="font-mono text-xs text-muted">{timeLabel(note.createdAt)}</span>
          <div className={cx('flex items-center gap-0.5', note.projectId === DUMP_ID ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100')}>
            <MoveMenu noteId={note.id} currentProjectId={note.projectId} beforeMove={() => exitItem(el.current, 'left')} />
            <button
              onClick={async () => {
                if (!confirm('Delete this note?')) return
                await exitItem(el.current)
                await deleteNote(note.id)
              }}
              aria-label="Delete note"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-pill hover:text-accent"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
      {note.bodyText.length > 0 && (
        <div className={note.title ? 'mt-3' : 'mt-1'}>
          <NoteBody content={note.content} />
        </div>
      )}
      {!!images?.length && (
        <div className="mt-4">
          <Gallery images={images} />
        </div>
      )}
    </article>
  )
}

export default function ProjectPage() {
  const { projectId = '' } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const showTasks = params.get('tab') === 'tasks' // only matters below xl; on wide screens both show
  const [editing, setEditing] = useState(false)
  const [pickingIcon, setPickingIcon] = useState(false)

  // Wrapped so "still loading" (undefined) differs from "no such project" ({ project: null }).
  const loaded = useLiveQuery(async () => ({ project: (await db.projects.get(projectId)) ?? null }), [projectId])
  const project = loaded?.project
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(projectId).reverse().sortBy('createdAt'), [projectId])
  const tasks = useLiveQuery(async (): Promise<TaskWithSource[]> => {
    const [ts, ns] = await Promise.all([
      db.tasks.where('projectId').equals(projectId).toArray(),
      db.notes.where('projectId').equals(projectId).toArray(),
    ])
    const titles = new Map(ns.map((n) => [n.id, n.title || n.bodyText.split('\n')[0].slice(0, 60)]))
    return ts.map((t) => ({ ...t, noteTitle: titles.get(t.noteId) ?? '' })).sort((a, b) => b.createdAt - a.createdAt || a.order - b.order)
  }, [projectId])

  if (!loaded) return null
  if (!project) return <Navigate to="/" replace />

  const isDump = project.id === DUMP_ID
  const openCount = tasks?.filter((t) => !t.done).length ?? 0
  const newNote = async () => {
    const n = await createNote(projectId)
    nav(`/p/${projectId}/n/${n.id}?new=1`)
  }
  const groups = notes ? groupByDay(notes) : []
  let cardIndex = 0

  return (
    <Page wide>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* click the icon to change it — emoji, line icon, or none */}
          <div className="relative -ml-1.5 w-fit">
            <button
              onClick={() => setPickingIcon((v) => !v)}
              aria-label="Change project icon"
              aria-expanded={pickingIcon}
              title="Change icon"
              className="group grid place-items-center rounded-2xl p-1.5 transition-colors hover:bg-pill/80"
            >
              <span className="transition-transform duration-300 ease-[var(--ease)] group-hover:scale-105">
                <ProjectMark project={project} size={52} />
              </span>
            </button>
            {pickingIcon && (
              <IconPicker
                value={project.icon}
                color={project.color}
                onColor={(color) => void updateProject(project.id, { color })}
                onPick={(icon, keepOpen) => {
                  void updateProject(project.id, { icon })
                  if (!keepOpen) setPickingIcon(false)
                }}
                onClose={() => setPickingIcon(false)}
              />
            )}
          </div>
          <h1 className="mt-3 break-words font-display text-4xl leading-[1.15] sm:text-5xl sm:leading-[1.15]">{project.name}</h1>
          <p className="mt-2 font-mono text-sm text-muted">
            {notes?.length ?? 0} {notes?.length === 1 ? 'note' : 'notes'} · {openCount} open
          </p>
          {isDump && <p className="mt-3 max-w-md text-sm text-muted">everything you drop from the desk lands here. use “move to…” on a note to file it into a project.</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={newNote}
            className="hidden h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm text-paper transition hover:bg-black lg:inline-flex"
          >
            <FeatherIcon /> new note
          </button>
          {!isDump && (
            <button onClick={() => setEditing(true)} aria-label="Project settings" className="grid h-11 w-11 place-items-center rounded-xl bg-pill/70 hover:bg-pill">
              <DotsIcon />
            </button>
          )}
        </div>
      </header>

      {/* segmented switch — below xl the task panel replaces the timeline */}
      <div className="mt-8 inline-flex rounded-xl bg-pill/70 p-1 text-sm xl:hidden" role="tablist">
        {(['timeline', 'tasks'] as const).map((t) => {
          const active = (t === 'tasks') === showTasks
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setParams(t === 'timeline' ? {} : { tab: t }, { replace: true })}
              className={cx('rounded-lg px-4 py-1.5 transition', active ? 'bg-card shadow-sm' : 'text-muted')}
            >
              {t}
              {t === 'tasks' && openCount > 0 && <span className="ml-1.5 font-mono text-xs text-muted">{openCount}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-8 gap-14 xl:grid xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className={cx(showTasks && 'hidden xl:block')}>
          {notes && notes.length === 0 && isDump && (
            <div className="anim-pop relative max-w-md rounded-3xl border border-line bg-card p-8 font-mono leading-relaxed">
              <div className="flex items-center gap-2 text-accent">
                <DrawCheck size={20} /> dump is empty
              </div>
              <p className="mt-2 text-sm text-muted">everything you dropped has found a home. nicely sorted.</p>
              {[0, 1, 2].map((k) => (
                <span key={k} aria-hidden className="sparkle absolute top-6 h-1.5 w-1.5 rounded-full bg-accent" style={{ right: 28 + k * 18, '--d': `${k * 0.45}s` } as React.CSSProperties} />
              ))}
            </div>
          )}
          {notes && notes.length === 0 && !isDump && (
            <div className="max-w-md rounded-3xl border border-dashed border-muted/50 p-8 font-mono leading-relaxed text-muted">
              <p>nothing here yet.</p>
              <p className="mt-2 text-sm">press “new note” to start the timeline for {project.name}.</p>
            </div>
          )}
          <div className="relative pl-8 sm:pl-10">
            {groups.length > 0 && <div className="rail-grow absolute bottom-0 left-[3px] top-2 w-px bg-line" />}
            {groups.map((g) => (
              <div key={g.key} className="mb-10">
                <div className="relative mb-4 flex items-baseline gap-3">
                  <span className="absolute -left-[34px] top-[9px] h-3 w-3 rounded-full bg-ink ring-4 ring-paper sm:-left-[42px]" />
                  <h2 className="font-display text-xl italic">{g.label}</h2>
                  <span className="font-mono text-xs text-muted">
                    {g.notes.length} {g.notes.length === 1 ? 'note' : 'notes'}
                  </span>
                </div>
                <div className="space-y-4">
                  {g.notes.map((n) => (
                    <NoteCard key={n.id} note={n} index={cardIndex++} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className={cx('xl:block', !showTasks && 'hidden')}>
          <div className="rounded-2xl border border-line bg-card/60 p-3 xl:sticky xl:top-10">
            <h2 className="px-3 pt-2 text-[11px] uppercase tracking-[0.22em] text-muted">tasks from this project</h2>
            {tasks && <TaskRows tasks={tasks} showProject={false} />}
          </div>
        </aside>
      </div>

      <FloatingAction onClick={newNote} label="new note" />

      {editing && (
        <ProjectDialog
          project={project}
          onClose={() => setEditing(false)}
          onSave={async (name, color, icon) => {
            await updateProject(project.id, { name, color, icon })
            setEditing(false)
          }}
          onDelete={async () => {
            await deleteProject(project.id)
            nav('/', { replace: true })
          }}
        />
      )}
    </Page>
  )
}
