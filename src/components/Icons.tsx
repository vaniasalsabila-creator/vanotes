import type { ReactNode } from 'react'

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const icon = (path: ReactNode) => () => <svg {...base}>{path}</svg>

export const BackIcon = icon(<path d="M19 12H5m6-6-6 6 6 6" />)
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />)
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>,
)
export const CheckSquareIcon = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12.3 2.4 2.4 4.6-5" />
  </>,
)
export const BoldIcon = icon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" />)
export const ItalicIcon = icon(<path d="M10 5h8M6 19h8M14 5l-4 14" />)
export const UnderlineIcon = icon(<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />)
export const LinkIcon = icon(
  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
)
export const ListIcon = icon(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r=".6" />
    <circle cx="4.5" cy="12" r=".6" />
    <circle cx="4.5" cy="18" r=".6" />
  </>,
)
export const ImageIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 5-4.5 3.5 3L15 13.5l5 4.5" />
  </>,
)
export const TrashIcon = icon(
  <path d="M5 7h14M10 7V4.5h4V7m-7 0 .8 12h8.4L17 7M10.5 11v5m3-5v5" />,
)
export const DotsIcon = icon(
  <>
    <circle cx="5.5" cy="12" r=".9" />
    <circle cx="12" cy="12" r=".9" />
    <circle cx="18.5" cy="12" r=".9" />
  </>,
)
export const XIcon = icon(<path d="M6 6l12 12M18 6 6 18" />)
export const FeatherIcon = icon(
  <path d="M20 4c-6 0-11 3-13 9l-2 7 7-2c6-2 9-7 8-14zM9 15l7-7" />,
)
export const CalendarIcon = icon(
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>,
)
export const VideoIcon = icon(
  <>
    <rect x="3.5" y="6.5" width="12" height="11" rx="3" />
    <path d="m15.5 11 5-3v8l-5-3" />
  </>,
)
export const FolderIcon = icon(<path d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h3.2l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.3A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z" />)
export const ChevronIcon = icon(<path d="m7 10 5 5 5-5" />)
export const ArrowUpIcon = icon(<path d="M12 19V5m-6 6 6-6 6 6" />)
export const CornerIcon = icon(<path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3" />)

/** A check that draws itself — for "saved", "all clear" and similar moments. */
export function DrawCheck({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7" pathLength={1} className="draw" />
    </svg>
  )
}
