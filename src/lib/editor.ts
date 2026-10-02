import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import type { Editor, Extensions } from '@tiptap/react'
import { uid } from './db'

/** TaskItem with a stable id so a checklist line and its row in the Tasks view are the same thing. */
const IdTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-id'),
        renderHTML: (attrs) => (attrs.taskId ? { 'data-task-id': attrs.taskId } : {}),
      },
    }
  },
})

export function buildExtensions(opts: {
  editable: boolean
  onReadOnlyChecked?: (taskId: string, checked: boolean) => void
}): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      link: {
        openOnClick: !opts.editable,
        autolink: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    TaskList,
    IdTaskItem.configure({
      nested: true,
      onReadOnlyChecked: (node, checked) => {
        if (!node.attrs.taskId) return false
        opts.onReadOnlyChecked?.(node.attrs.taskId, checked)
        return true
      },
    }),
    ...(opts.editable ? [Placeholder.configure({ placeholder: 'write something, or type [ ] to add a task…' })] : []),
  ]
}

/**
 * Gives every checklist item a unique id. Items created by typing or split with Enter arrive
 * with no id or a copy of their neighbour's, so we fix both here.
 */
export function ensureTaskIds(editor: Editor) {
  const seen = new Set<string>()
  const fixes: { pos: number; attrs: Record<string, unknown> }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem') return
    const id = node.attrs.taskId as string | null
    if (!id || seen.has(id)) fixes.push({ pos, attrs: { ...node.attrs, taskId: uid() } })
    else seen.add(id)
  })
  if (!fixes.length) return
  const tr = editor.state.tr
  fixes.forEach((f) => tr.setNodeMarkup(f.pos, undefined, f.attrs))
  tr.setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}
