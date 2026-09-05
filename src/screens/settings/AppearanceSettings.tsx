/**
 * Settings > Appearance (§45).
 *
 * Both themes are fully designed, so this is a real choice rather than a
 * courtesy toggle. The preview below the control is built from the same
 * primitives Home uses, painted with live tokens — switch the theme and it
 * repaints, which is the honest way to show what you are choosing.
 *
 * The store's `saveSettings({ theme })` forwards to the theme provider, so
 * there is nothing else to call.
 */
import { Card, ProgressBar, SegmentedControl, StatGrid, StatTile } from '@/components'
import { useActions, useSettings } from '@/app/store'
import { useTheme } from '@/app/ThemeProvider'
import { formatCurrency } from '@/core/format'
import type { ThemePreference } from '@/core/types'
import { Note, SettingsPage } from './parts'

type MotionChoice = 'system' | 'reduce' | 'full'

const THEME_BLURB: Record<ThemePreference, string> = {
  system: 'Follows your device. Switches with your phone at sunset if that is how it is set up.',
  light: 'Always light. Best in bright sun and on a desk.',
  dark: 'Always dark. Easier on the eyes in a truck at 6am or late in the evening.',
}

export default function AppearanceSettings() {
  const settings = useSettings()
  const { saveSettings } = useActions()
  const { resolved } = useTheme()

  const motion: MotionChoice =
    settings.reducedMotion === null ? 'system' : settings.reducedMotion ? 'reduce' : 'full'

  return (
    <SettingsPage title="Appearance" subtitle="How SalesTrack looks on this device" storedLocally>
      <Card title="Theme">
        <div className="shell-stack">
          <SegmentedControl<ThemePreference>
            label="Theme"
            value={settings.theme}
            onChange={(theme) => saveSettings({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Note>{THEME_BLURB[settings.theme]}</Note>
          {settings.theme === 'system' && (
            <Note quiet>
              This device is asking for {resolved === 'dark' ? 'dark' : 'light'} right now.
            </Note>
          )}
        </div>
      </Card>

      <Card title="Preview" tone="sunken">
        <div className="shell-stack" aria-hidden="true">
          <StatGrid columns={3}>
            <StatTile label="Today" value={formatCurrency(74_200, settings)} size="lg" />
            <StatTile
              label="Month"
              value={formatCurrency(785_000, settings)}
              sub="78.5% of goal"
              size="sm"
            />
            <StatTile
              label="Est. Commission"
              value={formatCurrency(39_250, settings)}
              size="sm"
              tone="muted"
            />
          </StatGrid>
          <ProgressBar
            value={0.785}
            markerAt={0.7}
            label="Sample monthly goal progress"
            caption={`${formatCurrency(785_000, settings)} / ${formatCurrency(1_000_000, settings)}`}
          />
        </div>
        <p className="sr-only">
          A sample of the dashboard in the {resolved === 'dark' ? 'dark' : 'light'} theme. These
          are example figures, not your sales.
        </p>
        <Note quiet>Example figures — not your sales.</Note>
      </Card>

      <Card title="Motion">
        <div className="shell-stack">
          <SegmentedControl<MotionChoice>
            label="Motion"
            value={motion}
            onChange={(choice) =>
              saveSettings({
                reducedMotion: choice === 'system' ? null : choice === 'reduce',
              })
            }
            options={[
              { value: 'system', label: 'System' },
              { value: 'reduce', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
          <Note>
            {motion === 'system'
              ? 'Follows the reduce-motion setting on this device.'
              : motion === 'reduce'
                ? 'Transitions and the goal celebration are held still, whatever this device is set to.'
                : 'Full animation, even if this device asks apps to reduce motion.'}
          </Note>
        </div>
      </Card>
    </SettingsPage>
  )
}
