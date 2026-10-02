import { useEffect, useMemo, useRef, useState } from 'react'
import { PROJECT_COLORS } from '../lib/db'
import { PROJECT_ICONS, PROJECT_ICON_NAMES } from '../lib/projectIcons'
import { parseIcon } from './ProjectMark'
import { cx } from '../lib/utils'

interface EmojiEntry {
  emoji: string
  name: string
  slug: string
  unicode_version: string
}
interface EmojiGroup {
  name: string
  slug: string
  emojis: EmojiEntry[]
}

const RECENT_KEY = 'vanotes:recent-emoji'
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
const pushRecent = (emoji: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, 18)))
  } catch {
    /* recents are a nicety */
  }
}

/** The emoji data is big (~400 KB), so it only downloads the first time a picker opens. */
let emojiCache: EmojiGroup[] | null = null
async function loadEmoji(): Promise<EmojiGroup[]> {
  if (emojiCache) return emojiCache
  const mod = await import('unicode-emoji-json/data-by-group.json')
  const groups = (mod.default ?? mod) as unknown as EmojiGroup[]
  // keep emoji that render on common systems (skip the very newest Unicode versions)
  emojiCache = groups
    .map((g) => ({ ...g, emojis: g.emojis.filter((e) => parseFloat(e.unicode_version) <= 14) }))
    .filter((g) => g.emojis.length)
  return emojiCache
}

type Tab = 'emoji' | 'icons'

