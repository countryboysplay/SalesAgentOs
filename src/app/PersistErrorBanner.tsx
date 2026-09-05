import { useActions, useStoreStatus } from './store'
import './PersistErrorBanner.css'

/**
 * The one thing the agent must never miss: a write that did not land.
 *
 * Every action in this app updates memory first and persists after, so a
 * failed write is silently rolled back — the sale simply vanishes from the
 * list a moment after a toast said it was added. The store has always recorded
 * the failure and its plain-language cause; until this banner existed, nothing
 * rendered it, so quota exhaustion, an evicted database and a blocked private
 * window all looked like the app losing data at random.
 *
 * It is deliberately loud and deliberately not auto-dismissing. A toast is the
 * wrong instrument: this is the case where the agent's ledger and the screen
 * disagree, and they need to know before they record anything else.
 */
export function PersistErrorBanner() {
  const { persistError } = useStoreStatus()
  const { dismissPersistError } = useActions()

  if (persistError === null) return null

  return (
    <div className="persist-error" role="alert">
      <div className="persist-error__body">
        <p className="persist-error__title">That change was not saved on this device</p>
        <p className="persist-error__message">{persistError.message}</p>
        <p className="persist-error__hint">
          The app has put things back the way they were, so what you see is what is stored. Try
          again — and if it keeps happening, create a backup from Settings while you still can.
        </p>
      </div>
      <button type="button" className="persist-error__dismiss" onClick={dismissPersistError}>
        Dismiss
      </button>
    </div>
  )
}

export default PersistErrorBanner
