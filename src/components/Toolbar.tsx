import { useEffect, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { BoldIcon, CheckSquareIcon, DividerIcon, ItalicIcon, LinkIcon, ListIcon, UnderlineIcon, XIcon } from './Icons'
import { cx } from '../lib/utils'

function Btn({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep focus (and the selection) in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
        active ? 'bg-ink text-paper' : 'hover:bg-pill',
      )}
    >
      {children}
    </button>
  )
}

const withScheme = (u: string) => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`)

export default function Toolbar({ editor, linkRequest }: { editor: Editor; linkRequest: number }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      task: e.isActive('taskList'),
    }),
  })
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const openLink = () => {
    setUrl(editor.getAttributes('link').href ?? '')
    setLinking(true)
  }
  const apply = () => {
    const href = url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!href) chain.unsetLink().run()
    else chain.setLink({ href: withScheme(href) }).run()
    setLinking(false)
  }

  // ⌘K from inside the editor.
  useEffect(() => {
    if (linkRequest) openLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkRequest])
  useEffect(() => {
    if (linking) input.current?.focus()
  }, [linking])

  if (linking)
    return (
      <div className="flex w-[min(30rem,calc(100vw-2rem))] items-center gap-2 p-1 pl-3">
        <LinkIcon />
        <input
          ref={input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            if (e.key === 'Escape') {
              setLinking(false)
              editor.commands.focus()
            }
          }}
          placeholder="paste a link, press enter"
          className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
        />
        {s.link && (
          <button
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              setLinking(false)
            }}
            className="rounded-lg px-3 py-1.5 text-xs text-accent hover:bg-pill"
          >
            remove
          </button>
        )}
        <button
          onClick={() => {
            setLinking(false)
            editor.commands.focus()
          }}
          aria-label="Cancel"
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-pill"
        >
          <XIcon />
        </button>
      </div>
    )

  return (
    <div className="scroll-hide flex items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label="Formatting">
      <Btn label="Bold (⌘B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon />
      </Btn>
      <Btn label="Italic (⌘I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon />
      </Btn>
      <Btn label="Underline (⌘U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </Btn>
      <Btn label="Link (⌘K)" active={s.link} onClick={openLink}>
        <LinkIcon />
      </Btn>
      <span className="mx-1 h-5 w-px bg-line" />
      <Btn label="Bullet list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListIcon />
      </Btn>
      <Btn label="Divider (or type ---)" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <DividerIcon />
      </Btn>
      <Btn label="Checklist — becomes a task" active={s.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquareIcon />
        <span className="sr-only">Checklist</span>
      </Btn>
    </div>
  )
}
