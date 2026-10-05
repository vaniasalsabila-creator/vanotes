import Dexie, { type Table, type Transaction } from 'dexie'
import type { JSONContent } from '@tiptap/react'

/*
 * This file is the app's *view* of the data. Supabase is the source of truth.
 *
 * What lives here is a short-lived, per-window mirror of the signed-in account's rows (it exists so the UI can
 * react instantly via useLiveQuery). It is rebuilt from Supabase every time a window starts, kept current by
 * realtime + reconciliation (see sync.ts), and deleted on sign-out. Every local write is written through to
 * Supabase; nothing here is ever treated as the authority.
 */

export interface Project {
  id: string
  name: string
  color: string
  /** `emoji:🔥` or `icon:rocket`. Unset = a letter chip in the project colour. */
  icon?: string
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  projectId: string
  title: string
  /** Tiptap JSON — the single source of truth for body text and checklist state */
  content: JSONContent
  /** Plain text copy of the body, for search */
  bodyText: string
  createdAt: number
  updatedAt: number
}

export interface NoteImage {
  id: string
  noteId: string
  /** Object path in the private `note-images` bucket: `<user id>/<image id>` */
  path: string
  /** Only present for an image added in this window that is still uploading; otherwise it's fetched by signed URL. */
  blob?: Blob
  name: string
  order: number
  createdAt: number
  updatedAt?: number
}

/** A calendar event imported from an .ics file. Notes started from it link back via `noteId`. */
export interface CalEvent {
  /** `${ics UID}|${start ms}` — stable across re-imports, so importing again never duplicates */
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location?: string
  description?: string
  /** Meet / Zoom / Teams join link, when one is found */
  link?: string
  /** Which calendar it came from (X-WR-CALNAME, or the file name) */
  sourceName: string
  noteId?: string
  updatedAt?: number
}

/** Derived from the checklist items in `Note.content` (so it's identical everywhere). Never edited directly. */
export interface Task {
  id: string
  noteId: string
  projectId: string
  text: string
  done: boolean
  order: number
  createdAt: number
  doneAt?: number
}

export type CloudTable = 'projects' | 'notes' | 'images' | 'events'
export const CLOUD_TABLES: CloudTable[] = ['projects', 'notes', 'images', 'events']

/** sync.ts plugs in here (db.ts can't import it — that would be circular). */
export const syncPort = {
  /** A local write to this row has started and isn't confirmed by the server yet. */
  mark: (_table: CloudTable, _id: string): void => {},
  /** That write was abandoned (the transaction aborted). */
  unmark: (_table: CloudTable, _id: string): void => {},
  /** The local write committed — send it to Supabase. */
  enqueue: (_table: CloudTable, _op: 'upsert' | 'delete', _id: string): void => {},
}

type RemoteTx = Transaction & { __remote?: boolean }
const isRemote = (tx?: Transaction) => !!(tx as RemoteTx | undefined)?.__remote

class CacheDB extends Dexie {
  projects!: Table<Project, string>
  notes!: Table<Note, string>
  images!: Table<NoteImage, string>
  tasks!: Table<Task, string>
  events!: Table<CalEvent, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      notes: 'id, projectId, createdAt',
      images: 'id, noteId',
      tasks: 'id, noteId, projectId, done',
      events: 'id, start, sourceName',
    })
    wireWriteThrough(this)
  }
}

/**
 * Every write the app makes locally is written through to Supabase. Writes applied *from* Supabase
 * run in a transaction flagged as remote and are skipped here. The flag lives on the transaction — not a global —
 * so a user's edit can never be mistaken for a server update while one is being applied.
 */
function wireWriteThrough(d: CacheDB) {
  const localWrite = (table: CloudTable, op: 'upsert' | 'delete', id: string, tx: Transaction) => {
    syncPort.mark(table, id)
    tx.on('complete', () => syncPort.enqueue(table, op, id))
    tx.on('abort', () => syncPort.unmark(table, id))
  }

  for (const table of CLOUD_TABLES) {
    const t = d[table] as unknown as Table<{ id: string; updatedAt?: number }, string>
    t.hook('creating', (_pk, obj, tx) => {
      if (isRemote(tx)) return
      if (typeof obj.updatedAt !== 'number') obj.updatedAt = Date.now()
      localWrite(table, 'upsert', obj.id, tx)
    })
    t.hook('updating', (mods, pk, _obj, tx) => {
      if (isRemote(tx)) return
      const changed = Object.keys(mods as object)
      if (!changed.length) return // nothing actually changed: don't touch the server
      localWrite(table, 'upsert', String(pk), tx)
      if (changed.includes('updatedAt')) return
      return { updatedAt: Date.now() }
    })
    t.hook('deleting', (pk, _obj, tx) => {
      if (isRemote(tx)) return
      localWrite(table, 'delete', String(pk), tx)
    })
  }
}

// ---- which window / which account this mirror belongs to ---------------------------------------------------------

