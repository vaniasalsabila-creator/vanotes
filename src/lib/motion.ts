/** Small helpers for the few animations that need JS (flights between elements, exits). */

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** The visible sidebar entry for a project, if the sidebar is on screen. */
export function navEl(projectId: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-nav-project="${projectId}"]`)
  return [...all].find((e) => e.offsetParent !== null) ?? null
}

/** Soft terracotta pulse on a project's sidebar row: "it landed here". */
export function pulseNav(projectId: string) {
  if (reduced()) return
  navEl(projectId)?.animate(
    [{ backgroundColor: 'rgba(181,101,74,0)' }, { backgroundColor: 'rgba(181,101,74,0.28)', offset: 0.3 }, { backgroundColor: 'rgba(181,101,74,0)' }],
    { duration: 1000, easing: 'ease-out' },
  )
}

/**
 * A paper slip that flies from the capture box to its destination in the sidebar, shrinking as it goes.
 * With no visible destination (mobile) it just lifts away.
 */
export function flySlip(from: DOMRect, text: string, to: DOMRect | null, projectId: string, onDone?: () => void) {
  if (reduced()) {
    pulseNav(projectId)
    return onDone?.()
  }
  const slip = document.createElement('div')
  Object.assign(slip.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${Math.min(from.height, 140)}px`,
    padding: '10px 18px 0 72px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '1px solid var(--color-line)',
    borderRadius: '16px',
    boxShadow: '0 18px 40px -18px rgba(43,38,34,0.55)',
    fontFamily: 'var(--font-mono)',
    fontSize: '15px',
    lineHeight: '28px',
    whiteSpace: 'pre-wrap',
    color: 'var(--color-ink)',
    pointerEvents: 'none',
    zIndex: '80',
    transformOrigin: 'center',
  } as Partial<CSSStyleDeclaration>)
  slip.textContent = text.split('\n').slice(0, 3).join('\n')
  document.body.appendChild(slip)

  const fx = from.left + from.width / 2
  const fy = from.top + Math.min(from.height, 140) / 2
  const tx = to ? to.left + 40 : fx
  const ty = to ? to.top + to.height / 2 : fy - 40
  const scale = to ? 0.07 : 0.9

  const anim = slip.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${(tx - fx) * 0.25}px, ${(ty - fy) * 0.25 - 14}px) scale(0.7) rotate(-2deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${tx - fx}px, ${ty - fy}px) scale(${scale}) rotate(-5deg)`, opacity: to ? 0.15 : 0 },
    ],
    { duration: to ? 640 : 320, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' },
  )
  anim.finished.then(
    () => {
      slip.remove()
      pulseNav(projectId)
      onDone?.()
    },
    () => slip.remove(),
  )
}

/** Fades a list item out, then collapses the gap it leaves, so neighbours glide up instead of jumping. */
export async function exitItem(el: HTMLElement | null, dir: 'out' | 'left' = 'out') {
  if (!el || reduced()) return
  const h = el.offsetHeight
  const mb = getComputedStyle(el).marginBottom
  el.style.overflow = 'hidden'
  await el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: dir === 'left' ? 'translateX(-28px) scale(0.97)' : 'scale(0.96)' }],
    { duration: 200, easing: 'ease-in', fill: 'forwards' },
  ).finished
  await el.animate(
    [{ height: `${h}px`, marginBottom: mb }, { height: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px' }],
    { duration: 220, easing: EASE_OUT, fill: 'forwards' },
  ).finished
}
