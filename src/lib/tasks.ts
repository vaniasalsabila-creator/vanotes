import type { JSONContent } from '@tiptap/react'
import { db, type Task } from './db'

export interface ExtractedTask {
  id: string
  text: string
  done: boolean
  /** Stored on the checklist item itself, so every browser derives the same timestamps */
  createdAt?: number
  doneAt?: number
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
      out.push({
        id: n.attrs.taskId,
        text: own.trim(),
        done: !!n.attrs.checked,
        createdAt: typeof n.attrs.createdAt === 'number' ? n.attrs.createdAt : undefined,
        doneAt: typeof n.attrs.doneAt === 'number' ? n.attrs.doneAt : undefined,
      })
    }
    ;(n.content ?? []).forEach(walk)
  }
  walk(doc)
  return out
}

/**
 * Rebuilds this note's rows in the tasks table from its content. Call inside a transaction.
 *
 * Tasks are a pure function of the note, so they come out identical in every browser: timestamps come from the
 * checklist item itself (or, for older items, from the note) — never from "when this browser first saw it".
 */
export async function syncTasks(noteId: string, projectId: string, doc: JSONContent) {
  const found = extractTasks(doc).filter((t) => t.text.length > 0)
  const note = await db.notes.get(noteId)
  const existing = new Set((await db.tasks.where('noteId').equals(noteId).primaryKeys()) as string[])

  const next: Task[] = found.map((t, order) => ({
    id: t.id,
    noteId,
    projectId,
    text: t.text,
    done: t.done,
    order,
    createdAt: t.createdAt ?? note?.createdAt ?? 0,
    doneAt: t.done ? (t.doneAt ?? note?.updatedAt ?? 0) : undefined,
  }))

  const keep = new Set(next.map((t) => t.id))
  const stale = [...existing].filter((id) => !keep.has(id))
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
      if (n.type === 'taskItem' && n.attrs?.taskId === taskId) n.attrs = { ...n.attrs, checked: done, doneAt: done ? Date.now() : null }
      ;(n.content ?? []).forEach(walk)
    }
    walk(doc)
    await db.notes.update(note.id, { content: doc, updatedAt: Date.now() })
    await syncTasks(note.id, note.projectId, doc)
  })
  // Lets the note this task lives in acknowledge the change (a brief ring in the timeline).
  if (noteId) window.dispatchEvent(new CustomEvent('vanotes:flash', { detail: { noteId } }))
}
