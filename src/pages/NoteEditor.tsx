import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { addImages, db, deleteImage, deleteNote, type Note } from '../lib/db'
import { buildExtensions, ensureTaskIds } from '../lib/editor'
import { docToText, syncTasks } from '../lib/tasks'
import { cx, shortDate, timeLabel } from '../lib/utils'
import Toolbar from '../components/Toolbar'
import MoveMenu from '../components/MoveMenu'
import Gallery from '../components/Gallery'
import { BackIcon, DrawCheck, ImageIcon, PlusIcon, TrashIcon } from '../components/Icons'

/** Saves to the account (the local write is written straight through to Supabase). `stamp` identifies this save. */
async function persist(note: Note, title: string, doc: JSONContent, stamp: number) {
  await db.transaction('rw', db.notes, db.tasks, async () => {
    // Read the project from the DB: the note may have been moved while it was open.
    const cur = await db.notes.get(note.id)
    if (!cur) return
    await db.notes.update(note.id, { title, content: doc, bodyText: docToText(doc), updatedAt: stamp })
    await syncTasks(note.id, cur.projectId, doc)
  })
}

// Notes currently open in an editor, so the "drop empty notes on leave" check can't race a StrictMode remount.
const open = new Map<string, number>()

function Editor({ note }: { note: Note }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [title, setTitle] = useState(note.title)
  const [status, setStatus] = useState<'saved' | 'saving'>('saved')
  const [dragging, setDragging] = useState(false)
  const [linkRequest, setLinkRequest] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const images = useLiveQuery(() => db.images.where('noteId').equals(note.id).sortBy('order'), [note.id])
  // wrapped so "still loading" (undefined) differs from "deleted" ({ note: null })
  const liveWrap = useLiveQuery(async () => ({ note: (await db.notes.get(note.id)) ?? null }), [note.id])
  const liveNote = liveWrap?.note ?? undefined
  const projectId = liveNote?.projectId ?? note.projectId
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])

  // --- autosave -----------------------------------------------------------
  const latest = useRef<{ title: string; doc: JSONContent }>({ title: note.title, doc: note.content })
  const dirty = useRef(false)
  const timer = useRef<number>(undefined)
  // Versions of this note that *this window* wrote, so a change from another window/device can be told apart.
  const ownStamps = useRef(new Set<number>([note.updatedAt]))
  const seenStamp = useRef(note.updatedAt)
  const deletedHere = useRef(false)

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    const stamp = Date.now()
    ownStamps.current.add(stamp)
    seenStamp.current = stamp
    await persist(note, latest.current.title, latest.current.doc, stamp)
    if (!dirty.current) setStatus('saved')
  }, [note])

  const schedule = useCallback(() => {
    dirty.current = true
    setStatus('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 500)
  }, [flush])

  const extensions = useMemo(() => buildExtensions({ editable: true }), [])
  const editor = useEditor({
    extensions,
    content: note.content,
    autofocus: params.get('new') ? false : 'end',
    onUpdate: ({ editor }) => {
      ensureTaskIds(editor)
      latest.current.doc = editor.getJSON()
      schedule()
    },
    editorProps: {
      attributes: { 'aria-label': 'Note body' },
      handleKeyDown: (_v, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          setLinkRequest((n) => n + 1)
          return true
        }
        return false
      },
    },
  })

  // Follow the account: if this note is edited or deleted in another window or on another device, show that here.
  useEffect(() => {
    if (!liveWrap) return
    const n = liveWrap.note
    if (!n) {
      if (!deletedHere.current) nav(`/p/${projectId}`, { replace: true }) // deleted elsewhere
      return
    }
    if (n.updatedAt === seenStamp.current || ownStamps.current.has(n.updatedAt)) {
      seenStamp.current = n.updatedAt
      return
    }
    if (dirty.current) return // unsaved typing here wins; the next save overwrites (last write wins)
    seenStamp.current = n.updatedAt
    setTitle(n.title)
    latest.current = { title: n.title, doc: n.content }
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(n.content)) {
      const { from, to } = editor.state.selection
      editor.commands.setContent(n.content, { emitUpdate: false })
      const max = editor.state.doc.content.size
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWrap, editor])

  // Flush on tab close / navigation, and drop notes that were never filled in.
  useEffect(() => {
    open.set(note.id, (open.get(note.id) ?? 0) + 1)
    const onHide = () => void flush()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      open.set(note.id, (open.get(note.id) ?? 1) - 1)
      void flush().then(() =>
        setTimeout(async () => {
          if (open.get(note.id)) return
          const [cur, imgs] = await Promise.all([db.notes.get(note.id), db.images.where('noteId').equals(note.id).count()])
          if (cur && !cur.title.trim() && !cur.bodyText && !imgs) await deleteNote(note.id)
        }, 50),
      )
    }
  }, [flush, note.id])

  // --- images: paste, drop, picker ---------------------------------------
  const addFiles = useCallback((files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (imgs.length) void addImages(note.id, imgs)
  }, [note.id])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const onDragEvent = (e: React.DragEvent, on: boolean) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    setDragging(on)
  }

  const remove = async () => {
    if (!confirm('Delete this note?')) return
    deletedHere.current = true
    await deleteNote(note.id)
    nav(`/p/${projectId}`, { replace: true })
  }

  return (
    <div
      className="min-h-screen pb-40"
      onDragOver={(e) => onDragEvent(e, true)}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        onDragEvent(e, false)
        addFiles([...e.dataTransfer.files])
      }}
    >
      <header className="anim-fade mx-auto flex max-w-2xl items-center justify-between px-5 pt-6 sm:pt-10">
        <button
          onClick={() => nav(`/p/${projectId}`)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-pill/70 pl-3 pr-4 text-sm hover:bg-pill"
        >
          <BackIcon />
          <span className="max-w-[45vw] truncate">{project?.name ?? 'back'}</span>
        </button>
        <div className="flex items-center gap-3">
          <span key={status} className="anim-fade inline-flex items-center gap-1.5 font-mono text-xs text-muted" aria-live="polite">
            {status === 'saving' ? <span className="live h-1.5 w-1.5 rounded-full bg-accent" /> : <DrawCheck size={14} />}
            {status}
          </span>
          <MoveMenu noteId={note.id} currentProjectId={projectId} className="h-10 bg-pill/70 px-3 text-sm text-ink" />
          <button onClick={remove} aria-label="Delete note" className="grid h-10 w-10 place-items-center rounded-xl bg-pill/70 hover:bg-pill hover:text-accent">
            <TrashIcon />
          </button>
        </div>
      </header>

      <main className="page-enter mx-auto mt-6 max-w-2xl px-5">
        <div className="rounded-3xl border border-line bg-card px-6 py-8 shadow-[0_20px_50px_-35px_rgba(43,38,34,0.5)] sm:px-10 sm:py-12">
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            {project && <span className="h-2 w-2 rounded-[3px]" style={{ background: project.color }} />}
            {shortDate(note.createdAt)} · {timeLabel(note.createdAt)}
          </p>
          <input
            ref={titleRef}
            autoFocus={!!params.get('new')}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              latest.current.title = e.target.value
              schedule()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                // Synchronous, so the first keystroke after Enter isn't lost (commands.focus is deferred).
                editor?.chain().setTextSelection(1).run()
                editor?.view.focus()
              }
            }}
            placeholder="Untitled note"
            aria-label="Title"
            className="mt-3 w-full bg-transparent font-display text-3xl leading-tight outline-none placeholder:text-muted/50 sm:text-4xl"
          />

          <div className="note-body mt-6 min-h-48" onClick={() => editor?.commands.focus()}>
            <EditorContent editor={editor} />
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.22em] text-muted">attachments</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          <Gallery images={images ?? []} max={Infinity} strip onRemove={(id) => void deleteImage(id)}>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-muted/60 text-xs text-muted transition hover:border-ink hover:text-ink"
            >
              {images?.length ? <PlusIcon /> : <ImageIcon />}
              <span>add image</span>
            </button>
          </Gallery>
          <p className="mt-2 text-xs text-muted">or drop / paste (⌘V) anywhere on the page</p>
        </section>
      </main>

      {/* formatting dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="pointer-events-auto max-w-full rounded-2xl border border-line bg-card/95 p-1.5 shadow-[0_14px_40px_-12px_rgba(43,38,34,0.45)] backdrop-blur">
          {editor && <Toolbar editor={editor} linkRequest={linkRequest} />}
        </div>
      </div>

      <div
        className={cx(
          'pointer-events-none fixed inset-0 z-40 grid place-items-center bg-paper/80 font-mono text-lg transition',
          dragging ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="rounded-3xl border-2 border-dashed border-ink px-10 py-8">drop to add to note</div>
      </div>
    </div>
  )
}

export default function NoteEditor() {
  const { noteId = '' } = useParams()
  // Loaded once: the editor owns the content from here on, so live updates mustn't reset it.
  const [state, setState] = useState<{ id: string; note: Note | null }>()

  useEffect(() => {
    let alive = true
    db.notes.get(noteId).then((n) => alive && setState({ id: noteId, note: n ?? null }))
    return () => {
      alive = false
    }
  }, [noteId])

  if (!state || state.id !== noteId) return null
  if (!state.note) return <Navigate to="/" replace />
  return <Editor key={state.note.id} note={state.note} />
}
