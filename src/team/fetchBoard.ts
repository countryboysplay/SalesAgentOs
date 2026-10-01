/**
 * fetchBoard — reads a team dashboard feed over the network.
 *
 * The only network code in the app (README: "Everything stays on your
 * device"). It sends a plain GET with no cookies and no sales data. The only
 * thing that goes out is the GSR access key the agent entered.
 */
import { BoardDataError } from './boards'

/** Employee Sales Scoreboard web app (public). JSON mode: ?format=json. */
export const SCOREBOARD_URL =
  'https://script.google.com/macros/s/AKfycbxWPOViBoRyY04CQSk0M5SQ2SS1pQd0PjOBOijq4wQSOUFUQY4M8vrRlBVEOYC5nnAh/exec'

export const scoreboardFeedUrl = () => `${SCOREBOARD_URL}?format=json`

/**
 * Checks and tidies a pasted Apps Script web-app URL. Workspace accounts copy
 * URLs as /a/macros/<domain>/s/<id>/exec, but anonymous requests must use
 * the plain /macros/s/<id>/exec form for the same deployment.
 * Returns null when the text is not an Apps Script /exec URL.
 */
export function normalizeFeedUrl(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') return null
  const match = /^\/(?:a\/macros\/[^/]+|macros)\/s\/([A-Za-z0-9_-]+)\/exec\/?$/.exec(url.pathname)
  if (!match) return null
  return `https://script.google.com/macros/s/${match[1]}/exec`
}

export function gsrFeedUrl(baseUrl: string, key: string): string {
  return `${baseUrl}?key=${encodeURIComponent(key)}`
}

export interface FetchOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const { fetchImpl = fetch, timeoutMs = 15_000 } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new BoardDataError('unavailable', `the board answered ${res.status}`)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      // Apps Script answers errors and sign-in walls with an HTML page.
      throw new BoardDataError('unavailable', 'the board did not send data')
    }
  } catch (err) {
    if (err instanceof BoardDataError) throw err
    throw new BoardDataError('unavailable', 'the board could not be reached')
  } finally {
    clearTimeout(timer)
  }
}
