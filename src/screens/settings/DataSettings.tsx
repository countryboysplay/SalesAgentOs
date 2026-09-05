/**
 * Settings > Data (§38-44).
 *
 * In a product with no backend this is not a utility screen. It is the only
 * thing between the agent and total loss of their sales history, so every
 * flow here is written to fail safe:
 *
 *  - Restore never merges (§40). It shows the backup's own figures first, then
 *    states in plain numbers what is about to be replaced, and offers to back
 *    up this device before overwriting it.
 *  - Restore and Reset both rewrite the database underneath the store, so both
 *    are followed by `reload()`. Skipping that would leave the agent reading
 *    yesterday's numbers off a new database.
 *  - CSV is presented as an export, never as a backup, because a CSV cannot
 *    restore this app.
 *  - Reset shows real counts and requires the word DELETE.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  ConfirmDialog,
  SegmentedControl,
  Sheet,
  StatGrid,
  StatTile,
  useToast,
} from '@/components'
import { useActions, useCategories, useSales, useSettings } from '@/app/store'
import {
  downloadBackup,
  downloadSalesCsv,
  isBackupValidationError,
  isStorageError,
  loadAll,
  markBackupCreated,
  readBackupFile,
  requestPersistentStorage,
  resetAllData,
  restoreBackup,
  storageEstimate,
  summarizeBackup,
  type StorageEstimateResult,
} from '@/data'
import { toIso } from '@/core/date'
import { formatDate, formatNumber } from '@/core/format'
import type { BackupFile, BackupReminder, BackupSummary, Millis, Settings } from '@/core/types'
import { KeyValue, Note, SettingsPage } from './parts'

/* ------------------------------------------------------------------ types */

type RestoreState =
  | null
  | { kind: 'ready'; backup: BackupFile; summary: BackupSummary; filename: string }
  | { kind: 'error'; message: string; issues: string[] }

interface Problem {
  message: string
  issues: string[]
}

/** Every failure path in this file ends here, in a sentence a human can act on. */
function describeProblem(err: unknown, fallback: string): Problem {
  if (isBackupValidationError(err)) return { message: err.userMessage, issues: err.issues }
  if (isStorageError(err)) return { message: err.userMessage, issues: [] }
  return { message: fallback, issues: [] }
}

