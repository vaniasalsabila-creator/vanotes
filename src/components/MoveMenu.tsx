import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { moveNote } from '../lib/quick'
import { pulseNav } from '../lib/motion'
import ProjectMark from './ProjectMark'
import Portal from './Portal'
import { CornerIcon } from './Icons'
import { cx } from '../lib/utils'

const MENU_W = 240 // w-60
const MENU_MAX_H = 288 // max-h-72

/** "move to…" popover. Used on timeline cards and in the editor. */
export default function MoveMenu({
  noteId,
  currentProjectId,
  className,
  label = true,
  beforeMove,
}: {
  noteId: string
  currentProjectId: string
  className?: string
  label?: boolean
  beforeMove?: () => Promise<void>
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray())
  const others = projects?.filter((p) => p.id !== currentProjectId)
  const open = !!pos

  const close = () => setPos(null)
  const toggle = () => {
    if (open || !btn.current) return close()
    // The menu lives in a portal (cards can trap pop-ups), so place it from the button's position.
    const r = btn.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
    const flip = r.bottom + MENU_MAX_H + 12 > window.innerHeight && r.top > MENU_MAX_H / 2
    setPos(flip ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left })
  }

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true) // anchored by position, so don't leave it floating
    return () => {
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Move to another project"
        className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-pill hover:text-ink', className)}
      >
        <CornerIcon />
        {label && 'move to…'}
      </button>
      {pos && (
        <Portal>
          <div className="fixed inset-0 z-[70]" onClick={(e) => { e.stopPropagation(); close() }} />
          <ul
            role="menu"
            style={{ ...pos, width: MENU_W, maxHeight: MENU_MAX_H }}
            onClick={(e) => e.stopPropagation()}
            className={cx(
              'anim-pop fixed z-[71] overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-[0_16px_40px_-12px_rgba(43,38,34,0.4)]',
              pos.bottom !== undefined ? 'origin-bottom-right' : 'origin-top-right',
            )}
          >
            {others?.length === 0 && <li className="px-3 py-2 text-xs text-muted">no other projects yet</li>}
            {others?.map((p) => (
              <li key={p.id} role="none">
                <button
                  role="menuitem"
                  onClick={async () => {
                    close()
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
        </Portal>
      )}
    </div>
  )
}
