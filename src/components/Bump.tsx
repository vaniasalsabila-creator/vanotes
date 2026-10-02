import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/utils'

/** A number that pops when it changes (but not on first render). */
export default function Bump({ value, className }: { value: number | string; className?: string }) {
  const prev = useRef(value)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setOn(true)
    const t = setTimeout(() => setOn(false), 520)
    return () => clearTimeout(t)
  }, [value])
  return <span className={cx(on && 'bump', className)}>{value}</span>
}
