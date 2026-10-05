import Dexie, { type Table } from 'dexie'
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import {
  CLOUD_TABLES,
  cleanStaleCaches,
  currentCache,
  openCache,
  runAsRemote,
  syncPort,
  wipeCache,
  type CalEvent,
  type CloudTable,
  type Note,
  type NoteImage,
  type Project,
} from './db'
import { syncTasks } from './tasks'

/*
 * Supabase is the source of truth for a signed-in account.
 *
 *  - On start, the window downloads the account's rows (nothing from this browser is trusted).
 *  - Local edits are shown immediately and written through to Supabase, in order, with retries.
 *  - Other windows/devices are followed live over Supabase Realtime, and an exact reconcile
 *    (which compares what the server has with what this window shows) runs on a timer, on focus, and on reconnect.
 *  - On sign-out the window's mirror is deleted.
 */

const BUCKET = 'note-images'
const PAGE = 1000

const REMOTE: Record<CloudTable, string> = {
  projects: 'projects',
  notes: 'notes',
  images: 'note_images',
  events: 'events',
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type LocalRow = { id: string; updatedAt?: number; createdAt?: number }

const tbl = (t: CloudTable) => currentCache()[t] as unknown as Table<any, string> // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------------------------------------------------
// status (what the sidebar shows)
// ---------------------------------------------------------------------------------------------------------------------

export interface SyncInfo {
  state: 'ok' | 'saving' | 'offline' | 'error'
  pending: number
  message?: string
}

let info: SyncInfo = { state: 'ok', pending: 0 }
const subscribers = new Set<() => void>()
let lastProblem: string | undefined

function publish() {
  const pendingCount = queue.length
  const failing = (queue[0]?.attempts ?? 0) > 0
  const next: SyncInfo = !navigator.onLine
    ? { state: 'offline', pending: pendingCount }
    : failing || lastProblem
      ? { state: 'error', pending: pendingCount, message: lastProblem }
      : pendingCount > 0
        ? { state: 'saving', pending: pendingCount }
        : { state: 'ok', pending: 0 }
  if (next.state === info.state && next.pending === info.pending && next.message === info.message) return
  info = next
  subscribers.forEach((fn) => fn())
}

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    () => info,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// row <-> object mapping
// ---------------------------------------------------------------------------------------------------------------------

function toLocal(table: CloudTable, userId: string, r: Row): LocalRow {
  switch (table) {
    case 'projects':
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        ...(r.icon ? { icon: r.icon } : {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as Project
    case 'notes':
      return {
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        content: r.content,
        bodyText: r.body_text,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as Note
    case 'images':
      return {
        id: r.id,
        noteId: r.note_id,
        path: `${userId}/${r.id}`,
        name: r.name,
        order: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as NoteImage
    case 'events':
      return {
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
      } as CalEvent
  }
}

function toRemote(table: CloudTable, userId: string, o: Row): Row {
  switch (table) {
    case 'projects':
      return { user_id: userId, id: o.id, name: o.name, color: o.color, icon: o.icon ?? null, created_at: o.createdAt, updated_at: o.updatedAt, deleted_at: null }
    case 'notes':
      return {
        user_id: userId,
        id: o.id,
        project_id: o.projectId,
        title: o.title,
        content: o.content,
        body_text: o.bodyText,
        created_at: o.createdAt,
        updated_at: o.updatedAt,
        deleted_at: null,
      }
    case 'images':
      return {
        user_id: userId,
        id: o.id,
        note_id: o.noteId,
        name: o.name,
        sort_order: o.order,
        created_at: o.createdAt,
        updated_at: o.updatedAt ?? o.createdAt,
        deleted_at: null,
      }
    case 'events':
      return {
        user_id: userId,
        id: o.id,
        title: o.title,
        start_at: o.start,
        end_at: o.end,
        all_day: o.allDay,
        location: o.location ?? null,
        description: o.description ?? null,
        link: o.link ?? null,
        source_name: o.sourceName,
        note_id: o.noteId ?? null,
        created_at: o.updatedAt ?? o.start,
        updated_at: o.updatedAt ?? Date.now(),
        deleted_at: null,
      }
  }
}

const stampOf = (o: LocalRow) => o.updatedAt ?? o.createdAt ?? 0

// ---------------------------------------------------------------------------------------------------------------------
// unconfirmed local writes ("dirty") — a server update never overwrites one of these
// ---------------------------------------------------------------------------------------------------------------------

const dirty = new Map<string, number>()
const dkey = (t: CloudTable, id: string) => `${t}:${id}`
const isDirty = (t: CloudTable, id: string) => (dirty.get(dkey(t, id)) ?? 0) > 0

function mark(t: CloudTable, id: string) {
  dirty.set(dkey(t, id), (dirty.get(dkey(t, id)) ?? 0) + 1)
}
function unmark(t: CloudTable, id: string) {
  const n = (dirty.get(dkey(t, id)) ?? 0) - 1
  if (n <= 0) dirty.delete(dkey(t, id))
  else dirty.set(dkey(t, id), n)
}

// ---------------------------------------------------------------------------------------------------------------------
// write-through queue: ordered, retried, never persisted in the browser
// ---------------------------------------------------------------------------------------------------------------------

interface Op {
  key: string
  table: CloudTable
  kind: 'upsert' | 'delete'
  id: string
  attempts: number
}

const queue: Op[] = []
let pumping = false
let wake: (() => void) | null = null
const uploaded = new Set<string>()

const statusOf = (e: any): number => Number(e?.status ?? e?.statusCode ?? 0) || 0 // eslint-disable-line @typescript-eslint/no-explicit-any

function transient(e: unknown): boolean {
  const s = statusOf(e)
  const m = String((e as Error)?.message ?? '').toLowerCase()
  return s === 0 || s >= 500 || s === 408 || s === 429 || s === 401 || /fetch|network|timeout|jwt expired|load failed/.test(m)
}

async function must<T extends { error: unknown; status?: number }>(p: PromiseLike<T>): Promise<T> {
  const res = await p
  if (res.error) throw Object.assign(new Error((res.error as Error).message ?? 'request failed'), { status: res.status ?? statusOf(res.error), code: (res.error as Row).code })
  return res
}

syncPort.mark = mark
syncPort.unmark = unmark
syncPort.enqueue = (table, kind, id) => {
  if (!active) return unmark(table, id)
  const key = `${kind}:${table}:${id}`
  // an identical op is already waiting; it reads the latest data when it runs, so just fold into it
  if (queue.some((o, i) => o.key === key && !(i === 0 && pumping))) return unmark(table, id)
  queue.push({ key, table, kind, id, attempts: 0 })
  publish()
  void pump()
}

async function runOp(op: Op, userId: string) {
  const sb = supabase!
  const remote = REMOTE[op.table]

  if (op.kind === 'delete') {
    const now = Date.now()
    await must(sb.from(remote).update({ deleted_at: now, updated_at: now }).eq('user_id', userId).eq('id', op.id))
    if (op.table === 'images') await sb.storage.from(BUCKET).remove([`${userId}/${op.id}`]) // best effort
    return
  }

  const local = (await tbl(op.table).get(op.id)) as (LocalRow & Partial<NoteImage>) | undefined
  if (!local) return // deleted again before it was sent

  if (op.table === 'images' && local.blob && !uploaded.has(op.id)) {
    const { error } = await sb.storage.from(BUCKET).upload(`${userId}/${op.id}`, local.blob, {
      upsert: true,
      contentType: local.blob.type || 'image/jpeg',
    })
    if (error) throw Object.assign(new Error(error.message), { status: statusOf(error) })
    uploaded.add(op.id)
  }
  await must(sb.from(remote).upsert(toRemote(op.table, userId, local), { onConflict: 'user_id,id' }))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      wake = null
      resolve()
    }, ms)
    wake = () => {
      clearTimeout(t)
      wake = null
      resolve()
    }
  })
}

async function pump() {
  if (pumping) return
  pumping = true
  try {
    while (queue.length && active) {
      const op = queue[0]
      const userId = active.userId
      try {
        await runOp(op, userId)
        queue.shift()
        unmark(op.table, op.id)
        lastProblem = undefined
        publish()
      } catch (e) {
        if (transient(e)) {
          op.attempts++
          publish()
          await sleep(Math.min(30_000, 1000 * 2 ** Math.min(op.attempts - 1, 5)))
          continue // try the same op again; order is preserved
        }
        // The server refused it (e.g. a rule, or the row is invalid). Drop it, say so, and show the server's truth instead.
        queue.shift()
        unmark(op.table, op.id)
        lastProblem = `couldn’t save a change (${(e as Error).message})`
        console.error('[sync] write rejected', op, e)
        publish()
        void reconcile()
      }
    }
  } finally {
    pumping = false
    publish()
  }
}

/** Resolves when everything written locally has reached Supabase (or after `timeoutMs`). */
export async function flushPending(timeoutMs = 8000) {
  const t0 = Date.now()
  while ((queue.length || pumping) && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 60))
  return queue.length === 0
}

