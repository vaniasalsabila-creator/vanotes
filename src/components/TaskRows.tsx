import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Project, Task } from '../lib/db'
import { setTaskDone } from '../lib/tasks'
import { useTickDelay } from './TaskCheck'
import { DrawCheck } from './Icons'
import { cx } from '../lib/utils'

export type TaskWithSource = Task & { noteTitle: string; project?: Project }

/** Ids that appeared after the first render — they get a brief glow so you see the task arrive. */
function useFreshIds(ids: string[]) {
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const key = ids.join('|')
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(ids)
      return
    }
    const added = ids.filter((i) => !seen.current!.has(i))
    ids.forEach((i) => seen.current!.add(i))
    if (!added.length) return
    setFresh(new Set(added))
    const t = setTimeout(() => setFresh(new Set()), 1900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return fresh
}

function Row({ t, showProject, index, fresh }: { t: TaskWithSource; showProject: boolean; index: number; fresh: boolean }) {
  const tick = useTickDelay(t.done, (v) => void setTaskDone(t.id, v))
  return (
    <li
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      className={cx('rise-in group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-card', fresh && 'task-new')}
    >
      <input
        type="checkbox"
        checked={tick.checked}
        onChange={(e) => tick.onChange(e.target.checked)}
        aria-label={`Mark "${t.text}" ${t.done ? 'open' : 'done'}`}
        className="check mt-1"
      />
      <div className="min-w-0 flex-1">
        <p className="break-words font-mono text-[15px] leading-snug">
          <span className="strike" data-done={tick.checked}>
            {t.text}
          </span>
        </p>
        <Link
          to={`/p/${t.projectId}/n/${t.noteId}`}
          className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          {showProject && t.project && (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.project.color }} />
              <span className="shrink-0">{t.project.name}</span>
              <span>›</span>
            </>
          )}
          <span className="truncate underline-offset-2 group-hover:underline">{t.noteTitle || 'Untitled note'}</span>
        </Link>
      </div>
    </li>
  )
}

/** Fills from zero on mount so it visibly "earns" its width. */
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  return (
    <div className="px-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done">
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>
          {done} of {total} done
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pill">
        <div
          className={cx('h-full rounded-full transition-[width,background-color] duration-700 ease-[var(--ease)]', pct === 100 ? 'bg-accent' : 'bg-ink/70')}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  )
}

export default function TaskRows({ tasks, showProject }: { tasks: TaskWithSource[]; showProject: boolean }) {
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
  const fresh = useFreshIds(tasks.map((t) => t.id))

  if (!tasks.length)
    return (
      <div className="mt-4 max-w-md px-3 pb-3 font-mono text-sm leading-relaxed text-muted">
        <p>no tasks yet.</p>
        <p className="mt-2">
          inside any note, tap the checklist button (or type <span className="text-ink">[ ]</span> and a space) and the
          item lands here automatically.
        </p>
      </div>
    )

  return (
    <div className="mt-4 space-y-6">
      <Progress done={done.length} total={tasks.length} />
      {open.length > 0 ? (
        <ul>{open.map((t, i) => <Row key={t.id} t={t} showProject={showProject} index={i} fresh={fresh.has(t.id)} />)}</ul>
      ) : (
        <p key="clear" className="anim-pop flex items-center gap-2 px-3 font-mono text-sm text-accent">
          <DrawCheck size={16} /> all clear
        </p>
      )}
      {done.length > 0 && (
        <section>
          <h3 className="px-3 text-xs uppercase tracking-[0.18em] text-muted">done · {done.length}</h3>
          <ul className="mt-2">{done.map((t, i) => <Row key={t.id} t={t} showProject={showProject} index={i} fresh={false} />)}</ul>
        </section>
      )}
    </div>
  )
}
