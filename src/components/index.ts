/**
 * SalesTrack primitives.
 *
 * Screens should import from here and nowhere deeper:
 *   import { Card, StatTile, ProgressBar } from '@/components'
 *
 * If a screen needs something this barrel does not export, ask the Design
 * System owner for it rather than hand-rolling a bordered <div>. The whole
 * point of these primitives is that Home, Sales, Insights and Settings look
 * like one product.
 */

export { Card, default as CardDefault } from './Card'
export type { CardProps, CardPadding, CardTone } from './Card'

export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { ProgressBar } from './ProgressBar'
export type { ProgressBarProps, ProgressTone, ProgressSize } from './ProgressBar'

export { StatTile, StatGrid } from './StatTile'
export type { StatTileProps, StatGridProps, StatSize, StatTone } from './StatTile'

export { Chip, ChipRow } from './Chip'
export type { ChipProps, ChipRowProps } from './Chip'

export {
  Sheet,
  useFocusTrap,
  getFocusable,
  lockBodyScroll,
  unlockBodyScroll,
} from './Sheet'
export type { SheetProps } from './Sheet'

export { ToastProvider, useToast } from './Toast'
export type { ToastApi, ToastOptions, ToastAction, ToastTone } from './Toast'

export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps, SegmentOption } from './SegmentedControl'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export {
  NumericKeypad,
  KeypadDisplay,
  appendDigit,
  removeDigit,
  MAX_AMOUNT_CENTS,
} from './NumericKeypad'
export type { NumericKeypadProps, KeypadDisplayProps } from './NumericKeypad'

export { ConfirmDialog } from './ConfirmDialog'
export type { ConfirmDialogProps } from './ConfirmDialog'

export { Celebration, useOneShot } from './Celebration'
export type { CelebrationProps, CelebrationReason } from './Celebration'

export { Skeleton, SkeletonText } from './Skeleton'
export type { SkeletonProps } from './Skeleton'

export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'

export { BrandMark } from './BrandMark'
export type { BrandMarkProps } from './BrandMark'

export { ArcGauge } from './ArcGauge'
export type { ArcGaugeProps, ArcGaugeTone } from './ArcGauge'
export { arcGaugeGeometry } from './arcGeometry'
export type { ArcGeometry } from './arcGeometry'

export { MiniBars } from './MiniBars'
export type { MiniBarsProps } from './MiniBars'