/**
 * Each browser window gets its own private mirror (a fresh database per page load), so two windows can never
 * corrupt each other's view and "window A" and "window B" are genuinely independent clients of the same account.
 */
const WINDOW_ID = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
const CACHE_PREFIX = 'vn-cache-'
const cacheName = (userId: string) => `${CACHE_PREFIX}${userId}-${WINDOW_ID}`

// Held for as long as this page is open; lets a later window tell which mirrors are abandoned.
if (typeof navigator !== 'undefined' && navigator.locks) {
  void navigator.locks.request(`vn-window-${WINDOW_ID}`, () => new Promise<void>(() => {}))
}

let instance = new CacheDB('vn-no-session')
let activeUserId: string | null = null

export const getActiveUserId = () => activeUserId

/** Always the current window's mirror. Swapped on sign-in/out. */
export const db: CacheDB = new Proxy({} as CacheDB, {
  get(_t, prop) {
    const value = Reflect.get(instance, prop, instance) as unknown
    return typeof value === 'function' ? (value as (...a: never[]) => unknown).bind(instance) : value
  },
})

export type Cache = CacheDB
export const currentCache = () => instance

export async function openCache(userId: string) {
  const name = cacheName(userId)
  if (activeUserId === userId && instance.name === name && instance.isOpen()) return
  const next = new CacheDB(name)
  await next.open()
  const prev = instance
  instance = next
  activeUserId = userId
  prev.close()
}

/** Deletes this window's mirror (sign-out). */
export async function wipeCache() {
  const name = instance.name
  instance.close()
  instance = new CacheDB('vn-no-session')
  activeUserId = null
  try {
    await Dexie.delete(name)
  } catch {
    /* it will be cleaned up by the next window */
  }
}

/** Removes mirrors left behind by windows that were closed or reloaded. */
export async function cleanStaleCaches() {
  try {
    const names = (await Dexie.getDatabaseNames()).filter((n) => n.startsWith(CACHE_PREFIX))
    for (const n of names) {
      const owner = n.slice(n.lastIndexOf('-') + 1)
      if (owner === WINDOW_ID) continue
      if (!navigator.locks) continue // can't tell whether it's in use; leave it
      await navigator.locks.request(`vn-window-${owner}`, { ifAvailable: true }, async (lock) => {
        if (lock) await Dexie.delete(n)
      })
    }
  } catch {
    /* best effort */
  }
}

/** Runs `fn` as a change that came *from* Supabase: it is stored here but never written back. */
export function runAsRemote<T>(fn: () => Promise<T>): Promise<T> {
  const d = instance
  return d.transaction('rw', [d.projects, d.notes, d.images, d.tasks, d.events], async (tx) => {
    ;(tx as RemoteTx).__remote = true
    return fn()
  })
}

// ---- app-level helpers ---------------------------------------------------------------------------------------------

export const uid = () => crypto.randomUUID()

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export const PROJECT_COLORS = [
  '#c97b5a', // terracotta
  '#d4a24c', // ochre
  '#8a9a5b', // sage
  '#5f8a7a', // teal
  '#6f8fb0', // dusty blue
  '#8c7bb0', // lavender
  '#b9778f', // rose
  '#6b625a', // stone
]

export async function createProject(name: string, color: string, icon?: string) {
  const now = Date.now()
  const p: Project = { id: uid(), name: name.trim(), color, ...(icon && { icon }), createdAt: now, updatedAt: now }
  await db.projects.add(p)
  return p
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'icon'>>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.notes, db.images, db.tasks, async () => {
    const noteIds = await db.notes.where('projectId').equals(id).primaryKeys()
    await db.images.where('noteId').anyOf(noteIds).delete()
    await db.tasks.where('projectId').equals(id).delete()
    await db.notes.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

export async function createNote(projectId: string) {
  const now = Date.now()
  const n: Note = {
    id: uid(),
    projectId,
    title: '',
    content: EMPTY_DOC,
    bodyText: '',
    createdAt: now,
    updatedAt: now,
  }
  await db.notes.add(n)
  return n
}

export async function deleteNote(id: string) {
  await db.transaction('rw', db.notes, db.images, db.tasks, async () => {
    await db.images.where('noteId').equals(id).delete()
    await db.tasks.where('noteId').equals(id).delete()
    await db.notes.delete(id)
  })
}

export async function addImages(noteId: string, files: File[]) {
  const user = activeUserId
  if (!user) return
  const existing = await db.images.where('noteId').equals(noteId).count()
  const now = Date.now()
  await db.images.bulkAdd(
    files
      .filter((f) => f.type.startsWith('image/'))
      .map((f, i) => {
        const id = uid()
        return {
          id,
          noteId,
          path: `${user}/${id}`,
          blob: f,
          name: f.name || 'pasted image',
          order: existing + i,
          createdAt: now,
          updatedAt: now,
        }
      }),
  )
}

export const deleteImage = (id: string) => db.images.delete(id)
