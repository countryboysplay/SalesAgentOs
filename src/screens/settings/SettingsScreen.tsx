/**
 * Settings — the index, and the router for everything under /settings/*.
 *
 * `App.tsx` sends every /settings path here; the sub-route is read with
 * `useSubRoute('/settings')`. Each sub-screen is a plain default export in
 * this folder, so the whole section is one directory with one owner.
 */
import type { ReactNode } from 'react'
import { Card, PageHeader } from '@/components'
import { Link, ROUTES, useSubRoute } from '@/app/router'
import { useCategories, useGoals, useProfile, useSales, useSettings } from '@/app/store'
import { toIso, todayIso } from '@/core/date'
import { formatBasisPoints, formatCurrency, formatDate, formatNumber } from '@/core/format'
import type { GoalType, Millis, Settings } from '@/core/types'

import GoalsSettings from './GoalsSettings'
import CommissionSettings from './CommissionSettings'
import CategoriesSettings from './CategoriesSettings'
import ScheduleSettings, { describeWorkdays } from './ScheduleSettings'
import AppearanceSettings from './AppearanceSettings'
import DataSettings from './DataSettings'
import AboutSettings from './AboutSettings'
import { ChevronRight, Note } from './parts'
import { goalUnitSuffix } from './goalHistory'
import './settings.css'

export default function SettingsScreen() {
  const section = useSubRoute('/settings')

  switch (section) {
    case 'goals':
      return <GoalsSettings />
    case 'commission':
      return <CommissionSettings />
    case 'categories':
      return <CategoriesSettings />
    case 'schedule':
      return <ScheduleSettings />
    case 'appearance':
      return <AppearanceSettings />
    case 'data':
      return <DataSettings />
    case 'about':
      return <AboutSettings />
    default:
      return <SettingsIndex />
  }
}

/* ------------------------------------------------------------------ index */

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const

function SettingsIndex() {
  const today = todayIso()
  const settings = useSettings()
  const profile = useProfile()
  const { sales } = useSales()
  const { activeCategories } = useCategories()
  const { goalFor } = useGoals()

  const goalSummary = summariseGoals(
    (type: GoalType) => goalFor(type, today)?.amount ?? null,
    settings,
  )

  const sinceBackup =
    settings.lastBackupAt === null
      ? null
      : Math.max(0, Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000))

  const backupOverdue =
    sales.length > 0 &&
    settings.backupReminder !== 'off' &&
    (sinceBackup === null || sinceBackup >= (settings.backupReminder === 'weekly' ? 7 : 30))

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={profile?.displayName ? profile.displayName : undefined}
        showStoredLocally
      />

      <div className="shell-stack">
        {/* §43 — the reminder, surfaced where the agent already is rather than
            as a notification the app has no way to send. */}
        {backupOverdue && (
          <Card tone="warning">
            <Note>
              <strong>
                {sinceBackup === null
                  ? 'No backup yet.'
                  : `Last backup was ${formatNumber(sinceBackup, settings)} days ago.`}
              </strong>{' '}
              Your {formatNumber(sales.length, settings)} sales exist only on this device. Creating
              a backup takes a second and protects them from device loss or a browser reset.
            </Note>
            <p style={{ marginTop: 'var(--space-3)' }}>
              <Link to={ROUTES.settingsData}>Go to Data →</Link>
            </p>
          </Card>
        )}

        <Card padding="none">
          <nav className="set-nav" aria-label="Settings sections">
            <NavItem
              to={ROUTES.settingsGoals}
              icon={<TargetIcon />}
              title="Goals"
              sub={goalSummary}
            />
            <NavItem
              to={ROUTES.settingsCommission}
              icon={<PercentIcon />}
              title="Commission"
              sub={
                settings.commissionEnabled
                  ? `Estimated commission · default ${formatBasisPoints(settings.defaultCommissionRate, settings)}`
                  : 'Not tracked'
              }
            />
            <NavItem
              to={ROUTES.settingsCategories}
              icon={<TagIcon />}
              title="Sale Categories"
              sub={`${formatNumber(activeCategories.length, settings)} active`}
            />
            <NavItem
              to={ROUTES.settingsSchedule}
              icon={<CalendarIcon />}
              title="Work Schedule"
              sub={`${describeWorkdays(settings.workdays)}${settings.excludedDates.length > 0 ? ` · ${formatNumber(settings.excludedDates.length, settings)} excluded` : ''}`}
            />
            <NavItem
              to={ROUTES.settingsAppearance}
              icon={<ContrastIcon />}
              title="Appearance"
              sub={THEME_LABEL[settings.theme]}
            />
            <NavItem
              to={ROUTES.settingsData}
              icon={<ShieldIcon />}
              title="Data"
              sub={backupLine(settings.lastBackupAt, sinceBackup, settings)}
            />
            <NavItem
              to={ROUTES.settingsAbout}
              icon={<InfoIcon />}
              title="About"
              sub="Your details and where your data lives"
            />
          </nav>
        </Card>

        <Note quiet>
          Everything in SalesTrack is stored on this device. Nothing is ever sent anywhere.
        </Note>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  title,
  sub,
}: {
  to: string
  icon: ReactNode
  title: string
  sub: string
}) {
  return (
    <Link to={to} className="set-nav__item focus-inset">
      <span className="set-nav__glyph" aria-hidden="true">
        {icon}
      </span>
      <span className="set-nav__text">
        <span className="set-nav__title">{title}</span>
        <span className="set-nav__sub">{sub}</span>
      </span>
      <ChevronRight />
    </Link>
  )
}

