/**
 * Settings > About.
 *
 * The agent's own details, and a plain statement of where their data lives.
 * §5 is the reason this screen exists in the shape it does: SalesTrack holds
 * as little about anyone as it can, and says so rather than burying it.
 */
import { useState } from 'react'
import { Button, Card, useToast } from '@/components'
import { useActions, useProfile, useSales, useSettings } from '@/app/store'
import { APP_VERSION } from '@/data'
import { formatNumber } from '@/core/format'
import { KeyValue, Note, SettingsPage, TextField } from './parts'

export default function AboutSettings() {
  const profile = useProfile()
  const settings = useSettings()
  const { sales } = useSales()
  const { saveProfile } = useActions()
  const { success } = useToast()

  const [name, setName] = useState(profile?.displayName ?? '')
  const [initials, setInitials] = useState(profile?.initials ?? '')
  const [error, setError] = useState<string | null>(null)

  const dirty =
    name.trim() !== (profile?.displayName ?? '') ||
    initials.trim() !== (profile?.initials ?? '')

  function save() {
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Enter the name you want the app to greet you by.')
      return
    }
    setError(null)
    saveProfile({
      displayName: trimmed,
      initials: initials.trim() === '' ? null : initials.trim().toUpperCase(),
    })
    success('Saved', { key: 'profile' })
  }

  return (
    <SettingsPage title="About" subtitle="You, and where your data lives" storedLocally>
      <Card title="Your details">
        <div className="shell-stack">
          <TextField
            required
            label="Name"
            value={name}
            onChange={(v) => {
              setName(v)
              setError(null)
            }}
            onEnter={save}
            placeholder="Your name"
            maxLength={40}
            error={error}
            className="set-field--wide"
            hint="Used only to greet you on the Home screen."
          />
          <TextField
            label="Initials (optional)"
            value={initials}
            onChange={setInitials}
            onEnter={save}
            placeholder="JL"
            maxLength={3}
            className="set-field--wide"
          />
          <div className="set-actions set-actions--hug">
            <Button variant="primary" onClick={save} disabled={!dirty}>
              Save
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Where your data lives">
        <div className="shell-stack">
          <Note>
            Every sale, goal and setting is stored on this device and nowhere else. SalesTrack has
            nothing to sign in to, makes no network requests, and collects no analytics. The only
            copies that exist anywhere are the backup and export files you save yourself.
          </Note>
          <Note>
            It also asks for as little as possible about the people you sell to — no names, no
            phone numbers, no addresses. It is a record of your performance, not a customer list.
          </Note>
        </div>
      </Card>

      <Card title="This install" tone="flat">
        <KeyValue label="Version" value={APP_VERSION} />
        <KeyValue label="Sales stored" value={formatNumber(sales.length, settings)} />
        <KeyValue label="Currency" value={settings.currency} />
        <KeyValue label="Storage" value="On this device" />
      </Card>
    </SettingsPage>
  )
}
