import Dexie, { type Table } from 'dexie'
import type { JSONContent } from '@tiptap/react'

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
  blob: Blob
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

/** Derived index of checklist items found in `Note.content`. Never edited directly. */
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

export interface OutboxItem {
  seq?: number
  table: CloudTable
  op: 'upsert' | 'delete'
  recordId: string
}

class VaNotesDB extends Dexie {
  projects!: Table<Project, string>
  notes!: Table<Note, string>
  images!: Table<NoteImage, string>
  tasks!: Table<Task, string>
  events!: Table<CalEvent, string>
  outbox!: Table<OutboxItem, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      notes: 'id, projectId, createdAt',
      images: 'id, noteId',
      tasks: 'id, noteId, projectId, done',
    })
    this.version(2).stores({
      events: 'id, start, sourceName',
    })
    this.version(3).stores({
      outbox: '++seq',
    })
    wireCloudHooks(this)
  }
}

const CLOUD: CloudTable[] = ['projects', 'notes', 'images', 'events']

let remoteDepth = 0
export const isApplyingRemote = () => remoteDepth > 0
export async function applyingRemote<T>(fn: () => Promise<T>): Promise<T> {
  remoteDepth++
  try {
    return await fn()
  } finally {
    remoteDepth--
  }
}

function enqueue(table: CloudTable, op: 'upsert' | 'delete', recordId: string) {
  if (isApplyingRemote()) return
  void instance.outbox.add({ table, op, recordId }).then(() => {
    window.dispatchEvent(new Event('vanotes:outbox'))
  })
}

function wireCloudHooks(d: VaNotesDB) {
  for (const table of CLOUD) {
    const t = d[table]
    t.hook('creating', function (_pk, obj) {
      const skip = isApplyingRemote()
      const row = obj as { id: string; updatedAt?: number }
      if (typeof row.updatedAt !== 'number') row.updatedAt = Date.now()
      this.onsuccess = () => {
        if (!skip) enqueue(table, 'upsert', row.id)
      }
    })
    t.hook('updating', function (mods, pk, obj) {
      const skip = isApplyingRemote()
      this.onsuccess = () => {
        if (!skip) enqueue(table, 'upsert', String(pk ?? (obj as { id: string }).id))
      }
      if (skip || 'updatedAt' in mods) return
      return { updatedAt: Date.now() }
    })
    t.hook('deleting', function (pk) {
      const skip = isApplyingRemote()
      this.onsuccess = () => {
        if (!skip) enqueue(table, 'delete', String(pk))
      }
    })
  }
}

let instance = new VaNotesDB('vanotes-guest')

/** Always the current user's IndexedDB. Swaps on sign-in so two accounts never share a browser store. */
export const db: VaNotesDB = new Proxy({} as VaNotesDB, {
  get(_t, prop) {
    const value = Reflect.get(instance, prop, instance) as unknown
    return typeof value === 'function' ? (value as (...a: never[]) => unknown).bind(instance) : value
  },
})

const LEGACY_FLAG = 'vanotes:legacy-migrated'

async function copyLegacyIfNeeded(userDb: VaNotesDB) {
  try {
    if (localStorage.getItem(LEGACY_FLAG)) return
  } catch {
    return
  }
  const [notes, projects] = await Promise.all([userDb.notes.count(), userDb.projects.count()])
  if (notes || projects) {
    try {
      localStorage.setItem(LEGACY_FLAG, '1')
    } catch {
      /* ignore */
    }
    return
  }

  const legacy = new VaNotesDB('vanotes')
  try {
    await legacy.open()
    const [lp, ln, li, lt, le] = await Promise.all([
      legacy.projects.toArray(),
      legacy.notes.toArray(),
      legacy.images.toArray(),
      legacy.tasks.toArray(),
      legacy.events.toArray(),
    ])
    if (!lp.length && !ln.length && !le.length) return
    await applyingRemote(async () => {
      await userDb.transaction('rw', userDb.projects, userDb.notes, userDb.images, userDb.tasks, userDb.events, async () => {
        if (lp.length) await userDb.projects.bulkPut(lp)
        if (ln.length) await userDb.notes.bulkPut(ln)
        if (li.length) await userDb.images.bulkPut(li)
        if (lt.length) await userDb.tasks.bulkPut(lt)
        if (le.length) await userDb.events.bulkPut(le)
      })
    })
    const jobs: OutboxItem[] = [
      ...lp.map((r) => ({ table: 'projects' as const, op: 'upsert' as const, recordId: r.id })),
      ...ln.map((r) => ({ table: 'notes' as const, op: 'upsert' as const, recordId: r.id })),
      ...li.map((r) => ({ table: 'images' as const, op: 'upsert' as const, recordId: r.id })),
      ...le.map((r) => ({ table: 'events' as const, op: 'upsert' as const, recordId: r.id })),
    ]
    if (jobs.length) await userDb.outbox.bulkAdd(jobs)
    try {
      localStorage.setItem(LEGACY_FLAG, '1')
    } catch {
      /* ignore */
    }
  } finally {
    legacy.close()
  }
}

let openGen = 0
let opening: Promise<void> | null = null

export async function openUserDb(userId: string) {
  const name = `vanotes-${userId}`
  if (instance.name === name && instance.isOpen()) return
  if (opening) return opening
  opening = (async () => {
    const gen = ++openGen
    const next = new VaNotesDB(name)
    await next.open()
    if (gen !== openGen) {
      next.close()
      return
    }
    const prev = instance
    instance = next
    prev.close()
    await copyLegacyIfNeeded(next)
  })().finally(() => {
    opening = null
  })
  return opening
}

export async function takeOutbox() {
  const rows = await instance.outbox.orderBy('seq').toArray()
  const last = new Map<string, OutboxItem>()
  for (const row of rows) last.set(`${row.table}:${row.recordId}`, row)
  return { compacted: [...last.values()], seqs: rows.map((r) => r.seq!).filter((n) => Number.isFinite(n)) }
}

export async function clearOutbox(seqs: number[]) {
  if (seqs.length) await instance.outbox.bulkDelete(seqs)
}

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
  const existing = await db.images.where('noteId').equals(noteId).count()
  const now = Date.now()
  await db.images.bulkAdd(
    files
      .filter((f) => f.type.startsWith('image/'))
      .map((f, i) => ({
        id: uid(),
        noteId,
        blob: f,
        name: f.name || 'pasted image',
        order: existing + i,
        createdAt: now,
      })),
  )
}

export const deleteImage = (id: string) => db.images.delete(id)
