import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { moveNote } from '../lib/quick'
import { pulseNav } from '../lib/motion'
import { CornerIcon } from './Icons'
import { cx } from '../lib/utils'
import ProjectMark from './ProjectMark'

/** "move to…" popover. Used on timeline cards and in the editor. */
export default function MoveMenu({ noteId, currentProjectId, className, label = true, beforeMove }: { noteId: string; currentProjectId: string; className?: string; label?: boolean; beforeMove?: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray())
  const others = projects?.filter((p) => p.id !== currentProjectId)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Move to another project"
        className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-pill hover:text-ink', className)}
      >
        <CornerIcon />
        {label && 'move to…'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul role="menu" className="anim-pop absolute right-0 origin-top-right top-full z-50 mt-1 max-h-72 w-60 overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-[0_16px_40px_-12px_rgba(43,38,34,0.4)]">
            {others?.length === 0 && <li className="px-3 py-2 text-xs text-muted">no other projects yet</li>}
            {others?.map((p) => (
              <li key={p.id} role="none">
                <button
                  role="menuitem"
                  onClick={async () => {
                    setOpen(false)
                    await beforeMove?.()
                    await moveNote(noteId, p.id)
                    pulseNav(p.id)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-paper"
                >
                  <ProjectMark project={p} size={18} />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