function daysSince(at: Millis | null): number | null {
  if (at === null) return null
  return Math.max(0, Math.floor((Date.now() - at) / 86_400_000))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** How overdue a backup is, given the agent's own reminder choice. */
function backupIsStale(days: number | null, reminder: BackupReminder): boolean {
  if (days === null) return true
  if (reminder === 'weekly') return days >= 7
  if (reminder === 'monthly') return days >= 30
  return days >= 30
}

/* ------------------------------------------------------------------ screen */

export default function DataSettings() {
  const settings = useSettings()
  const { sales, sortedSales } = useSales()
  const { categories } = useCategories()
  const { saveSettings, reload } = useActions()
  const { success, error: errorToast } = useToast()

  const fileInput = useRef<HTMLInputElement>(null)

  const [restore, setRestore] = useState<RestoreState>(null)
  const [working, setWorking] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [savedCheck, setSavedCheck] = useState<DownloadResultLike | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimateResult | null>(null)
  const [persistNote, setPersistNote] = useState<string | null>(null)

  // §42 figures come straight from memory — they are already hydrated, and a
  // local read must never show a spinner (§64).
  const saleCount = sales.length
  const dateRange = useMemo(() => {
    if (sortedSales.length === 0) return null
    const newest = sortedSales[0]
    const oldest = sortedSales[sortedSales.length - 1]
    if (!newest || !oldest) return null
    return { from: oldest.date, to: newest.date }
  }, [sortedSales])

  const sinceBackup = daysSince(settings.lastBackupAt)
  const stale = backupIsStale(sinceBackup, settings.backupReminder)
  const usageBytes = estimate && estimate.supported ? estimate.usageBytes : null

  const refreshEstimate = useCallback(() => {
    let cancelled = false
    void storageEstimate().then((result) => {
      if (!cancelled) setEstimate(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(refreshEstimate, [refreshEstimate])

  /* ---------------------------------------------------------- create backup */

  /**
   * Hand the file to the browser, then ask whether it actually saved.
   *
   * We cannot detect that ourselves — a cancelled save dialog and a successful
   * one look identical from here. Recording the backup date on our own would
   * mean telling the agent "Backed up today" over a file that never landed,
   * and quietly switching off the reminder that would have caught it. So the
   * date is only written once they confirm.
   */
  async function createBackupNow() {
    setWorking(true)
    try {
      const result = await downloadBackup()
      setSavedCheck(result)
    } catch (err) {
      errorToast(describeProblem(err, 'The backup could not be created on this device.').message, {
        key: 'backup',
      })
    } finally {
      setWorking(false)
    }
  }

  async function confirmBackupSaved(result: DownloadResultLike) {
    setSavedCheck(null)
    try {
      await markBackupCreated(result.createdAt)
      saveSettings({ lastBackupAt: result.createdAt })
      success('Backup created', {
        detail: `${result.filename} · ${formatNumber(result.saleCount, settings)} sales · ${formatBytes(result.bytes)}`,
        duration: 7000,
        key: 'backup',
      })
    } catch (err) {
      errorToast(describeProblem(err, 'The backup date could not be recorded on this device.').message, {
        key: 'backup',
      })
    }
  }

  /* -------------------------------------------------------------- reload */

  /**
   * Re-read the database into the store, and REPORT a failure instead of
   * swallowing it.
   *
   * `reload()` is the store's own `hydrate`: it catches its failure and
   * dispatches `hydrate-failed`, which drops the whole app to the error screen,
   * rather than rejecting. So `await reload()` resolves either way, and the
   * `catch` around it can never fire — which is how "Backup restored" came to
   * be announced at the same instant the app fell over.
   *
   * Reading the database back ourselves first is the honest test: it throws
   * exactly what hydrate would have hidden, before the store is asked to
   * hydrate from it. A failure therefore surfaces here — in the restore sheet
   * or the reset toast, where the user is standing — and the app is not pushed
   * into the error screen for a problem we could name.
   */
  async function reloadOrThrow() {
    await loadAll()
    await reload()
  }

  /* --------------------------------------------------------- restore backup */

  async function onFilePicked(file: File | undefined) {
    if (!file) return
    try {
      const backup = await readBackupFile(file)
      setRestore({ kind: 'ready', backup, summary: summarizeBackup(backup), filename: file.name })
    } catch (err) {
      const problem = describeProblem(
        err,
        "That file could not be read. Choose the .json file created by Create Backup.",
      )
      setRestore({ kind: 'error', ...problem })
    }
  }

  async function replaceEverything(backup: BackupFile) {
    setWorking(true)
    // Which side of the write the failure landed on decides what is true to say
    // afterwards: "nothing was changed" is a lie once the backup is on disk.
    let written = false
    try {
      const result = await restoreBackup(backup)
      written = true
      // The database was rewritten underneath the store (§40). Without this the
      // agent would be looking at the old numbers over the new database — and
      // nothing below this line may claim success until the reload has actually
      // come back.
      await reloadOrThrow()
      setRestore(null)
      success('Backup restored', {
        detail: `${formatNumber(result.salesRestored, settings)} sales are now on this device.`,
        duration: 7000,
        key: 'restore',
      })
    } catch (err) {
      setRestore({
        kind: 'error',
        ...describeProblem(
          err,
          written
            ? 'The backup was written to this device, but SalesTrack could not read it back afterwards. Close the app and open it again — the figures on screen may be the old ones.'
            : 'The restore could not be completed. Nothing on this device was changed.',
        ),
      })
    } finally {
      setWorking(false)
    }
  }

  /* ------------------------------------------------------------------- csv */

  function exportCsv() {
    try {
      const result = downloadSalesCsv(sales, categories, settings)
      success('Sales exported', {
        detail: `${result.filename} · ${formatNumber(result.rowCount, settings)} rows`,
        key: 'csv',
      })
    } catch (err) {
      errorToast(describeProblem(err, 'The export could not be created.').message, { key: 'csv' })
    }
  }

  /* ----------------------------------------------------------------- reset */

  async function deleteEverything() {
    setConfirmReset(false)
    setWorking(true)
    try {
      await resetAllData()
      // Same reason as restore: the store is holding a database that no longer
      // exists. Reloading also flips the app back to first-run setup — and if
      // the fresh database cannot be read, that is reported here rather than
      // celebrated on the way to the error screen.
      await reloadOrThrow()
      success('All local data deleted', {
        detail: 'This device is back to a fresh SalesTrack.',
        key: 'reset',
      })
    } catch (err) {
      errorToast(describeProblem(err, 'The data could not be deleted from this device.').message, {
        key: 'reset',
      })
    } finally {
      setWorking(false)
    }
  }

  /* ------------------------------------------------------------ durability */

  async function keepOnDevice() {
    const status = await requestPersistentStorage()
    refreshEstimate()
    if (status.persisted) {
      setPersistNote(null)
      success('This device will keep SalesTrack data', {
        detail: 'It is now exempt from routine storage cleanup.',
        key: 'persist',
      })
    } else {
      setPersistNote(
        status.reason ??
          'This browser would not commit to keeping the data. Backups remain the reliable protection.',
      )
    }
  }

  /* ------------------------------------------------------------------ view */

  return (
    <SettingsPage title="Data" subtitle="Backups, export and storage" storedLocally>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Clear first, so picking the same file twice still fires a change.
          e.target.value = ''
          void onFilePicked(file)
        }}
      />

      {/* §38 — the lead. The one accent card on this screen. */}
      <Card tone="accent" title="Protect Your Sales History">
        <p className="set-protect__lede">
          Your sales history exists only on this device. Create a backup periodically if you want
          to protect it from device loss, browser resets, or storage removal.
        </p>

        <div className="set-actions">
          <Button variant="primary" onClick={() => void createBackupNow()} disabled={working}>
            Create Backup
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={working}>
            Restore Backup
          </Button>
        </div>

        <p className="set-backup-state">
          <span className={`set-badge${stale ? ' set-badge--warning' : ' set-badge--positive'}`}>
            {settings.lastBackupAt === null
              ? 'No backup yet'
              : stale
                ? 'Backup is old'
                : 'Backed up'}
          </span>
          <span>{backupStateSentence(settings, sinceBackup, saleCount)}</span>
        </p>
      </Card>

      {/* §42 */}
      <Card title="Local Storage">
        <StatGrid columns={3}>
          <StatTile
            label="Sales Records"
            value={formatNumber(saleCount, settings)}
            size="sm"
            ariaLabel={`${formatNumber(saleCount, settings)} sales stored on this device`}
          />
          <StatTile
            label="Data Range"
            value={
              dateRange
                ? `${formatDate(dateRange.from, settings, 'short')} – ${formatDate(dateRange.to, settings, 'short')}`
                : '—'
            }
            size="sm"
            sub={dateRange ? undefined : 'No sales recorded yet'}
          />
          <StatTile
            label="Last Backup"
            value={
              settings.lastBackupAt === null
                ? 'Never'
                : formatDate(isoOf(settings.lastBackupAt), settings, 'medium')
            }
            size="sm"
            sub={
              sinceBackup === null
                ? 'Create one to protect this'
                : sinceBackup === 0
                  ? 'Today'
                  : `${formatNumber(sinceBackup, settings)} days ago`
            }
            subTone={stale ? 'warning' : 'default'}
            tone={stale ? 'warning' : 'default'}
          />
        </StatGrid>
        <Note quiet>
          Everything above is counted from the database on this device, right now.
        </Note>
      </Card>

      {/* §43 */}
      <Card title="Backup Reminder">
        <div className="shell-stack">
          <SegmentedControl<BackupReminder>
            label="Backup reminder"
            value={settings.backupReminder}
            onChange={(backupReminder) => saveSettings({ backupReminder })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
          <Note>
            {settings.backupReminder === 'off'
              ? 'SalesTrack will not prompt you. The Last Backup figure above is still kept up to date.'
              : `Settings flags an old backup once it has been more than a ${settings.backupReminder === 'weekly' ? 'week' : 'month'}, so you see it without going looking for it.`}
          </Note>
          <Note quiet>
            A reminder on this device only. Nothing is ever sent anywhere, and nothing leaves this
            device unless you save a backup or an export yourself.
          </Note>
        </div>
      </Card>

      {/* §41 */}
      <Card title="Export Sales CSV">
        <div className="shell-stack">
          <Note>
            A spreadsheet of every sale — date, time, amount, category, status, rate and estimated
            commission — for your own records, an accountant, or moving the numbers somewhere else.
          </Note>
          <Note quiet>
            Amount is the sale as you recorded it, so that column adds up to gross. Net Amount is
            what it actually counts for — nothing for a cancelled sale — so that column adds up to
            the net figure SalesTrack shows you.
          </Note>
          <Note>
            <strong>A CSV is not a backup.</strong> It cannot be restored into SalesTrack and it
            does not carry your goals, categories or settings. Use Create Backup for that.
          </Note>
          <div className="set-actions set-actions--hug">
            <Button variant="secondary" onClick={exportCsv} disabled={saleCount === 0}>
              Export Sales CSV
            </Button>
          </div>
          {saleCount === 0 && (
            <Note quiet>There are no sales to export yet.</Note>
          )}
        </div>
      </Card>

      {/* Storage durability */}
      <Card title="Keeping data on this device">
        <div className="shell-stack">
          <Note>
            Browsers can clear a website's stored data when a device runs low on space. Adding
            SalesTrack to your home screen makes that far less likely, and on iPhone and iPad it
            matters most: a site that has not been installed can have its storage cleared after a
            stretch of not being opened.
          </Note>
          <Note>
            Asking the browser to keep this data helps where it is supported. A backup file you
            have saved somewhere else is the protection that always works.
          </Note>

          <KeyValue
            label="Storage on this device"
            value={
              estimate === null || !estimate.supported
                ? 'Not reported by this browser'
                : estimate.persisted
                  ? 'Marked to keep'
                  : 'Standard (can be cleared)'
            }
          />
          {usageBytes !== null && (
            <KeyValue label="SalesTrack is using" value={formatBytes(usageBytes)} />
          )}

          {!estimate?.persisted && (
            <div className="set-actions set-actions--hug">
              <Button variant="secondary" onClick={() => void keepOnDevice()}>
                Ask to keep data on this device
              </Button>
            </div>
          )}
          {persistNote && <Note quiet>{persistNote}</Note>}
        </div>
      </Card>

      {/* §44 */}
      <Card title="Reset App">
        <div className="shell-stack">
          <Note>
            Deletes every sale, goal, category and setting from this device and starts SalesTrack
            over. There is no copy anywhere else, so this cannot be undone.
          </Note>
          <Note quiet>
            If you might want any of it back, create a backup first — the file keeps working after
            the reset.
          </Note>
          <div className="set-actions set-actions--hug">
            <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={working}>
              Delete All Local Data
            </Button>
          </div>
        </div>
      </Card>

      {/*
        The restore sheet steps aside while the "Did the backup save?" check is
        up. "Back up this device first" is a detour taken FROM this sheet, and
        rendering both left two aria-modal dialogs live at once — one of them
        dismissible, sitting under a blocking one, with Escape able to reach it
        and throw away the chosen file, its summary and the Replace button with
        no explanation. `restore` is deliberately left untouched, so answering
        the check puts the sheet back exactly as it was.
      */}
      <RestoreSheet
        state={savedCheck === null ? restore : null}
        settings={settings}
        currentSaleCount={saleCount}
        currentBackupIsStale={stale}
        working={working}
        onClose={() => setRestore(null)}
        onBackupFirst={() => void createBackupNow()}
        onReplace={(backup) => void replaceEverything(backup)}
        onChooseAnother={() => {
          setRestore(null)
          fileInput.current?.click()
        }}
      />

      <BackupSavedCheck
        result={savedCheck}
        settings={settings}
        onSaved={(r) => void confirmBackupSaved(r)}
        onNotSaved={() => {
          setSavedCheck(null)
          errorToast('No backup date was recorded, so the reminder will keep asking.', { key: 'backup' })
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        title="Delete all local data"
        body={`Delete ${formatNumber(saleCount, settings)} ${saleCount === 1 ? 'sale' : 'sales'} and all settings from this device? This cannot be undone, and there is no copy anywhere else.`}
        confirmLabel="Delete everything"
        requireTypedWord="DELETE"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void deleteEverything()}
      />
    </SettingsPage>
  )
}

/* -------------------------------------------------------------- restore UI */

interface RestoreSheetProps {
  state: RestoreState
  settings: Settings
  currentSaleCount: number
  /** Drives how loudly the "back up first" escape hatch is offered. */
  currentBackupIsStale: boolean
  working: boolean
  onClose: () => void
  onBackupFirst: () => void
  onReplace: (backup: BackupFile) => void
  onChooseAnother: () => void
}

/**
 * The §40 confirmation. Backup date, sales, date range — then the consequence
 * in the agent's own numbers, then the two options the spec allows. No merge.
 */
function RestoreSheet({
  state,
  settings,
  currentSaleCount,
  currentBackupIsStale,
  working,
  onClose,
  onBackupFirst,
  onReplace,
  onChooseAnother,
}: RestoreSheetProps) {
  if (state === null) return null

  if (state.kind === 'error') {
    return (
      <Sheet
        open
        onClose={onClose}
        title="That file could not be used"
        description="Nothing on this device has been changed."
        footer={
          <div className="set-actions">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={onChooseAnother}>
              Choose another file
            </Button>
          </div>
        }
      >
        <div className="set-sheet-stack">
          <p className="set-note">{state.message}</p>
          {state.issues.length > 0 && (
            <div>
              <p className="eyebrow">What was wrong</p>
              <ul className="set-issues">
                {state.issues.slice(0, 8).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              {state.issues.length > 8 && (
                <p className="set-note set-note--quiet">
                  …and {state.issues.length - 8} more problems in the same file.
                </p>
              )}
            </div>
          )}
          <p className="set-note set-note--quiet">
            A SalesTrack backup is the .json file created by Create Backup, named like
            SalesTrack-Backup-2026-09-04.json. A CSV export cannot be restored.
          </p>
        </div>
      </Sheet>
    )
  }

  const { summary, backup, filename } = state

  return (
    <Sheet
      open
      onClose={onClose}
      title="Restore this backup?"
      description={filename}
      footer={
        <div className="set-actions">
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onReplace(backup)} disabled={working}>
            Replace Existing Data
          </Button>
        </div>
      }
    >
      <div className="set-sheet-stack">
        <div className="set-summary">
          <div className="set-summary__row">
            <span className="set-summary__key">Backup Date</span>
            <span className="set-summary__value">
              {formatDate(isoOf(summary.createdAt), settings, 'long')}
            </span>
          </div>
          <div className="set-summary__row">
            <span className="set-summary__key">Sales Records</span>
            <span className="set-summary__value">
              {formatNumber(summary.saleCount, settings)}
            </span>
          </div>
          <div className="set-summary__row">
            <span className="set-summary__key">Date Range</span>
            <span className="set-summary__value">
              {summary.dateRange
                ? `${formatDate(summary.dateRange.from, settings, 'medium')} – ${formatDate(summary.dateRange.to, settings, 'medium')}`
                : 'No sales in this backup'}
            </span>
          </div>
          <div className="set-summary__row">
            <span className="set-summary__key">Also included</span>
            <span className="set-summary__value">
              {formatNumber(summary.categoryCount, settings)} categories ·{' '}
              {formatNumber(summary.goalCount, settings)} goal records
            </span>
          </div>
        </div>

        <div className="set-consequence">
          <span className="set-consequence__glyph" aria-hidden="true">
            !
          </span>
          {currentSaleCount === 0 ? (
            <span>
              Restoring <strong>replaces</strong> everything on this device. There are no sales
              here to lose, but your current goals, categories and settings will be swapped for the
              ones in this file. The two sets are not merged.
            </span>
          ) : (
            <span>
              Restoring <strong>replaces</strong> everything on this device. The{' '}
              <strong>
                {formatNumber(currentSaleCount, settings)}{' '}
                {currentSaleCount === 1 ? 'sale' : 'sales'}
              </strong>{' '}
              here now, along with your goals, categories and settings, will be removed and swapped
              for what is in this file. The two sets are not merged, and this cannot be undone.
            </span>
          )}
        </div>

        {currentSaleCount > 0 && (
          <div>
            <Button
              variant={currentBackupIsStale ? 'primary' : 'secondary'}
              block
              onClick={onBackupFirst}
              disabled={working}
            >
              Back up this device first
            </Button>
            <p className="set-note set-note--quiet">
              {currentBackupIsStale
                ? 'There is no recent backup of what is on this device. Save one now and a mistaken restore is still recoverable.'
                : 'Saves what is here now, so a mistaken restore is still recoverable.'}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/* ----------------------------------------------------------------- helpers */

/** Epoch millis -> the LOCAL 'YYYY-MM-DD' the formatter expects. Never UTC. */
/** What `downloadBackup` hands back, narrowed to what this screen needs. */
interface DownloadResultLike {
  filename: string
  createdAt: Millis
  saleCount: number
  bytes: number
}

/**
 * Asks the one question the browser cannot answer for us: did the file
 * actually save? Only a yes writes the backup date (§42, §43).
 *
 * Not dismissible by scrim or Escape — a stray tap here would leave the agent
 * believing they are backed up when the answer was never given.
 */
function BackupSavedCheck({
  result,
  settings,
  onSaved,
  onNotSaved,
}: {
  result: DownloadResultLike | null
  settings: Settings
  onSaved: (result: DownloadResultLike) => void
  onNotSaved: () => void
}) {
  if (result === null) return null

  return (
    <Sheet
      open
      dismissible={false}
      hideClose
      onClose={onNotSaved}
      title="Did the backup save?"
      description="Your browser handles the download, so SalesTrack cannot see where the file went."
      footer={
        <div className="data__sheet-actions">
          <Button variant="secondary" onClick={onNotSaved}>
            It did not save
          </Button>
          <Button variant="primary" onClick={() => onSaved(result)}>
            Yes, I have the file
          </Button>
        </div>
      }
    >
      <p className="data__prose">
        Look for <strong>{result.filename}</strong> in your downloads —{' '}
        {formatNumber(result.saleCount, settings)} {result.saleCount === 1 ? 'sale' : 'sales'},{' '}
        {formatBytes(result.bytes)}.
      </p>
      <p className="data__prose data__prose--muted">
        Confirming records the backup date and quiets the reminder. If the file is not there, say so
        and the reminder will keep asking — that is the only thing standing between a lost device and
        a lost sales history.
      </p>
    </Sheet>
  )
}

function isoOf(at: Millis): string {
  return toIso(new Date(at))
}

function backupStateSentence(
  settings: Settings,
  sinceBackup: number | null,
  saleCount: number,
): string {
  if (settings.lastBackupAt === null) {
    return saleCount === 0
      ? 'Nothing to protect yet. Once you start recording sales, create a backup.'
      : `${formatNumber(saleCount, settings)} sales are stored only here.`
  }
  if (sinceBackup === 0) return 'Backup created today.'
  if (sinceBackup === 1) return 'Backup created yesterday.'
  return `Backup created ${formatNumber(sinceBackup ?? 0, settings)} days ago, on ${formatDate(isoOf(settings.lastBackupAt), settings, 'long')}.`
}