// ---------------------------------------------------------------------------------------------------------------------
// reading from Supabase
// ---------------------------------------------------------------------------------------------------------------------

async function fetchAll<T>(table: CloudTable, userId: string, columns: string, live: boolean): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase!.from(REMOTE[table]).select(columns).eq('user_id', userId)
    q = live ? q.is('deleted_at', null) : q.not('deleted_at', 'is', null)
    const { data, error, status } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw Object.assign(new Error(error.message), { status, code: (error as Row).code })
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function fetchByIds(table: CloudTable, userId: string, ids: string[]): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error, status } = await supabase!
      .from(REMOTE[table])
      .select('*')
      .eq('user_id', userId)
      .in('id', ids.slice(i, i + 80))
      .is('deleted_at', null)
    if (error) throw Object.assign(new Error(error.message), { status, code: (error as Row).code })
    out.push(...((data ?? []) as Row[]))
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// applying server data to this window's mirror
// ---------------------------------------------------------------------------------------------------------------------

type Change = { table: CloudTable; id: string; row?: LocalRow }

async function removeLocal(table: CloudTable, id: string) {
  const c = currentCache()
  if (table === 'projects') {
    const noteIds = (await c.notes.where('projectId').equals(id).primaryKeys()) as string[]
    await c.images.where('noteId').anyOf(noteIds).delete()
    await c.tasks.where('projectId').equals(id).delete()
    await c.notes.where('projectId').equals(id).delete()
    await c.projects.delete(id)
  } else if (table === 'notes') {
    await c.images.where('noteId').equals(id).delete()
    await c.tasks.where('noteId').equals(id).delete()
    await c.notes.delete(id)
  } else {
    await tbl(table).delete(id)
  }
}

