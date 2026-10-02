import Dexie, { type Table } from 'dexie'
import type { JSONContent } from '@tiptap/react'

export interface Project {
  id: string
  name: string
  color: string
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

class VaNotesDB extends Dexie {
  projects!: Table<Project, string>
  notes!: Table<Note, string>
  images!: Table<NoteImage, string>
  tasks!: Table<Task, string>
  events!: Table<CalEvent, string>

  constructor() {
    super('vanotes')
    this.version(1).stores({
      projects: 'id, updatedAt',
      notes: 'id, projectId, createdAt',
      images: 'id, noteId',
      tasks: 'id, noteId, projectId, done',
    })
    this.version(2).stores({
      events: 'id, start, sourceName',
    })
  }
}

export const db = new VaNotesDB()

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

export async function createProject(name: string, color: string) {
  const now = Date.now()
  const p: Project = { id: uid(), name: name.trim(), color, createdAt: now, updatedAt: now }
  await db.projects.add(p)
  return p
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color'>>) {
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
