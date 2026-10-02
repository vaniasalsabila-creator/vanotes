import { useEffect, useRef, useState } from 'react'

/**
 * Optimistic tick: the box ticks and the strikethrough sweeps right away, and the real change
 * (which moves the row to "done") lands a beat later so the animation is actually seen.
 */
export function useTickDelay(done: boolean, commit: (v: boolean) => void, delay = 420) {
  const [pending, setPending] = useState<boolean | null>(null)
  const timer = useRef<number>(undefined)
  useEffect(() => {
    setPending(null)
  }, [done])
  return {
    checked: pending ?? done,
    onChange(v: boolean) {
      setPending(v)
      window.clearTimeout(timer.current)
      if (v) timer.current = window.setTimeout(() => commit(v), delay)
      else commit(v)
    },
  }
}