async function putLocal(table: CloudTable, row: LocalRow) {
  const c = currentCache()
  if (table === 'notes') {
    const n = row as Note
    await c.notes.put(n)
    await syncTasks(n.id, n.projectId, n.content)
  } else if (table === 'images') {
    const prev = await c.images.get(row.id) // keep the in-memory blob of a freshly added image: no flicker
    await c.images.put(prev?.blob ? { ...(row as NoteImage), blob: prev.blob } : (row as NoteImage))
  } else {
    await tbl(table).put(row)
  }
}

/** Applies server-side changes in one transaction, leaving alone anything with an unconfirmed local edit. */
async function applyChanges(changes: Change[]) {
  if (!changes.length) return
  await runAsRemote(async () => {
    for (const ch of changes) {
      if (isDirty(ch.table, ch.id)) continue
      if (!ch.row) {
        await removeLocal(ch.table, ch.id)
        continue
      }
      const have = (await tbl(ch.table).get(ch.id)) as LocalRow | undefined
      if (have && stampOf(have) === stampOf(ch.row)) continue // already showing exactly this version
      await putLocal(ch.table, ch.row)
    }
  })
}

let reconciling = false
let lastReconcile = 0

/**
 * Makes this window show exactly what the server has: fetches whatever is new or different, and removes whatever
 * the server no longer has. Cheap: it compares (id, updated_at) first and only downloads what changed.
 */
