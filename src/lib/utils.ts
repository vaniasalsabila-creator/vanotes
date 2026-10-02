import { useEffect, useState } from 'react'
import type { Note } from './db'

export function timeLabel(ts: number) {
  const d = new Date(ts)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h % 12 || 12}.${m}${h < 12 ? 'am' : 'pm'}`
}

const startOfDay = (ts: number) => new Date(new Date(ts).setHours(0, 0, 0, 0)).getTime()
const DAY = 86_400_000

export function dayLabel(ts: number) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear()
  return new Date(ts).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function shortDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase()
}

/** Groups notes (already sorted newest-first) under date headers. */
export function groupByDay(notes: Note[]) {
  const groups: { key: number; label: string; notes: Note[] }[] = []
  for (const n of notes) {
    const key = startOfDay(n.createdAt)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.notes.push(n)
    else groups.push({ key, label: dayLabel(n.createdAt), notes: [n] })
  }
  return groups
}

/** Object URL for a Blob that is revoked on unmount. */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

export function eventRange(e: { start: number; end: number; allDay: boolean }) {
  if (e.allDay) return 'all day'
  return e.end > e.start ? `${timeLabel(e.start)} – ${timeLabel(e.end)}` : timeLabel(e.start)
}
