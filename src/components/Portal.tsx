import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders pop-ups at the top of the page instead of inside whatever list row opened them.
 * Inside a row, siblings (and dimmed/animated rows) can paint over the pop-up or fade it.
 * React context and events still flow through as normal.
 */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