export async function reconcile() {
  const a = active
  if (!a || reconciling || !supabase) return
  reconciling = true
  try {
    const changes: Change[] = []
    for (const table of CLOUD_TABLES) {
      const remote = await fetchAll<{ id: string; updated_at: number }>(table, a.userId, 'id,updated_at', true)
      const remoteStamp = new Map(remote.map((r) => [r.id, r.updated_at]))
      const local = (await tbl(table).toArray()) as LocalRow[]
      const localStamp = new Map(local.map((l) => [l.id, stampOf(l)]))

      for (const l of local) if (!remoteStamp.has(l.id)) changes.push({ table, id: l.id })
      const need = remote.filter((r) => localStamp.get(r.id) !== r.updated_at).map((r) => r.id)
      for (const r of await fetchByIds(table, a.userId, need)) changes.push({ table, id: r.id, row: toLocal(table, a.userId, r) })
    }
    if (active !== a) return
    await applyChanges(changes)
    lastProblem = undefined
    lastReconcile = Date.now()
  } catch (e) {
    if (!transient(e)) lastProblem = `couldn’t refresh from your account (${(e as Error).message})`
  } finally {
    reconciling = false
    publish()
  }
}

function onRealtime(table: CloudTable, userId: string, payload: { eventType: string; new: Row; old: Row }) {
  if (!active || active.userId !== userId) return
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id
    if (id) void applyChanges([{ table, id }])
    return
  }
  const r = payload.new
  if (!r || r.user_id !== userId) return
  void applyChanges([r.deleted_at ? { table, id: r.id } : { table, id: r.id, row: toLocal(table, userId, r) }])
}

// ---------------------------------------------------------------------------------------------------------------------
// image URLs
// ---------------------------------------------------------------------------------------------------------------------

const urls = new Map<string, { url: string; exp: number }>()
const inflight = new Map<string, Promise<string | undefined>>()

/** The bucket is private; images are shown through short-lived signed links. */
export function signedImageUrl(path: string): Promise<string | undefined> {
  const hit = urls.get(path)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url)
  const pending = inflight.get(path)
  if (pending) return pending
  const p = (async () => {
    const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (error || !data) return undefined
    urls.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 })
    return data.signedUrl
  })().finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

// ---------------------------------------------------------------------------------------------------------------------
// notes that only exist in this browser (from before accounts / from the earlier sync)
// ---------------------------------------------------------------------------------------------------------------------

interface OldDb {
  d: Dexie
  rows: Record<CloudTable, Row[]>
  outbox: { table: CloudTable; op: 'upsert' | 'delete'; recordId: string }[]
}

async function readOld(name: string): Promise<OldDb | null> {
  try {
    if (!(await Dexie.exists(name))) return null
    const d = new Dexie(name)
    await d.open()
    const get = async (t: string): Promise<Row[]> => (d.tables.some((x) => x.name === t) ? ((await d.table(t).toArray()) as Row[]) : [])
    return {
      d,
      rows: { projects: await get('projects'), notes: await get('notes'), images: await get('images'), events: await get('events') },
      outbox: (await get('outbox')) as OldDb['outbox'],
    }
  } catch {
    return null
  }
}

type Remote = { live: Map<string, number>; gone: Set<string> }
type RemoteIndex = Record<CloudTable, Remote>

async function writeLocalCopy(userId: string, table: CloudTable, row: Row) {
  const c = currentCache()
  const o = table === 'images' ? { ...row, path: row.path ?? `${userId}/${row.id}` } : row
  if (table === 'notes') {
    await c.transaction('rw', c.notes, c.tasks, async () => {
      await c.notes.put(o as Note)
      await syncTasks(o.id, o.projectId, o.content)
    })
  } else {
    await tbl(table).put(o)
  }
}

