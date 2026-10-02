import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteNote } from '../lib/db'
import { DUMP_COLOR, DUMP_ID, DUMP_NAME, quickCapture } from '../lib/quick'
import { flySlip, navEl, reduced } from '../lib/motion'
import { ArrowUpIcon, ChevronIcon, DrawCheck, FolderIcon } from './Icons'
import { cx } from '../lib/utils'

const LINE = 32
const MIN_LINES = 3

const PROMPTS = [
  'drop a thought…',
  'ask Dian about the pricing deck',
  '[ ] email the vendor quote',
  'idea for tomorrow’s sync',
  'paste a link to read later',
  'what did the meeting decide?',
]

/** Does the text mention this project? (full name, or any word of 4+ letters from it) */
function mentions(name: string, text: string) {
  const t = text.toLowerCase()
  const n = name.toLowerCase()
  return t.includes(n) || n.split(/\s+/).some((w) => w.length >= 4 && t.includes(w))
}

/** Fast capture: type, hit Enter, done. Lands in dump unless you pick a folder. */
export default function QuickNote() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<string>(DUMP_ID)
  const [menu, setMenu] = useState(false)
  const [focused, setFocused] = useState(false)
  const [prompt, setPrompt] = useState(0)
  const [justSaved, setJustSaved] = useState(false)
  const [saved, setSaved] = useState<{ id: string; projectId: string; name: string; n: number }>()
  const area = useRef<HTMLTextAreaElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLButtonElement>(null)

  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray())
  const dumpCount = useLiveQuery(() => db.notes.where('projectId').equals(DUMP_ID).count(), [], 0)
  const real = projects?.filter((p) => p.id !== DUMP_ID) ?? []
  const current = target === DUMP_ID ? { name: DUMP_NAME, color: DUMP_COLOR } : projects?.find((p) => p.id === target)
  const suggestion = target === DUMP_ID && text.trim().length > 2 ? real.find((p) => mentions(p.name, text)) : undefined

  useEffect(() => {
    // Don't pop the on-screen keyboard on touch devices.
    const fine = matchMedia('(pointer: fine)').matches
    if (fine) area.current?.focus()
    // back-to-back navigations can swallow the first focus; retry once if nothing has it
    const retry = setTimeout(() => fine && document.activeElement === document.body && area.current?.focus(), 160)
    const refocus = () => area.current?.focus()
    window.addEventListener('vanotes:focus-capture', refocus)
    return () => {
      clearTimeout(retry)
      window.removeEventListener('vanotes:focus-capture', refocus)
    }
  }, [])

  // Placeholder prompts drift while the box is empty and idle — a little nudge, never in the way.
  useEffect(() => {
    if (text || focused || reduced()) return
    const t = setInterval(() => setPrompt((p) => (p + 1) % PROMPTS.length), 3800)
    return () => clearInterval(t)
  }, [text, focused])

  // Grow with content.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, LINE * MIN_LINES) + 'px'
  }, [text])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(undefined), 7000)
    return () => clearTimeout(t)
  }, [saved])

  const save = async () => {
    const body = text.trim()
    if (!body) return
    const projectId = current ? target : DUMP_ID
    const name = projectId === DUMP_ID ? DUMP_NAME : (current?.name ?? 'project')
    const from = area.current!.getBoundingClientRect()

    setText('') // instant: the page is yours again before the write finishes
    setTarget(DUMP_ID) // organise later: every capture starts in dump
    const note = await quickCapture(body, projectId)
    setSaved({ id: note.id, projectId, name, n: Date.now() })

    // the written page flies to its folder; a fresh sheet settles in
    flySlip(from, body, (navEl(projectId) ?? chip.current)?.getBoundingClientRect() ?? null, projectId)
    if (!reduced()) {
      sheet.current?.animate(
        [{ transform: 'translateY(10px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: 420, delay: 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
      )
    }
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1100)
    area.current?.focus()
  }

  return (
    <div className="mt-8">
      <div className="group/slip relative isolate mb-4">
        {/* pages stacked underneath */}
        <span aria-hidden className="absolute inset-x-3 -bottom-1.5 -z-10 h-full rounded-[22px] border border-line bg-card" />
        <span aria-hidden className="absolute inset-x-6 -bottom-3 -z-20 h-full rounded-[22px] border border-line bg-card opacity-70" />

        <div className="relative rounded-[22px] border border-line bg-card shadow-[0_24px_40px_-30px_rgba(43,38,34,0.6)] transition focus-within:border-accent/40 focus-within:shadow-[0_28px_48px_-28px_rgba(43,38,34,0.65)]">
          {/* writing area */}
          <div ref={sheet} className="relative">
            {/* punched holes, centred in rows 1 and 3 of the lined area so they never touch a rule */}
            {[0, 2].map((row) => (
              <span
                key={row}
                aria-hidden
                style={{ top: 44 + LINE * row + LINE / 2 - 1 }}
                className="absolute left-4 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-paper shadow-[inset_0_1.5px_2px_rgba(43,38,34,0.28),0_1px_0_rgba(255,255,255,0.9)]"
              />
            ))}
            {/* margin line */}
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-[3.75rem] w-px bg-accent/25 transition group-focus-within/slip:bg-accent/40" />

            {/* header */}
            <div className="flex h-11 items-end justify-between border-b-[1.5px] border-accent/20 pb-2 pl-[4.5rem] pr-5">
              <span className="text-[10px] uppercase leading-none tracking-[0.28em] text-muted">quick note</span>
              <span className="font-mono text-xs leading-none text-muted">
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase()}
              </span>
            </div>

            {/* rotating prompt (overlay so it can fade) */}
            {!text && (
              <span
                key={focused ? 'focus' : prompt}
                aria-hidden
                className="anim-fade pointer-events-none absolute left-[4.5rem] top-11 truncate pr-5 font-mono text-[15px] italic text-muted/55"
                style={{ lineHeight: `${LINE}px` }}
              >
                {focused ? PROMPTS[0] : PROMPTS[prompt]}
              </span>
            )}

            <textarea
              ref={area}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void save()
                }
              }}
              rows={MIN_LINES}
              aria-label="Quick note"
              style={{
                lineHeight: `${LINE}px`,
                backgroundImage: `linear-gradient(transparent ${LINE - 1}px, color-mix(in srgb, var(--color-line) 75%, transparent) ${LINE - 1}px)`,
                backgroundSize: `100% ${LINE}px`,
                backgroundAttachment: 'local',
              }}
              className="block w-full resize-none bg-transparent py-0 pl-[4.5rem] pr-5 font-mono text-[15px] caret-accent outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-b-[22px] bg-[#faf5ea] px-4 py-3 pl-5">
            <div className="flex min-w-0 items-center gap-2">
              {/* folder picker */}
              <div className="relative">
                <button
                  ref={chip}
                  onClick={() => setMenu((m) => !m)}
                  aria-haspopup="listbox"
                  aria-expanded={menu}
                  className="inline-flex h-9 max-w-[55vw] items-center gap-2 rounded-xl bg-pill/70 pl-3 pr-2 text-sm transition-colors hover:bg-pill"
                >
                  <FolderIcon />
                  <span className="h-2 w-2 shrink-0 rounded-[3px] transition-colors" style={{ background: current?.color ?? DUMP_COLOR }} />
                  <span className="truncate">{current?.name ?? DUMP_NAME}</span>
                  <ChevronIcon />
                </button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                    <ul role="listbox" className="anim-pop absolute bottom-full left-0 z-50 mb-2 max-h-72 w-64 origin-bottom-left overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-[0_16px_40px_-12px_rgba(43,38,34,0.4)]">
                      {[{ id: DUMP_ID, name: DUMP_NAME, color: DUMP_COLOR, hint: 'sort it later' }, ...real.map((p) => ({ ...p, hint: '' }))].map((p) => (
                        <li key={p.id} role="option" aria-selected={p.id === target}>
                          <button
                            onClick={() => {
                              setTarget(p.id)
                              setMenu(false)
                              area.current?.focus()
                            }}
                            className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-paper', p.id === target && 'bg-paper')}
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} />
                            <span className="truncate">{p.name}</span>
                            {p.hint && <span className="ml-auto text-xs text-muted">{p.hint}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* "this sounds like…" suggestion */}
              {suggestion && (
                <button
                  key={suggestion.id}
                  onClick={() => {
                    setTarget(suggestion.id)
                    area.current?.focus()
                  }}
                  className="anim-pop inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-dashed border-accent/50 px-3 text-xs text-accent transition-colors hover:bg-accent/10"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: suggestion.color }} />
                  <span className="truncate">file in {suggestion.name}?</span>
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-mono text-xs text-muted md:inline">⏎ save · ⇧⏎ new line</span>
              <button
                onClick={() => void save()}
                disabled={!text.trim() && !justSaved}
                aria-label="Save quick note"
                className={cx(
                  'grid h-9 w-9 place-items-center rounded-xl text-paper transition-[background-color,transform] duration-300',
                  justSaved ? 'bg-accent' : 'bg-ink hover:bg-black disabled:bg-pill disabled:text-muted',
                )}
              >
                {justSaved ? <DrawCheck /> : <ArrowUpIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p key={saved ? saved.n : dumpCount > 0 ? 'count' : 'hint'} className="anim-fade mt-3 min-h-5 px-2 font-mono text-xs text-muted" role="status" aria-live="polite">
        {saved ? (
          <>
            saved to <Link to={`/p/${saved.projectId}`} className="text-ink underline underline-offset-2">{saved.name}</Link> ·{' '}
            <button onClick={() => { void deleteNote(saved.id); setSaved(undefined) }} className="underline underline-offset-2 hover:text-ink">undo</button>
          </>
        ) : dumpCount > 0 ? (
          <>
            {dumpCount} in <Link to={`/p/${DUMP_ID}`} className="text-ink underline underline-offset-2">dump</Link> — sort them when you have a minute
          </>
        ) : (
          'anything you write here goes to dump unless you pick a folder. sort it later.'
        )}
      </p>
    </div>
  )
}
