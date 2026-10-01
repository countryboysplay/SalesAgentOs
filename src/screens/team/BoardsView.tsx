/**
 * Boards — the Employee Sales Scoreboard and the GSR Live Performance
 * Dashboard, drawn with the app's own components from each feed's JSON.
 *
 * Network reads happen here and only here. The cards say when their numbers
 * are from. They never claim to be live, and they use none of the §62
 * banned words.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  EmptyState,
  MiniBars,
  ProgressBar,
  Sheet,
  Skeleton,
  StatGrid,
  StatTile,
  useToast,
} from '@/components'
import { useSettings } from '@/app/store'
import { formatCurrency, formatNumber, formatPercent } from '@/core/format'
import {
  executiveFocus,
  findAgent,
  leaderboard,
  normalizeName,
  parseGsr,
  parseScoreboard,
  type Gsr,
  type Scoreboard,
} from '@/team/boards'
import { gsrFeedUrl, normalizeFeedUrl, scoreboardFeedUrl } from '@/team/fetchBoard'
import { DEFAULT_PREFS, getPrefs, setPrefs, type TeamPrefs } from '@/team/teamStore'
import { useBoard, type BoardState } from './useBoard'

const SCOREBOARD_REFRESH_MS = 30_000
const GSR_REFRESH_MS = 60_000

/** "2:14 PM" today, "Sep 30, 2:14 PM" otherwise. */
export function formatStamp(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const sameDay = new Date(now).toDateString() === d.toDateString()
  return d.toLocaleString(undefined, {
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BoardsView() {
  const [prefs, setPrefsState] = useState<TeamPrefs | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    void getPrefs().then(setPrefsState)
  }, [])

  const scoreboard = useBoard('scoreboard', scoreboardFeedUrl(), parseScoreboard, SCOREBOARD_REFRESH_MS)
  const gsrUrl = prefs?.gsrUrl && prefs.gsrKey ? gsrFeedUrl(prefs.gsrUrl, prefs.gsrKey) : null
  const gsr = useBoard('gsr', gsrUrl, parseGsr, GSR_REFRESH_MS)

  if (!prefs) return null

  return (
    <>
      <ScoreboardCard board={scoreboard} agentName={prefs.agentName} onSetup={() => setSetupOpen(true)} />
      <GsrCard board={gsr} configured={gsrUrl !== null} onSetup={() => setSetupOpen(true)} />
      <div className="boards__setup">
        <Button variant="ghost" onClick={() => setSetupOpen(true)}>
          Board settings
        </Button>
      </div>
      <SetupSheet
        open={setupOpen}
        prefs={prefs}
        agentNames={scoreboard.data?.agents.map((a) => a.name) ?? []}
        onClose={() => setSetupOpen(false)}
        onSaved={(next) => {
          setPrefsState(next)
          setSetupOpen(false)
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------- freshness */

function Freshness<T>({ board, stamp }: { board: BoardState<T>; stamp: number | null }) {
  if (stamp === null) return null
  const when = formatStamp(stamp)
  const text = board.error
    ? navigator.onLine === false
      ? `Showing the board from ${when}. It refreshes when you're back online.`
      : `Couldn't refresh. Showing the board from ${when}.`
    : `Updated ${when}`
  return (
    <p className={`boards__fresh${board.error ? ' boards__fresh--stale' : ''}`} role="status">
      {board.error && (
        <span className="boards__fresh-glyph" aria-hidden="true">
          !
        </span>
      )}
      {text}
    </p>
  )
}

/** The feed's own update time when it has one, else when we fetched. */
const stampOf = (lastUpdated: string | null | undefined, fetchedAt: number | null) =>
  lastUpdated ? Date.parse(lastUpdated) : fetchedAt

function Loading() {
  return (
    <div className="boards__loading" aria-hidden="true">
      <Skeleton variant="block" height={56} />
      <Skeleton variant="block" height={120} />
    </div>
  )
}

/* -------------------------------------------------------------- scoreboard */

function ScoreboardCard({
  board,
  agentName,
  onSetup,
}: {
  board: BoardState<Scoreboard>
  agentName: string | null
  onSetup: () => void
}) {
  const settings = useSettings()
  const money = (cents: number) => formatCurrency(cents, settings, { decimals: 'never' })
  const data = board.data

  let body: ReactNode
  if (!data) {
    body =
      board.error || (board.ready && !board.refreshing && navigator.onLine === false) ? (
        <EmptyState
          compact
          title="The scoreboard will appear here."
          body="It loads the next time this device can reach it."
          icon={null}
        />
      ) : (
        <Loading />
      )
  } else {
    const me = findAgent(data, agentName)
    body = (
      <>
        <StatGrid columns={3}>
          <StatTile label="Team Yes $" value={money(data.totals.yesCents)} size="sm" />
          <StatTile label="Total Yes" value={formatNumber(data.totals.yesCount, settings)} size="sm" />
          <StatTile label="Active agents" value={formatNumber(data.totals.activeAgents, settings)} size="sm" />
        </StatGrid>

        {me ? (
          <p className="boards__me">
            <span className="boards__badge">You</span>
            <span>
              <b className="num">#{me.rank}</b> · {formatNumber(me.yesCount, settings)} Yes ·{' '}
              <b className="num">{money(me.yesCents)}</b>
            </span>
          </p>
        ) : agentName ? (
          <p className="boards__hint">{agentName} isn't on today's board yet.</p>
        ) : (
          <div className="boards__hint">
            <span>Pick your name to see where you rank.</span>
            <Button size="sm" variant="secondary" onClick={onSetup}>
              Pick name
            </Button>
          </div>
        )}

        {data.agents.length === 0 ? (
          <EmptyState compact icon={null} title="No Yes sales on the board yet today." />
        ) : (
          <ol className="boards__rank" aria-label="Agents ranked by Yes dollars today">
            {data.agents.map((agent) => {
              const isMe = me !== null && normalizeName(agent.name) === normalizeName(me.name)
              return (
                <li key={`${agent.rank}-${agent.name}`} className={isMe ? 'is-me' : undefined}>
                  <span className="boards__rank-n num">{agent.rank}</span>
                  <span className="boards__rank-name">
                    {agent.name}
                    {isMe && <span className="boards__badge">You</span>}
                  </span>
                  <span className="boards__rank-yes num">
                    {formatNumber(agent.yesCount, settings)}
                    <span className="sr-only"> Yes</span>
                  </span>
                  <span className="boards__rank-dollars num">{money(agent.yesCents)}</span>
                </li>
              )
            })}
          </ol>
        )}
      </>
    )
  }

  return (
    <Card title="Today's scoreboard">
      <div className="boards__body">
        {body}
        <Freshness board={board} stamp={stampOf(data?.lastUpdated, board.fetchedAt)} />
      </div>
    </Card>
  )
}

/* --------------------------------------------------------------------- GSR */

function GsrCard({
  board,
  configured,
  onSetup,
}: {
  board: BoardState<Gsr>
  configured: boolean
  onSetup: () => void
}) {
  const settings = useSettings()
  const compact = (cents: number) => formatCurrency(cents, settings, { compact: true })
  const pct = (f: number) => formatPercent(f, settings)

  if (!configured) {
    return (
      <Card title="GSR performance">
        <EmptyState
          compact
          icon={null}
          title="The GSR board needs a one-time setup."
          body="Ask your manager for the GSR link and access key, then enter them here."
          action={
            <Button variant="primary" onClick={onSetup}>
              Set up
            </Button>
          }
        />
      </Card>
    )
  }

  const data = board.data
  if (board.error?.kind === 'unauthorized') {
    return (
      <Card title="GSR performance">
        <EmptyState
          compact
          icon={null}
          title="The GSR access key wasn't accepted."
          body="It may have been changed. Ask your manager for the current key."
          action={
            <Button variant="primary" onClick={onSetup}>
              Update key
            </Button>
          }
        />
      </Card>
    )
  }

  if (!data) {
    return (
      <Card title="GSR performance">
        {board.error ? (
          <EmptyState compact icon={null} title="The GSR board will appear here." body="It loads the next time this device can reach it." />
        ) : (
          <Loading />
        )}
      </Card>
    )
  }

  const { total, fao, pgc } = data.totals
  const focus = executiveFocus(data)
  const ranked = leaderboard(data)
  const trend = data.history.slice(-30)
  const first = trend[0]
  const last = trend[trend.length - 1]

  return (
    <Card title="GSR performance">
      <div className="boards__body">
        <StatGrid columns={2}>
          <StatTile
            label="YTD revenue"
            value={compact(total.actualCents)}
            sub={`of ${compact(total.budgetCents)} year-end budget`}
            size="md"
          />
          <StatTile
            label="Remaining"
            value={compact(total.remainingCents)}
            sub={total.remainingCents === 0 ? 'Budget reached' : 'to year-end budget'}
            subTone={total.remainingCents === 0 ? 'positive' : 'default'}
            size="md"
          />
        </StatGrid>

        <div className="boards__bars">
          <ProgressBar
            label="Total attainment"
            caption="Total"
            value={total.attainment}
            valueLabel={pct(total.attainment)}
            tone={total.attainment >= 1 ? 'positive' : 'accent'}
          />
          <ProgressBar
            label="FAO attainment"
            caption="FAO"
            value={fao.attainment}
            valueLabel={pct(fao.attainment)}
            size="sm"
            tone={fao.attainment >= 1 ? 'positive' : 'accent'}
          />
          <ProgressBar
            label="PGC attainment"
            caption="PGC"
            value={pgc.attainment}
            valueLabel={pct(pgc.attainment)}
            size="sm"
            tone={pgc.attainment >= 1 ? 'positive' : 'accent'}
          />
        </div>

        {focus && (
          <div className="boards__focus">
            <span className="kb-row__meta">Executive focus</span>
            <p>
              <b>{focus.branch}</b> has the largest gap: <b className="num">{compact(focus.total.remainingCents)}</b> to
              go, at {pct(focus.total.attainment)} of budget.
            </p>
          </div>
        )}

        <div className="kb-table boards__table">
          <table>
            <caption className="sr-only">Branch leaderboard, ranked by total attainment</caption>
            <thead>
              <tr>
                <th scope="col">Branch</th>
                <th scope="col" className="is-num">YTD actual</th>
                <th scope="col" className="is-num">YE budget</th>
                <th scope="col" className="is-num">Attainment</th>
                <th scope="col" className="is-num">FAO</th>
                <th scope="col" className="is-num">PGC</th>
                <th scope="col" className="is-num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((b) => (
                <tr key={b.branch}>
                  <td data-label="Branch">{b.branch}</td>
                  <td data-label="YTD actual" className="is-num num">{compact(b.total.actualCents)}</td>
                  <td data-label="YE budget" className="is-num num">{compact(b.total.budgetCents)}</td>
                  <td data-label="Attainment" className="is-num num">{pct(b.total.attainment)}</td>
                  <td data-label="FAO" className="is-num num">{pct(b.fao.attainment)}</td>
                  <td data-label="PGC" className="is-num num">{pct(b.pgc.attainment)}</td>
                  <td data-label="Remaining" className="is-num num">
                    {b.total.remainingCents === 0 ? 'Budget reached' : compact(b.total.remainingCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {first && last && trend.length > 1 && (
          <div className="boards__trend">
            <span className="kb-row__meta">Total attainment trend</span>
            <MiniBars values={trend.map((p) => p.totalAttainment)} />
            <p className="boards__trend-text">
              {pct(first.totalAttainment)} → {pct(last.totalAttainment)} over the last {trend.length} updates
              (since {formatStamp(Date.parse(first.timestamp))}).
            </p>
          </div>
        )}

        <Freshness board={board} stamp={stampOf(data.lastUpdated, board.fetchedAt)} />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------- setup */

function SetupSheet({
  open,
  prefs,
  agentNames,
  onClose,
  onSaved,
}: {
  open: boolean
  prefs: TeamPrefs
  agentNames: string[]
  onClose: () => void
  onSaved: (prefs: TeamPrefs) => void
}) {
  const { success } = useToast()
  const id = useId()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(prefs.agentName ?? '')
    setUrl(prefs.gsrUrl ?? '')
    setKey(prefs.gsrKey ?? '')
    setUrlError(null)
  }, [open, prefs])

  const save = async () => {
    const trimmedUrl = url.trim()
    const normalized = trimmedUrl ? normalizeFeedUrl(trimmedUrl) : null
    if (trimmedUrl && !normalized) {
      setUrlError('That isn’t a Google Apps Script web-app link. It should end in /exec.')
      return
    }
    const next = await setPrefs({
      agentName: name.trim() || DEFAULT_PREFS.agentName,
      gsrUrl: normalized,
      gsrKey: key.trim() || null,
    })
    success('Board settings saved', { key: 'boards-setup' })
    onSaved(next)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Board settings"
      description="Saved on this device. Your sales are never sent anywhere."
      footer={
        <Button variant="primary" block onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="boards__form">
        <div className="boards__field">
          <label htmlFor={`${id}-name`}>Your name on the scoreboard</label>
          <input
            id={`${id}-name`}
            className="boards__input"
            list={`${id}-names`}
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id={`${id}-names`}>
            {agentNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <p className="boards__note">Used to highlight your row. Spell it as the scoreboard does.</p>
        </div>

        <div className="boards__field">
          <label htmlFor={`${id}-url`}>GSR link</label>
          <input
            id={`${id}-url`}
            className="boards__input"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://script.google.com/…/exec"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? `${id}-url-error` : undefined}
            onChange={(e) => {
              setUrl(e.target.value)
              setUrlError(null)
            }}
          />
          {urlError && (
            <p className="boards__error" id={`${id}-url-error`} role="alert">
              <span aria-hidden="true">! </span>
              {urlError}
            </p>
          )}
        </div>

        <div className="boards__field">
          <label htmlFor={`${id}-key`}>GSR access key</label>
          <input
            id={`${id}-key`}
            className="boards__input"
            value={key}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="boards__note">Your manager gives you the link and key.</p>
        </div>
      </div>
    </Sheet>
  )
}