/**
 * Picks up changes an earlier version of the app only ever saved in this browser (its un-sent queue and anything the
 * server doesn't have), sends them to the account, and then deletes the browser's copy. Server data always wins otherwise.
 */
async function adoptEarlierLocalData(userId: string, remote: RemoteIndex) {
  const name = `vanotes-${userId}`
  const old = await readOld(name)
  if (!old) return
  try {
    for (const table of CLOUD_TABLES) {
      const pendingUp = new Set(old.outbox.filter((o) => o.table === table && o.op === 'upsert').map((o) => o.recordId))
      for (const row of old.rows[table]) {
        if (remote[table].gone.has(row.id)) continue // deleted elsewhere: the delete wins
        const theirs = remote[table].live.get(row.id)
        const missing = theirs === undefined
        const newerUnsent = !missing && pendingUp.has(row.id) && (row.updatedAt ?? 0) > theirs
        if (missing || newerUnsent) await writeLocalCopy(userId, table, row)
      }
      for (const o of old.outbox) {
        if (o.table === table && o.op === 'delete' && remote[table].live.has(o.recordId)) await tbl(table).delete(o.recordId)
      }
    }
    if (await flushPending(30_000)) {
      old.d.close()
      await Dexie.delete(name)
    }
  } finally {
    old.d.close()
  }
}

export interface LegacyInfo {
  counts: { projects: number; notes: number; images: number; events: number }
  importAll: () => Promise<boolean>
  discard: () => Promise<void>
}

/** The very first (account-less) version stored notes in one browser-wide database. Offer, never assume. */
async function detectLegacy(userId: string, remote: RemoteIndex): Promise<LegacyInfo | null> {
  const old = await readOld('vanotes')
  if (!old) return null
  const unsent: Record<CloudTable, Row[]> = { projects: [], notes: [], images: [], events: [] }
  for (const table of CLOUD_TABLES)
    unsent[table] = old.rows[table].filter((r) => !remote[table].live.has(r.id) && !remote[table].gone.has(r.id))
  old.d.close()

  const total = CLOUD_TABLES.reduce((n, t) => n + unsent[t].length, 0)
  if (!total) {
    await Dexie.delete('vanotes') // everything in it already lives in an account
    return null
  }
  return {
    counts: { projects: unsent.projects.length, notes: unsent.notes.length, images: unsent.images.length, events: unsent.events.length },
    async importAll() {
      for (const table of CLOUD_TABLES) for (const row of unsent[table]) await writeLocalCopy(userId, table, row)
      if (!(await flushPending(60_000))) return false
      await Dexie.delete('vanotes')
      return true
    },
    async discard() {
      await Dexie.delete('vanotes')
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------------------------------------------------

interface Active {
  userId: string
  ready: Promise<StartInfo>
  channel?: RealtimeChannel
  realtimeUp: boolean
  timer?: number
  cleanup: (() => void)[]
}

export interface StartInfo {
  legacy: LegacyInfo | null
}

let active: Active | null = null
let stopTimer: number | undefined

async function initialLoad(userId: string): Promise<RemoteIndex> {
  const index = {} as RemoteIndex
  const fetched = {} as Record<CloudTable, Row[]>
  for (const table of CLOUD_TABLES) {
    const [live, gone] = await Promise.all([fetchAll<Row>(table, userId, '*', true), fetchAll<{ id: string }>(table, userId, 'id', false)])
    fetched[table] = live
    index[table] = { live: new Map(live.map((r) => [r.id, r.updated_at])), gone: new Set(gone.map((g) => g.id)) }
  }
  await runAsRemote(async () => {
    for (const table of CLOUD_TABLES) {
      const keep = new Set(fetched[table].map((r) => r.id))
      for (const id of (await tbl(table).toCollection().primaryKeys()) as string[]) if (!keep.has(id)) await removeLocal(table, id)
      for (const r of fetched[table]) await putLocal(table, toLocal(table, userId, r))
    }
  })
  return index
}

function startLive(a: Active) {
  const sb = supabase!
  const channel = sb.channel(`vanotes:${a.userId}:${Math.random().toString(36).slice(2, 8)}`)
  for (const table of CLOUD_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: REMOTE[table], filter: `user_id=eq.${a.userId}` },
      (p) => onRealtime(table, a.userId, p as unknown as { eventType: string; new: Row; old: Row }),
    )
  }
  channel.subscribe((status) => {
    if (active !== a) return
    a.realtimeUp = status === 'SUBSCRIBED'
    if (status === 'SUBSCRIBED') void reconcile() // catch anything missed while (re)connecting
  })
  a.channel = channel

  // Safety net: realtime can drop (sleeping laptop, flaky wifi), so also reconcile now and then, and on focus/reconnect.
  const tick = () => {
    if (active !== a) return
    if (document.visibilityState === 'visible' && Date.now() - lastReconcile > 4000) void reconcile()
    a.timer = window.setTimeout(tick, a.realtimeUp ? 30_000 : 12_000)
  }
  a.timer = window.setTimeout(tick, 12_000)

  const onVisible = () => document.visibilityState === 'visible' && void reconcile()
  const onOnline = () => {
    wake?.()
    publish()
    void reconcile()
  }
  const onOffline = () => publish()
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (!queue.length) return
    e.preventDefault() // unsent changes: ask before closing the window
    e.returnValue = ''
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('beforeunload', beforeUnload)
  a.cleanup.push(() => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('beforeunload', beforeUnload)
  })
}

