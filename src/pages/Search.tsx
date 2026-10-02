import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { Page } from '../components/Layout'
import { SearchIcon } from '../components/Icons'
import { dayLabel, timeLabel } from '../lib/utils'

function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text.slice(0, 120)
  const start = Math.max(0, i - 40)
  return (start ? '…' : '') + text.slice(start, i + q.length + 80)
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0 || !q) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-[#ecd9b6] px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export default function Search() {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const q = query.trim().toLowerCase()
  const results = useLiveQuery(async () => {
    if (!q) return []
    const [notes, projects] = await Promise.all([db.notes.toArray(), db.projects.toArray()])
    const pById = new Map(projects.map((p) => [p.id, p]))
    return notes
      .filter((n) => n.title.toLowerCase().includes(q) || n.bodyText.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((n) => ({ note: n, project: pById.get(n.projectId) }))
  }, [q])

  return (
    <Page>
      <h1 className="font-display text-4xl sm:text-5xl">search</h1>
      <div className="mt-6 flex h-14 items-center gap-3 rounded-2xl border border-line bg-card px-5 focus-within:border-ink">
        <SearchIcon />
        <input
          ref={ref}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search titles and notes"
          aria-label="Search"
          className="h-full flex-1 bg-transparent outline-none"
        />
      </div>

      <ul className="mt-8 space-y-2">
        {results?.map(({ note, project }, idx) => (
          <li key={note.id} style={{ '--i': Math.min(idx, 8) } as React.CSSProperties} className="rise-in">
            <Link to={`/p/${note.projectId}/n/${note.id}`} className="block rounded-2xl px-4 py-3 transition hover:bg-card">
              <div className="flex items-center gap-2 text-xs text-muted">
                {project && <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />}
                <span>{project?.name}</span>
                <span>·</span>
                <span>
                  {dayLabel(note.createdAt)}, {timeLabel(note.createdAt)}
                </span>
              </div>
              <p className="mt-1 font-medium">
                <Highlight text={note.title || note.bodyText.split('\n')[0] || 'Untitled note'} q={q} />
              </p>
              {note.bodyText && (
                <p className="mt-1 line-clamp-2 font-mono text-sm text-muted">
                  <Highlight text={snippet(note.bodyText.replace(/\n+/g, ' '), q)} q={q} />
                </p>
              )}
            </Link>
          </li>
        ))}
        {q && results?.length === 0 && <p className="px-4 font-mono text-sm text-muted">no matches for “{query}”.</p>}
      </ul>
    </Page>
  )
}
