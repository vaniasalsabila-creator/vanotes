import { cx } from '../lib/utils'

/** The vanotes mark (a "v" with a leaf). Logo only — no wordmark. */
export default function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icon-192.png"
      alt="vanotes"
      width={size}
      height={size}
      draggable={false}
      className={cx('select-none', className)}
      style={{ width: size, height: size }}
    />
  )
}
