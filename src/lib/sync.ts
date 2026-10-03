import type { JSONContent } from '@tiptap/react'
import {
  applyingRemote,
  clearOutbox,
  db,
  takeOutbox,
  type CalEvent,
  type CloudTable,
  type Note,
  type NoteImage,
  type Project,
} from './db'
import { supabase } from './supabase'
import { syncTasks } from './tasks'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

const BUCKET = 'note-images'
const sinceKey = (userId: string) => `vanotes:last-sync:${userId}`

let status: SyncStatus = 'idle'
const listeners = new Set<(s: SyncStatus) => void>()

export const getSyncStatus = () => status
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((fn) => fn(next))
}

function readSince(userId: string): number | null {
  try {
    const raw = localStorage.getItem(sinceKey(userId))
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeSince(userId: string, n: number) {
  try {
    localStorage.setItem(sinceKey(userId), String(n))
  } catch {
    /* ignore */
  }
}

type ProjectRow = {
  id: string
  name: string
  color: string
  icon: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

type NoteRow = {
  id: string
  project_id: string
  title: string
  content: JSONContent
  body_text: string
  created_at: number
  updated_at: number
  deleted_at: number | null
}

type EventRow = {
  id: string
  title: string
  start_at: number
  end_at: number
  all_day: boolean
  location: string | null
  description: string | null
  link: string | null
  source_name: string
  note_id: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

type ImageRow = {
  id: string
  note_id: string
  name: string
  sort_order: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

async function uid() {
  const { data } = await supabase!.auth.getSession()
  return data.session?.user.id
}

function newer(remoteUpdated: number, localUpdated?: number) {
  return remoteUpdated >= (localUpdated ?? 0)
}

async function pullTable<R extends { id: string; updated_at: number; deleted_at: number | null }>(
  table: 'projects' | 'notes' | 'events' | 'note_images',
  userId: string,
  since: number | null,
) {
  let q = supabase!.from(table).select('*').eq('user_id', userId)
  if (since != null) q = q.gte('updated_at', since - 10_000)
  else q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as R[]
}

async function applyProjects(rows: ProjectRow[]) {
  await applyingRemote(async () => {
    for (const r of rows) {
      if (r.deleted_at) {
        await db.projects.delete(r.id)
        continue
      }
      const local = await db.projects.get(r.id)
      if (local && !newer(r.updated_at, local.updatedAt)) continue
      const next: Project = {
        id: r.id,
        name: r.name,
        color: r.color,
        ...(r.icon ? { icon: r.icon } : {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
      await db.projects.put(next)
    }
  })
}

async function applyNotes(rows: NoteRow[]) {
  await applyingRemote(async () => {
    for (const r of rows) {
      if (r.deleted_at) {
        await db.images.where('noteId').equals(r.id).delete()
        await db.tasks.where('noteId').equals(r.id).delete()
        await db.notes.delete(r.id)
        continue
      }
      const local = await db.notes.get(r.id)
      if (local && !newer(r.updated_at, local.updatedAt)) continue
      const next: Note = {
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        content: r.content,
        bodyText: r.body_text,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
      await db.notes.put(next)
      await syncTasks(r.id, r.project_id, r.content)
    }
  })
}

async function applyEvents(rows: EventRow[]) {
  await applyingRemote(async () => {
    for (const r of rows) {
      if (r.deleted_at) {
        await db.events.delete(r.id)
        continue
      }
      const local = await db.events.get(r.id)
      if (local && !newer(r.updated_at, local.updatedAt)) continue
      const next: CalEvent = {
        id: r.id,
        title: r.title,
        start: r.start_at,
        end: r.end_at,
        allDay: r.all_day,
        sourceName: r.source_name,
        updatedAt: r.updated_at,
        ...(r.location ? { location: r.location } : {}),
        ...(r.description ? { description: r.description } : {}),
        ...(r.link ? { link: r.link } : {}),
        ...(r.note_id ? { noteId: r.note_id } : {}),
      }
      await db.events.put(next)
    }
  })
}

async function downloadImage(userId: string, r: ImageRow) {
  const { data, error } = await supabase!.storage.from(BUCKET).download(`${userId}/${r.id}`)
  if (error || !data) throw error ?? new Error('image download failed')
  const next: NoteImage = {
    id: r.id,
    noteId: r.note_id,
    blob: data,
    name: r.name,
    order: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
  await applyingRemote(() => db.images.put(next))
}

async function applyImages(userId: string, rows: ImageRow[]) {
  for (const r of rows) {
    if (r.deleted_at) {
      await applyingRemote(() => db.images.delete(r.id))
      continue
    }
    const local = await db.images.get(r.id)
    if (local?.blob && !newer(r.updated_at, local.updatedAt ?? local.createdAt)) continue
    try {
      await downloadImage(userId, r)
    } catch {
      // file may still be uploading; next sync will retry
    }
  }
}

async function pull(userId: string) {
  const since = readSince(userId)
  const [projects, notes, events, images] = await Promise.all([
    pullTable<ProjectRow>('projects', userId, since),
    pullTable<NoteRow>('notes', userId, since),
    pullTable<EventRow>('events', userId, since),
    pullTable<ImageRow>('note_images', userId, since),
  ])
  await applyProjects(projects)
  await applyNotes(notes)
  await applyEvents(events)
  await applyImages(userId, images)
  const maxTs = Math.max(
    since ?? 0,
    ...projects.map((r) => r.updated_at),
    ...notes.map((r) => r.updated_at),
    ...events.map((r) => r.updated_at),
    ...images.map((r) => r.updated_at),
    Date.now(),
  )
  writeSince(userId, maxTs)
}

async function upsert(table: string, row: Record<string, unknown>) {
  const { error } = await supabase!.from(table).upsert(row, { onConflict: 'user_id,id' })
  if (error) throw error
}

async function pushDelete(table: string, userId: string, id: string, extra: Record<string, unknown>) {
  const now = Date.now()
  const { error } = await supabase!.from(table).upsert(
    { user_id: userId, id, ...extra, updated_at: now, deleted_at: now },
    { onConflict: 'user_id,id' },
  )
  if (error) throw error
}

async function pushOne(userId: string, table: CloudTable, op: 'upsert' | 'delete', recordId: string) {
  if (op === 'delete') {
    if (table === 'images') {
      await supabase!.storage.from(BUCKET).remove([`${userId}/${recordId}`])
      await pushDelete('note_images', userId, recordId, { note_id: '', name: '', sort_order: 0, created_at: 0 })
      return
    }
    if (table === 'projects') {
      await pushDelete('projects', userId, recordId, { name: '', color: '' })
      return
    }
    if (table === 'notes') {
      await pushDelete('notes', userId, recordId, { project_id: '', title: '', content: {}, body_text: '' })
      return
    }
    await pushDelete('events', userId, recordId, { title: '', start_at: 0, end_at: 0, all_day: false, source_name: '' })
    return
  }

  if (table === 'projects') {
    const p = await db.projects.get(recordId)
    if (!p) return
    await upsert('projects', {
      user_id: userId,
      id: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon ?? null,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      deleted_at: null,
    })
    return
  }

  if (table === 'notes') {
    const n = await db.notes.get(recordId)
    if (!n) return
    await upsert('notes', {
      user_id: userId,
      id: n.id,
      project_id: n.projectId,
      title: n.title,
      content: n.content,
      body_text: n.bodyText,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      deleted_at: null,
    })
    return
  }

  if (table === 'events') {
    const e = await db.events.get(recordId)
    if (!e) return
    await upsert('events', {
      user_id: userId,
      id: e.id,
      title: e.title,
      start_at: e.start,
      end_at: e.end,
      all_day: e.allDay,
      location: e.location ?? null,
      description: e.description ?? null,
      link: e.link ?? null,
      source_name: e.sourceName,
      note_id: e.noteId ?? null,
      created_at: e.updatedAt ?? e.start,
      updated_at: e.updatedAt ?? Date.now(),
      deleted_at: null,
    })
    return
  }

  const img = await db.images.get(recordId)
  if (!img) return
  const path = `${userId}/${img.id}`
  const { error: upErr } = await supabase!.storage.from(BUCKET).upload(path, img.blob, {
    upsert: true,
    contentType: img.blob.type || 'image/jpeg',
  })
  if (upErr) throw upErr
  await upsert('note_images', {
    user_id: userId,
    id: img.id,
    note_id: img.noteId,
    name: img.name,
    sort_order: img.order,
    created_at: img.createdAt,
    updated_at: img.updatedAt ?? img.createdAt,
    deleted_at: null,
  })
}

async function push(userId: string) {
  const { compacted, seqs } = await takeOutbox()
  if (!compacted.length) return
  for (const item of compacted) await pushOne(userId, item.table, item.op, item.recordId)
  await clearOutbox(seqs)
}

let running: Promise<void> | null = null

export async function runSync() {
  if (!supabase) return
  if (running) return running
  const userId = await uid()
  if (!userId) return
  running = (async () => {
    setStatus('syncing')
    try {
      await pull(userId)
      await push(userId)
      setStatus('ok')
    } catch {
      setStatus('error')
    } finally {
      running = null
    }
  })()
  return running
}

let loop: { stop: () => void } | null = null

export function startSyncLoop() {
  loop?.stop()
  let t: number | undefined
  const bump = () => {
    window.clearTimeout(t)
    t = window.setTimeout(() => void runSync(), 400)
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') void runSync()
  }
  window.addEventListener('vanotes:outbox', bump)
  window.addEventListener('online', bump)
  document.addEventListener('visibilitychange', onVis)
  const tick = window.setInterval(() => void runSync(), 30_000)
  loop = {
    stop: () => {
      window.clearTimeout(t)
      window.clearInterval(tick)
      window.removeEventListener('vanotes:outbox', bump)
      window.removeEventListener('online', bump)
      document.removeEventListener('visibilitychange', onVis)
    },
  }
  bump()
}

export function stopSyncLoop() {
  loop?.stop()
  loop = null
}