export default function IconPicker({
  value,
  color,
  onPick,
  onColor,
  onClose,
}: {
  value?: string
  color: string
  /** `undefined` = remove the icon. `keepOpen` is used by the shuffle button. */
  onPick: (icon: string | undefined, keepOpen?: boolean) => void
  onColor?: (color: string) => void
  onClose: () => void
}) {
  const current = parseIcon(value)
  const [tab, setTab] = useState<Tab>(current?.type === 'icon' ? 'icons' : 'emoji')
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<EmojiGroup[] | null>(emojiCache)
  const [colors, setColors] = useState(false)
  const [recent, setRecent] = useState<string[]>(readRecent)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    loadEmoji().then((g) => alive && setGroups(g))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    search.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also close a dialog underneath
        onClose()
      }
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const emojiResults = useMemo(
    () => (q && groups ? groups.flatMap((g) => g.emojis).filter((e) => e.name.includes(q) || e.slug.includes(q.replace(/\s+/g, '_'))) : []),
    [q, groups],
  )
  const iconResults = useMemo(() => PROJECT_ICON_NAMES.filter((n) => !q || n.includes(q.replace(/\s+/g, '-'))), [q])

  const pickEmoji = (emoji: string, keepOpen = false) => {
    pushRecent(emoji)
    setRecent(readRecent())
    onPick(`emoji:${emoji}`, keepOpen)
  }
  const shuffle = () => {
    if (tab === 'icons') {
      onPick(`icon:${PROJECT_ICON_NAMES[Math.floor(Math.random() * PROJECT_ICON_NAMES.length)]}`, true)
    } else if (groups) {
      const all = groups.flatMap((g) => g.emojis)
      pickEmoji(all[Math.floor(Math.random() * all.length)].emoji, true)
    }
  }

  const EmojiBtn = ({ e, label }: { e: string; label: string }) => (
    <button
      onClick={() => pickEmoji(e)}
      title={label}
      aria-label={label}
      className={cx('grid h-8 w-8 place-items-center rounded-lg text-[19px] leading-none transition-colors hover:bg-paper', current?.type === 'emoji' && current.value === e && 'bg-pill')}
    >
      {e}
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Choose an icon"
        className="anim-pop absolute left-0 top-full z-[61] mt-2 w-[min(21.5rem,calc(100vw-2rem))] origin-top-left overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_60px_-16px_rgba(43,38,34,0.45)]"
      >
        {/* tabs */}
        <div className="flex items-center justify-between border-b border-line px-2 pt-2">
          <div className="flex gap-1" role="tablist">
            {(['emoji', 'icons'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx('rounded-t-lg px-3 pb-2 pt-1 text-sm transition-colors', tab === t ? 'border-b-2 border-ink text-ink' : 'border-b-2 border-transparent text-muted hover:text-ink')}
              >
                {t === 'emoji' ? 'Emoji' : 'Icons'}
              </button>
            ))}
          </div>
          {value && (
            <button onClick={() => onPick(undefined)} className="mb-1 rounded-lg px-2.5 py-1 text-sm text-muted transition-colors hover:bg-paper hover:text-accent">
              Remove
            </button>
          )}
        </div>

        {/* search · shuffle · colour */}
        <div className="flex items-center gap-2 p-2">
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'emoji' ? 'Search emoji…' : 'Search icons…'}
            aria-label="Filter"
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-paper/50 px-3 text-sm outline-none transition-colors focus:border-ink"
          />
          <button onClick={shuffle} title="Random" aria-label="Random icon" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-paper hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
          </button>
          {onColor && (
            <button
              onClick={() => setColors((c) => !c)}
              title="Project colour"
              aria-label="Project colour"
              aria-expanded={colors}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line transition-colors hover:bg-paper"
            >
              <span className="h-4 w-4 rounded-full" style={{ background: color }} />
            </button>
          )}
        </div>
        {colors && onColor && (
          <div className="anim-fade flex flex-wrap gap-2.5 px-3 pb-2" role="radiogroup" aria-label="Colour">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                onClick={() => onColor(c)}
                style={{ background: c }}
                className={cx('h-6 w-6 rounded-full ring-offset-2 ring-offset-card transition', c === color ? 'ring-2 ring-ink' : 'hover:scale-110')}
              />
            ))}
          </div>
        )}

        {/* content */}
        <div className="max-h-72 overflow-y-auto px-2 pb-3">
          {tab === 'emoji' ? (
            !groups ? (
              <p className="px-1 py-6 text-center font-mono text-xs text-muted">loading emoji…</p>
            ) : q ? (
              emojiResults.length ? (
                <div className="grid grid-cols-9 gap-0.5">
                  {emojiResults.map((e) => (
                    <EmojiBtn key={e.emoji} e={e.emoji} label={e.name} />
                  ))}
                </div>
              ) : (
                <p className="px-1 py-6 text-center font-mono text-xs text-muted">nothing called “{query}”.</p>
              )
            ) : (
              <>
                {recent.length > 0 && (
                  <section>
                    <h3 className="px-1 pb-1 pt-1 text-xs text-muted">Recent</h3>
                    <div className="grid grid-cols-9 gap-0.5">
                      {recent.map((e) => (
                        <EmojiBtn key={e} e={e} label="recent emoji" />
                      ))}
                    </div>
                  </section>
                )}
                {groups.map((g) => (
                  <section key={g.slug} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 160px' }}>
                    <h3 className="px-1 pb-1 pt-3 text-xs text-muted">{g.name}</h3>
                    <div className="grid grid-cols-9 gap-0.5">
                      {g.emojis.map((e) => (
                        <EmojiBtn key={e.emoji} e={e.emoji} label={e.name} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )
          ) : iconResults.length ? (
            <div className="grid grid-cols-9 gap-0.5 pt-1">
              {iconResults.map((n) => {
                const Glyph = PROJECT_ICONS[n]
                return (
                  <button
                    key={n}
                    onClick={() => onPick(`icon:${n}`)}
                    title={n.replace(/-/g, ' ')}
                    aria-label={n.replace(/-/g, ' ')}
                    style={{ color }}
                    className={cx('grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-paper', current?.type === 'icon' && current.value === n && 'bg-pill')}
                  >
                    <Glyph size={18} strokeWidth={1.9} />
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="px-1 py-6 text-center font-mono text-xs text-muted">no icon called “{query}”.</p>
          )}
        </div>
      </div>
    </>
  )
}
