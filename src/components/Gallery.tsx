import { useEffect, useState } from 'react'
import type { NoteImage } from '../lib/db'
import { cx, useObjectUrl } from '../lib/utils'
import { XIcon } from './Icons'
import Portal from './Portal'

function Thumb({ img, className, onOpen, onRemove }: { img: NoteImage; className?: string; onOpen: () => void; onRemove?: () => void }) {
  const url = useObjectUrl(img.blob)
  // an image you just added "develops" in, like a polaroid
  const fresh = Date.now() - img.createdAt < 3000
  return (
    <div className={cx('group relative overflow-hidden rounded-xl bg-pill', fresh && 'develop', className)}>
      {url && (
        <button onClick={onOpen} className="block h-full w-full" aria-label={`Open ${img.name}`}>
          <img src={url} alt={img.name} className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease)] group-hover:scale-[1.03]" loading="lazy" />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove image"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-paper opacity-100 transition hover:bg-ink sm:opacity-0 sm:group-hover:opacity-100"
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

function Lightbox({ images, index, onClose }: { images: NoteImage[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  const url = useObjectUrl(images[i]?.blob)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, images.length - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [images.length, onClose])

  return (
    <Portal>
    <div
      className="anim-fade fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/85 p-4"
      onClick={(e) => {
        e.stopPropagation() // React events cross portals: don't let this click "open" the note card behind
        onClose()
      }}
    >
      <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-paper/15 text-paper" aria-label="Close">
        <XIcon />
      </button>
      {url && <img key={i} src={url} alt="" className="anim-pop max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />}
      {images.length > 1 && (
        <p className="mt-3 font-mono text-sm text-paper/80">
          {i + 1} / {images.length}
        </p>
      )}
    </div>
    </Portal>
  )
}

/** One image shows full width; several become a small mosaic. */
export default function Gallery({
  images,
  onRemove,
  max = 4,
  strip,
  children,
}: {
  images: NoteImage[]
  onRemove?: (id: string) => void
  max?: number
  /** Uniform square thumbnails; `children` render as the last tile. */
  strip?: boolean
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState<number>()
  if (!images.length && !children) return null

  const shown = images.slice(0, max)
  const extra = images.length - shown.length
  const layout =
    strip ? 'grid-cols-3 sm:grid-cols-4' : shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2'

  return (
    <>
      <div className={cx('grid gap-2', layout)}>
        {shown.map((img, idx) => (
          <div key={img.id} className="relative">
            <Thumb
              img={img}
              onOpen={() => setOpen(idx)}
              onRemove={onRemove && (() => onRemove(img.id))}
              className={!strip && shown.length === 1 ? 'aspect-[4/3] sm:aspect-[16/10]' : 'aspect-square'}
            />
            {extra > 0 && idx === shown.length - 1 && (
              <button
                onClick={() => setOpen(idx)}
                className="absolute inset-0 grid place-items-center rounded-xl bg-ink/55 font-mono text-xl text-paper"
              >
                +{extra}
              </button>
            )}
          </div>
        ))}
        {children}
      </div>
      {open !== undefined && <Lightbox images={images} index={open} onClose={() => setOpen(undefined)} />}
    </>
  )
}
