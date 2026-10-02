import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CalEvent } from '../lib/db'
import { importIcsFiles, removeCalendar, type ImportResult } from '../lib/calendar'
import { Page } from '../components/Layout'
import EventRow from '../components/EventRow'
import { PlusIcon } from '../components/Icons'
import { cx, dayLabel } from '../lib/utils'

const startOfToday = () => new Date().setHours(0, 0, 0, 0)
const DAY = 86_400_000

export default function Calendar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [over, setOver] = useState(false)

  const all = useLiveQuery(() => db.events.toArray())
  const sources = all && [...all.reduce((m, e) => m.set(e.sourceName, (m.get(e.sourceName) ?? 0) + 1), new Map<string, number>())]

  const today = startOfToday()
  const shown = all
    ?.filter((e) => (view === 'upcoming' ? e.end >= Date.now() || e.start >= today : e.start < today && e.end < Date.now()))
    .filter((e) => (view === 'upcoming' ? e.start < today + 15 * DAY : e.start >= today - 30 * DAY))
    .sort((a, b) => (view === 'upcoming' ? a.start - b.start : b.start - a.start))

  const groups: { key: number; events: CalEvent[] }[] = []
  for (const e of shown ?? []) {
    const key = new Date(e.start).setHours(0, 0, 0, 0)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.events.push(e)
    else groups.push({ key, events: [e] })
  }

  let idx = 0
  const doImport = async (files: File[]) => {
    const ics = files.filter((f) => /\.ics$|text\/calendar/i.test(f.name + f.type))
    if (!ics.length) return setMsg({ ok: false, text: 'that doesn’t look like an .ics file.' })
    setBusy(true)
    try {
      const r: ImportResult = await importIcsFiles(ics)
      setMsg({
        ok: true,
        text: `${r.calendars.join(', ')}: ${r.added} new, ${r.updated} updated${r.removed ? `, ${r.removed} removed` : ''}.`,
      })
    } catch (err) {
      console.error(err)
      setMsg({ ok: false, text: 'couldn’t read that file. is it a valid .ics export?' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl">calendar</h1>
          <p className="mt-2 font-mono text-sm text-muted">meetings from your imported calendars</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-5 text-sm text-paper hover:bg-black disabled:opacity-50"
        >
          <PlusIcon /> {busy ? 'importing…' : 'import .ics'}
        </button>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" multiple hidden onChange={(e) => { void doImport([...(e.target.files ?? [])]); e.target.value = '' }} />
      </header>

      {msg && (
        <p key={msg.text} role="status" className={cx('anim-pop mt-6 rounded-xl px-4 py-3 font-mono text-sm', msg.ok ? 'bg-pill' : 'bg-[#f1d9d0] text-[#7a3b28]')}>
          {msg.text}
        </p>
      )}

      {all && all.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void doImport([...e.dataTransfer.files]) }}
          className={cx('mt-10 rounded-3xl border border-dashed p-8 transition sm:p-10', over ? 'border-ink bg-card' : 'border-muted/50')}
        >
          <p className="font-display text-xl">bring in your calendar</p>
          <p className="mt-2 max-w-lg font-mono text-sm leading-relaxed text-muted">drop an .ics file here, or use the import button. everything is read in your browser and stays on this device.</p>
          <HowTo open />
        </div>
      ) : (
        <>
          <div className="mt-8 inline-flex rounded-xl bg-pill/70 p-1 text-sm" role="tablist">
            {(['upcoming', 'past'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('rounded-lg px-4 py-1.5 transition', view === v ? 'bg-card shadow-sm' : 'text-muted')}>
                {v}
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-9">
            {groups.length === 0 && <p className="font-mono text-sm text-muted">{view === 'upcoming' ? 'nothing in the next two weeks.' : 'nothing in the last 30 days.'}</p>}
            {groups.map((g) => (
              <section key={g.key}>
                <h2 className="mb-3 font-display text-xl italic">
                  {dayLabel(g.key)}
                  <span className="ml-3 font-mono text-xs not-italic text-muted">{g.events.length} {g.events.length === 1 ? 'event' : 'events'}</span>
                </h2>
                <ul className="space-y-2">
                  {g.events.map((e) => <EventRow key={e.id} event={e} showDate={view === 'past'} index={idx++} />)}
                </ul>
              </section>
            ))}
          </div>

          <section className="mt-16 border-t border-line pt-6">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">imported calendars</h2>
            <ul className="mt-3 space-y-1">
              {sources?.map(([name, n]) => (
                <li key={name} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-card">
                  <span className="truncate">{name} <span className="ml-2 font-mono text-xs text-muted">{n} events</span></span>
                  <button onClick={() => confirm(`Remove "${name}" and its events? Notes you started from them are kept.`) && void removeCalendar(name)} className="text-xs text-accent hover:underline">remove</button>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-3 text-xs text-muted">to refresh, import the same calendar again — events update in place, nothing is duplicated.</p>
            <HowTo />
          </section>
        </>
      )}
    </Page>
  )
}

function HowTo({ open }: { open?: boolean }) {
  return (
    <details open={open} className="mt-5 text-sm">
      <summary className="cursor-pointer select-none text-muted hover:text-ink">how do i get an .ics file?</summary>
      <ol className="mt-3 max-w-xl list-decimal space-y-1.5 pl-5 font-mono text-[13px] leading-relaxed text-muted">
        <li><b className="text-ink">Google Calendar:</b> settings → import &amp; export → export. you get a zip, one .ics per calendar. unzip it and import the one you want.</li>
        <li><b className="text-ink">Outlook:</b> calendar → share/publish → download the .ics, or file → save calendar.</li>
        <li><b className="text-ink">Apple Calendar:</b> file → export → export…</li>
        <li>recurring meetings are expanded 30 days back and 120 days ahead, so re-import now and then.</li>
      </ol>
    </details>
  )
}
