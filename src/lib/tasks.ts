import type { JSONContent } from '@tiptap/react'
import { db, type Task } from './db'

export interface ExtractedTask {
  id: string
  text: string
  done: boolean
}

const textOf = (n: JSONContent): string =>
  n.type === 'text' ? (n.text ?? '') : (n.content ?? []).map(textOf).join('')

/** Plain text of the whole doc, one block per line (for search). */
export function docToText(doc: JSONContent): string {
  const lines: string[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'paragraph' || n.type === 'heading') lines.push(textOf(n))
    else (n.content ?? []).forEach(walk)
  }
  walk(doc)
  return lines.join('\n').trim()
}

/** Finds every checklist item that has an id, in document order. */
export function extractTasks(doc: JSONContent): ExtractedTask[] {
  const out: ExtractedTask[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'taskItem' && n.attrs?.taskId) {
      // Only this item's own text — nested task items are tasks of their own.
      const own = (n.content ?? []).filter((c) => c.type !== 'taskList').map(textOf).join(' ')
      out.push({ id: n.attrs.taskId, text: own.trim(), done: !!n.attrs.checked })
    }
    ;(n.content ?? []).forEach(walk)
  }
  walk(doc)
  return out
}

/** Reconciles the tasks table with the checklist items in a note. Call inside a transaction. */
export async function syncTasks(noteId: string, projectId: string, doc: JSONContent) {
  const found = extractTasks(doc).filter((t) => t.text.length > 0)
  const existing = new Map((await db.tasks.where('noteId').equals(noteId).toArray()).map((t) => [t.id, t]))
  const now = Date.now()

  const next: Task[] = found.map((t, order) => {
    const prev = existing.get(t.id)
    return {
      id: t.id,
      noteId,
      projectId,
      text: t.text,
      done: t.done,
      order,
      createdAt: prev?.createdAt ?? now,
      doneAt: t.done ? (prev?.done ? prev.doneAt : now) : undefined,
    }
  })

  const keep = new Set(next.map((t) => t.id))
  const stale = [...existing.keys()].filter((id) => !keep.has(id))
  if (stale.length) await db.tasks.bulkDelete(stale)
  await db.tasks.bulkPut(next)
}

/** Flips a checklist item in its source note, then re-syncs. The note stays the source of truth. */
export async function setTaskDone(taskId: string, done: boolean) {
  let noteId: string | undefined
  await db.transaction('rw', db.notes, db.tasks, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    noteId = task.noteId
    const note = await db.notes.get(task.noteId)
    if (!note) return
    const doc = structuredClone(note.content)
    const walk = (n: JSONContent) => {
      if (n.type === 'taskItem' && n.attrs?.taskId === taskId) n.attrs = { ...n.attrs, checked: done }
      ;(n.content ?? []).forEach(walk)
    }
    walk(doc)
    await db.notes.update(note.id, { content: doc, updatedAt: Date.now() })
    await syncTasks(note.id, note.projectId, doc)
  })
  // Lets the note this task lives in acknowledge the change (a brief ring in the timeline).
  if (noteId) window.dispatchEvent(new CustomEvent('vanotes:flash', { detail: { noteId } }))
}
