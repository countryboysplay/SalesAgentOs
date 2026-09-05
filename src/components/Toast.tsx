import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './Toast.css'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error'

export interface ToastAction {
  /** Button label. For the §70 pattern this is literally "Undo". */
  label: string
  onClick: () => void
  /** Dismiss the toast after the action runs. Default true. */
  closeOnClick?: boolean
}

export interface ToastOptions {
  /** Headline line, e.g. "$389 added", "Sale cancelled". */
  message: string
  /** Optional second line, e.g. "Aeration · 2:07 PM". */
  detail?: string
  tone?: ToastTone
  /** Milliseconds. Default 4000; 7000 when an action is present so the
   *  Undo is genuinely reachable. Pass 0 to require manual dismissal. */
  duration?: number
  /** The Undo slot. */
  action?: ToastAction
  /**
   * Replaces any existing toast with the same key instead of stacking.
   * Use it for repeated events, e.g. key 'sale-added'.
   */
  key?: string
}

interface ToastRecord extends ToastOptions {
  id: string
  leaving?: boolean
}

export interface ToastApi {
  /** Show a toast. Returns its id so it can be dismissed early. */
  toast: (options: ToastOptions) => string
  /** Convenience: neutral confirmation. */
  success: (message: string, options?: Omit<ToastOptions, 'message' | 'tone'>) => string
  error: (message: string, options?: Omit<ToastOptions, 'message' | 'tone'>) => string
  /**
   * The §70 pattern in one call:
   *   undoable('Sale cancelled', () => uncancelSale(id))
   */
  undoable: (
    message: string,
    onUndo: () => void,
    options?: Omit<ToastOptions, 'message' | 'action'>,
  ) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const durations = useRef(new Map<string, number>())
  const counter = useRef(0)

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      // Let the exit animation finish. Reduced-motion collapses it to ~0ms,
      // but the removal timer is fine either way.
      const t = setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id))
        timers.current.delete(`${id}:remove`)
        durations.current.delete(id)
      }, 160)
      timers.current.set(`${id}:remove`, t)
    },
    [clearTimer],
  )

  const toast = useCallback(
    (options: ToastOptions): string => {
      counter.current += 1
      const id = `toast-${counter.current}`
      const duration = options.duration ?? (options.action ? 7000 : 4000)

      setToasts((prev) => {
        const next = options.key ? prev.filter((t) => t.key !== options.key) : prev
        return [...next, { ...options, id }].slice(-MAX_VISIBLE)
      })

      if (duration > 0) {
        durations.current.set(id, duration)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  /* WCAG 2.2.1 Timing Adjustable — hovering or focusing a toast halts its
     countdown; leaving it restarts the full duration. */
  const pause = useCallback(
    (id: string) => {
      if (durations.current.has(id)) clearTimer(id)
    },
    [clearTimer],
  )

  const resume = useCallback(
    (id: string) => {
      const duration = durations.current.get(id)
      if (!duration || timers.current.has(id)) return
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message, options) => toast({ ...options, message, tone: 'success' }),
      error: (message, options) => toast({ ...options, message, tone: 'error' }),
      undoable: (message, onUndo, options) =>
        toast({
          ...options,
          message,
          action: { label: 'Undo', onClick: onUndo },
        }),
      dismiss,
    }),
    [toast, dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: ToastRecord[]
  onDismiss: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
}) {
  if (typeof document === 'undefined') return null

  // Announcement is done by two PERMANENT regions rather than by putting
  // role="status" on each toast. A live region inserted into the DOM with its
  // text already present is unreliable in JAWS and NVDA; a region that is
  // already there and then receives text is not. It also guarantees exactly
  // one announcement per toast instead of one per element in the stack.
  const live = toasts.filter((t) => !t.leaving)
  const latest = live[live.length - 1]
  const politeText =
    latest && latest.tone !== 'error'
      ? [latest.message, latest.detail].filter(Boolean).join('. ')
      : ''
  const assertiveText =
    latest && latest.tone === 'error'
      ? [latest.message, latest.detail].filter(Boolean).join('. ')
      : ''

  return createPortal(
    <div className="toast-viewport" role="region" aria-label="Notifications">
      <span className="sr-only" role="status" aria-live="polite">
        {politeText}
      </span>
      <span className="sr-only" role="alert" aria-live="assertive">
        {assertiveText}
      </span>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.tone ?? 'neutral'}${t.leaving ? ' toast--leaving' : ''}`}
          // WCAG 2.2.1: the auto-dismiss countdown pauses while the toast is
          // hovered or holds focus, so the Undo action cannot expire out from
          // under someone reading or tabbing to it.
          onMouseEnter={() => onPause(t.id)}
          onMouseLeave={() => onResume(t.id)}
          onFocusCapture={() => onPause(t.id)}
          onBlurCapture={() => onResume(t.id)}
        >
          <span className="toast__rail" aria-hidden="true" />
          <div className="toast__body">
            <div className="toast__message">{t.message}</div>
            {t.detail && <div className="toast__detail">{t.detail}</div>}
          </div>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action?.onClick()
                if (t.action?.closeOnClick !== false) onDismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/**
 * useToast — the confirmation channel for every mutation.
 *
 * Spec §14: after Record Sale, show "$389 added" and nothing more.
 * Spec §70: after cancel or delete, show the message plus Undo.
 * Spec §62: never say Synced / Uploaded / Connected. Say Saved.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export default ToastProvider