/* ---------------------------------------------------------------- summaries */

function summariseGoals(
  amountFor: (type: GoalType) => number | null,
  settings: Settings,
): string {
  const parts: string[] = []
  for (const type of ['daily', 'monthly', 'annual'] as GoalType[]) {
    const amount = amountFor(type)
    if (amount !== null) {
      parts.push(`${formatCurrency(amount, settings)}${goalUnitSuffix(type)}`)
    }
  }
  return parts.length === 0 ? 'No goals set' : parts.join(' · ')
}

function backupLine(lastBackupAt: Millis | null, days: number | null, settings: Settings): string {
  if (lastBackupAt === null) return 'Backup, export and reset · no backup yet'
  if (days === 0) return 'Backup created today'
  if (days === 1) return 'Backup created yesterday'
  return `Backup created ${formatDate(isoOf(lastBackupAt), settings, 'medium')}`
}

/** Epoch millis -> the LOCAL 'YYYY-MM-DD' the formatter expects. */
function isoOf(at: Millis): string {
  return toIso(new Date(at))
}

/* -------------------------------------------------------------------- icons */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" {...stroke} />
      <circle cx="10" cy="10" r="2.5" {...stroke} />
    </svg>
  )
}

function PercentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15 5 5 15" {...stroke} />
      <circle cx="6.5" cy="6.5" r="2" {...stroke} />
      <circle cx="13.5" cy="13.5" r="2" {...stroke} />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 4h6l6 6-6 6-6-6z" {...stroke} />
      <circle cx="7" cy="7" r="1.1" {...stroke} />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="12" rx="2" {...stroke} />
      <path d="M3.5 8.5h13M7 3v3m6-3v3" {...stroke} />
    </svg>
  )
}

function ContrastIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" {...stroke} />
      <path d="M10 3.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3 4.5 5.2v4.3c0 3.2 2.2 6 5.5 7.1 3.3-1.1 5.5-3.9 5.5-7.1V5.2z" {...stroke} />
      <path d="m7.6 10 1.7 1.7 3.3-3.4" {...stroke} />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.8" {...stroke} />
      <path d="M10 9.2v4.2" {...stroke} />
      <circle cx="10" cy="6.6" r="0.9" fill="currentColor" />
    </svg>
  )
}
