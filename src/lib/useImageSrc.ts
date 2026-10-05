import { useEffect, useState } from 'react'
import type { NoteImage } from './db'
import { signedImageUrl } from './sync'
import { useObjectUrl } from './utils'

/**
 * Where to load an image from. A picture you just added is shown straight from memory while it uploads;
 * everything else comes from the private bucket via a short-lived signed link.
 */
export function useImageSrc(img: NoteImage): string | undefined {
  const local = useObjectUrl(img.blob)
  const [remote, setRemote] = useState<string>()
  const needsRemote = !img.blob

  useEffect(() => {
    if (!needsRemote) return
    let alive = true
    void signedImageUrl(img.path).then((u) => alive && setRemote(u))
    return () => {
      alive = false
    }
  }, [img.path, needsRemote])

  return needsRemote ? remote : local
}
