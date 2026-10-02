import type { JSONContent } from '@tiptap/react'
import { db, uid, type Note } from './db'
import { docToText, syncTasks } from './tasks'

/** Fixed id so the dump folder can be created lazily and always found again. */
export const DUMP_ID = 'dump'
export const DUMP_NAME = 'dump'
export const DUMP_COLOR = '#6b625a'

export async function ensureDump() {
  const existing = await db.projects.get(DUMP_ID)
  if (existing) {
    // keep older data in step with the current name (it used to be "Dump")
    if (existing.name !== DUMP_NAME) await db.projects.update(DUMP_ID, { name: DUMP_NAME })
    return
  }
  const now = Date.now()
  await db.projects.add({ id: DUMP_ID, name: DUMP_NAME, color: DUMP_COLOR, createdAt: now, updatedAt: now })
}

/** On startup: rename an existing dump folder without creating one that isn't there yet. */
export async function migrateDumpName() {
  const existing = await db.projects.get(DUMP_ID)
  if (existing && existing.name !== DUMP_NAME) await db.projects.update(DUMP_ID, { name: DUMP_NAME })
}

const URL_RE = /(https?:\/\/[^\s<>"]+)/g
const TASK_RE = /^\s*(?:[-*]\s*)?\[( |x|X)?\]\s+(.*)$/

const inline = (line: string): JSONContent[] =>
  line
    .split(URL_RE)
    .filter(Boolean)
    .map((part) =>
      /^https?:\/\//.test(part) ? { type: 'text', text: part, marks: [{ type: 'link', attrs: { href: part } }] } : { type: 'text', text: part },
    )

/** Plain text -> note doc. `[ ] thing` lines become checklist items; URLs become links. */
export function textToDoc(text: string): JSONContent {
  const content: JSONContent[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const m = line.match(TASK_RE)
    if (m && m[2].trim()) {
      const item: JSONContent = {
        type: 'taskItem',
        attrs: { checked: m[1]?.toLowerCase() === 'x', taskId: uid() },
        content: [{ type: 'paragraph', content: inline(m[2].trim()) }],
      }
      const last = content[content.length - 1]
      if (last?.type === 'taskList') last.content!.push(item)
      else content.push({ type: 'taskList', content: [item] })
    } else {
      content.push({ type: 'paragraph', content: inline(line.trim()) })
    }
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** One-step capture: no title, no organising. Goes to Dump unless a project is given. */
export async function quickCapture(text: string, projectId: string = DUMP_ID): Promise<Note> {
  if (projectId === DUMP_ID) await ensureDump()
  const doc = textToDoc(text)
  const now = Date.now()
  const note: Note = { id: uid(), projectId, title: '', content: doc, bodyText: docToText(doc), createdAt: now, updatedAt: now }
  await db.transaction('rw', db.notes, db.tasks, db.projects, async () => {
    await db.notes.add(note)
    await syncTasks(note.id, projectId, doc)
    await db.projects.update(projectId, { updatedAt: now })
  })
  return note
}

/** Moves a note, and the tasks that came from it, to another project. */
export async function moveNote(noteId: string, projectId: string) {
  await db.transaction('rw', db.notes, db.tasks, db.projects, async () => {
    await db.notes.update(noteId, { projectId })
    await db.tasks.where('noteId').equals(noteId).modify({ projectId })
    await db.projects.update(projectId, { updatedAt: Date.now() })
  })
}
