import { useEffect, useRef, useState } from 'react'
import { PROJECT_COLORS, type Project } from '../lib/db'
import { PillButton } from './Layout'
import { cx } from '../lib/utils'

export default function ProjectDialog({
  project,
  onSave,
  onDelete,
  onClose,
}: {
  project?: Project
  onSave: (name: string, color: string) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0])
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const submit = () => name.trim() && onSave(name, color)

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-label={project ? 'Edit project' : 'New project'} className="page-enter w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl">
        <h2 className="font-mono text-lg font-bold">{project ? 'edit project' : 'new project'}</h2>

        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="project name"
          maxLength={60}
          className="mt-5 h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-ink"
        />

        <div className="mt-5 flex flex-wrap gap-3" role="radiogroup" aria-label="Color">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={cx(
                'h-8 w-8 rounded-full ring-offset-2 ring-offset-paper transition',
                c === color ? 'ring-2 ring-ink' : 'hover:scale-110',
              )}
            />
          ))}
        </div>

        <div className="mt-7 flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              onClick={() => confirm(`Delete "${project?.name}" and all its notes?`) && onDelete()}
              className="px-2 text-sm text-accent hover:underline"
            >
              delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <PillButton onClick={onClose}>cancel</PillButton>
            <PillButton variant="solid" disabled={!name.trim()} onClick={submit}>
              {project ? 'save' : 'create'}
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  )
}
