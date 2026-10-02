import { useEffect, useMemo } from 'react'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { buildExtensions } from '../lib/editor'
import { setTaskDone } from '../lib/tasks'

const LISTS = new Set(['taskList', 'bulletList', 'orderedList'])

/** Drops empty checklist items / paragraphs so a stray Enter doesn't leave blank rows in the timeline. */
function trim(n: JSONContent): JSONContent | null {
  if (n.type === 'text' || n.type === 'horizontalRule') return n // leaves have no children to clean
  if (n.type === 'paragraph') return (n.content ?? []).some((c) => c.type === 'text') ? n : null
  const content = (n.content ?? []).map(trim).filter((c): c is JSONContent => !!c)
  if (n.type === 'doc') return { ...n, content: content.length ? content : [{ type: 'paragraph' }] }
  if (n.type === 'taskItem' || n.type === 'listItem' || LISTS.has(n.type ?? '')) return content.length ? { ...n, content } : null
  return { ...n, content }
}

/** Read-only render of a note. Checkboxes still work and write back to the note. */
export default function NoteBody({ content: raw }: { content: JSONContent }) {
  const content = useMemo(() => trim(raw) ?? raw, [raw])
  const extensions = useMemo(
    () => buildExtensions({ editable: false, onReadOnlyChecked: (id, checked) => void setTaskDone(id, checked) }),
    [],
  )
  const editor = useEditor({ extensions, content, editable: false })

  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [editor, content])

  return <EditorContent editor={editor} className="note-body" />
}
