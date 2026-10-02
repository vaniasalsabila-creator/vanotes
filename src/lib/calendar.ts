import ICAL from 'ical.js'
import type { JSONContent } from '@tiptap/react'
import { db, uid, type CalEvent, type Note } from './db'
import { docToText } from './tasks'
import { dayLabel, eventRange } from './utils'

const DAY = 86_400_000
/** Recurring events are expanded within this window around "now". */
const PAST_DAYS = 30
const FUTURE_DAYS = 120
const MAX_OCCURRENCES = 1000

const LINK_RE = /https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)[^\s<>")\\]*/i

// --- time zones ---------------------------------------------------------

function tzOffset(ts: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  })
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, +x.value]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
}

/** Wall-clock time in an IANA zone -> real instant. Used when the file names a zone but ships no VTIMEZONE. */
function zonedToMs(t: ICAL.Time, tz: string) {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  const first = guess - tzOffset(guess, tz)
  return guess - tzOffset(first, tz)
}

const validZone = (tz?: string | null): tz is string => {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function toMs(t: ICAL.Time, tzid?: string | null): number {
  if (t.isDate) return new Date(t.year, t.month - 1, t.day).getTime()
  const floating = !t.zone || t.zone.tzid === 'floating'
  if (floating && validZone(tzid)) return zonedToMs(t, tzid)
  return t.toJSDate().getTime()
}

// --- parsing ------------------------------------------------------------

export interface ParsedCalendar {
  sourceName: string
  events: CalEvent[]
}

export function parseIcs(text: string, fallbackName: string, now = Date.now()): ParsedCalendar {
  const root = new ICAL.Component(ICAL.parse(text))
  const sourceName = (root.getFirstPropertyValue('x-wr-calname') as string | null) || fallbackName

  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vtz)
    if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz)
  }

  const from = now - PAST_DAYS * DAY
  const to = now + FUTURE_DAYS * DAY

  const all = root.getAllSubcomponents('vevent')
  const masters: ICAL.Event[] = []
  const overrides: ICAL.Event[] = []
  for (const v of all) {
    const ev = new ICAL.Event(v)
    if (v.hasProperty('recurrence-id')) overrides.push(ev)
    else masters.push(ev)
  }
  for (const o of overrides) for (const m of masters) if (m.uid === o.uid) m.relateException(o)

  const out = new Map<string, CalEvent>()
  const add = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, item: ICAL.Event, tzid: string | null) => {
    if (String(item.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') return
    const s = toMs(start, tzid)
    let e = toMs(end, tzid)
    const allDay = start.isDate
    if (allDay) e -= 1 // all-day DTEND is exclusive
    if (e < from || s > to) return
    const location = item.location?.trim() || undefined
    const description = item.description?.trim().slice(0, 2000) || undefined
    const conf = item.component.getFirstPropertyValue('x-google-conference') as string | null
    const link = conf || `${location ?? ''} ${description ?? ''} ${item.component.getFirstPropertyValue('url') ?? ''}`.match(LINK_RE)?.[0]
    const id = `${ev.uid}|${s}`
    out.set(id, { id, title: item.summary?.trim() || '(no title)', start: s, end: Math.max(e, s), allDay, location, description, link: link || undefined, sourceName })
  }

  for (const ev of masters) {
    const tzid = (ev.component.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null
    if (!ev.isRecurring()) {
      add(ev, ev.startDate, ev.endDate, ev, tzid)
      continue
    }
    const it = ev.iterator()
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      if (toMs(next, tzid) > to) break
      const d = ev.getOccurrenceDetails(next)
      add(ev, d.startDate, d.endDate, d.item, tzid)
    }
  }

  return { sourceName, events: [...out.values()] }
}

export interface ImportResult {
  calendars: string[]
  added: number
  updated: number
  removed: number
}

/** Imports one or more .ics files. Re-importing updates in place and drops events that vanished from the source. */
export async function importIcsFiles(files: File[]): Promise<ImportResult> {
  const parsed: ParsedCalendar[] = []
  for (const f of files) {
    parsed.push(parseIcs(await f.text(), f.name.replace(/\.ics$/i, '')))
  }

  const res: ImportResult = { calendars: [], added: 0, updated: 0, removed: 0 }
  const windowStart = Date.now() - PAST_DAYS * DAY

  await db.transaction('rw', db.events, async () => {
    for (const cal of parsed) {
      res.calendars.push(cal.sourceName)
      const existing = new Map((await db.events.where('sourceName').equals(cal.sourceName).toArray()).map((e) => [e.id, e]))
      const fresh = new Set(cal.events.map((e) => e.id))

      const stale = [...existing.values()].filter((e) => e.start >= windowStart && !fresh.has(e.id)).map((e) => e.id)
      if (stale.length) await db.events.bulkDelete(stale)
      res.removed += stale.length

      await db.events.bulkPut(
        cal.events.map((e) => {
          if (existing.has(e.id)) res.updated++
          else res.added++
          return { ...e, noteId: existing.get(e.id)?.noteId }
        }),
      )
    }
  })
  return res
}

export const removeCalendar = (sourceName: string) => db.events.where('sourceName').equals(sourceName).delete()

// --- events -> notes ----------------------------------------------------

const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks && { marks }) })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', ...(content.length && { content }) })

/** Starts a note in `projectId` from a meeting: title, time, join link and an action-items checklist. */
export async function createNoteFromEvent(event: CalEvent, projectId: string): Promise<Note> {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      p(t(`${dayLabel(event.start)}, ${eventRange(event)}`)),
      ...(event.location && !event.link ? [p(t(`where: ${event.location.slice(0, 200)}`))] : []),
      ...(event.link ? [p(t('join: '), t(event.link, [{ type: 'link', attrs: { href: event.link } }]))] : []),
      p(),
      p(t('action items', [{ type: 'bold' }])),
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p()] }] },
    ],
  }
  const now = Date.now()
  const note: Note = {
    id: uid(),
    projectId,
    title: event.title,
    content: doc,
    bodyText: docToText(doc),
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.notes, db.events, async () => {
    await db.notes.add(note)
    await db.events.update(event.id, { noteId: note.id })
  })
  return note
}