/** Opens this window's mirror and fills it from Supabase. Resolves once the account's data is on screen-ready. */
export function startSync(userId: string): Promise<StartInfo> {
  if (!supabase) return Promise.reject(new Error('Supabase is not configured'))
  if (active?.userId === userId) return active.ready
  void stopSyncNow(true)

  const a: Active = { userId, ready: undefined as unknown as Promise<StartInfo>, realtimeUp: false, cleanup: [] }
  active = a
  a.ready = (async () => {
    void cleanStaleCaches()
    await openCache(userId)
    const index = await initialLoad(userId)
    await adoptEarlierLocalData(userId, index)
    const legacy = await detectLegacy(userId, index)
    if (active !== a) throw new Error('cancelled')
    startLive(a)
    lastReconcile = Date.now()
    return { legacy }
  })()
  a.ready.catch(() => {
    if (active === a) {
      void stopSyncNow(false)
    }
  })
  return a.ready
}

/** Stops syncing; `wipe` also deletes this window's mirror (sign-out / account switch). */
export async function stopSyncNow(wipe: boolean) {
  const a = active
  active = null
  if (a) {
    window.clearTimeout(a.timer)
    a.cleanup.forEach((fn) => fn())
    if (a.channel) void supabase?.removeChannel(a.channel)
  }
  queue.length = 0
  dirty.clear()
  uploaded.clear()
  urls.clear()
  lastProblem = undefined
  wake?.()
  publish()
  if (wipe) await wipeCache()
}

/** Deferred so React's dev-mode double mount doesn't tear the session down and rebuild it. */
export function scheduleStop() {
  window.clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => void stopSyncNow(true), 150)
}
export function cancelStop() {
  window.clearTimeout(stopTimer)
}

/** A readable reason for a failed start (shown on the error screen). */
export function describeSyncError(e: unknown): { title: string; detail: string; setup?: boolean } {
  const err = e as Error & { status?: number; code?: string }
  const msg = String(err?.message ?? e)
  if (err?.code === 'PGRST205' || err?.code === '42P01' || /could not find the table|relation .* does not exist/i.test(msg))
    return {
      title: 'your database isn’t set up yet',
      detail: 'Open the Supabase SQL editor and run supabase/schema.sql once, then try again.',
      setup: true,
    }
  if (err?.status === 401 || /jwt|invalid api key/i.test(msg))
    return { title: 'your session needs refreshing', detail: 'Sign out and sign in again.' }
  if (transient(e)) return { title: 'can’t reach your notes', detail: 'Check your connection, then try again.' }
  return { title: 'couldn’t load your notes', detail: msg }
}
