import type { Project } from '../lib/db'
import { PROJECT_ICONS } from '../lib/projectIcons'
import { cx } from '../lib/utils'

export function parseIcon(icon?: string) {
  if (!icon) return null
  const i = icon.indexOf(':')
  if (i < 0) return null
  return { type: icon.slice(0, i) as 'emoji' | 'icon', value: icon.slice(i + 1) }
}

type Markable = Pick<Project, 'name' | 'color' | 'icon'>

/**
 * A project's little emblem: its emoji, its line icon (in the project colour),
 * or — when none is set — the first letter on a coloured chip.
 */
export default function ProjectMark({ project, size = 18, className }: { project: Markable; size?: number; className?: string }) {
  const ic = parseIcon(project.icon)
  const box = { width: size, height: size }

  if (ic?.type === 'emoji')
    return (
      <span aria-hidden className={cx('grid shrink-0 select-none place-items-center leading-none', className)} style={{ ...box, fontSize: size * 0.88 }}>
        {ic.value}
      </span>
    )

  const Glyph = ic?.type === 'icon' ? PROJECT_ICONS[ic.value] : undefined
  if (Glyph)
    return (
      <span aria-hidden className={cx('grid shrink-0 place-items-center', className)} style={{ ...box, color: project.color }}>
        <Glyph size={size * 0.94} strokeWidth={1.9} />
      </span>
    )

  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-[6px] font-semibold uppercase leading-none text-paper', className)}
      style={{ ...box, background: project.color, fontSize: Math.max(8, size * 0.55), borderRadius: size * 0.33 }}
    >
      {project.name.trim().charAt(0)}
    </span>
  )
}
