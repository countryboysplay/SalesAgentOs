import './Skeleton.css'

export interface SkeletonProps {
  /** CSS width. Default '100%'. */
  width?: string | number
  /** CSS height. Default '1em' for text, set explicitly for blocks. */
  height?: string | number
  variant?: 'text' | 'block' | 'circle' | 'card'
  className?: string
}

/**
 * Skeleton — placeholder shape for the initial hydrate only.
 *
 * Spec §64 forbids artificial loading states for local reads. The only place
 * this legitimately appears is the very first paint before the store has
 * hydrated from IndexedDB, and even there LoadingScreen usually covers it.
 */
export function Skeleton({ width = '100%', height, variant = 'text', className }: SkeletonProps) {
  return (
    <span
      className={`skeleton skeleton--${variant}${className ? ` ${className}` : ''}`}
      style={{ width, height: height ?? (variant === 'text' ? '1em' : undefined) }}
      aria-hidden="true"
    />
  )
}

/** A few stacked text lines. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={`skeleton-stack${className ? ` ${className}` : ''}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  )
}

export default Skeleton
