import { describe, expect, it } from 'vitest'
import { BoardDataError } from './boards'
import { fetchJson, gsrFeedUrl, normalizeFeedUrl, scoreboardFeedUrl } from './fetchBoard'

const respond = (body: string, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch

describe('normalizeFeedUrl', () => {
  it('accepts plain and Workspace-style Apps Script URLs', () => {
    expect(normalizeFeedUrl(' https://script.google.com/macros/s/AKfy_1-x/exec ')).toBe(
      'https://script.google.com/macros/s/AKfy_1-x/exec',
    )
    expect(normalizeFeedUrl('https://script.google.com/a/macros/weedmanusa.com/s/AKfy/exec')).toBe(
      'https://script.google.com/macros/s/AKfy/exec',
    )
  })

  it('rejects anything else', () => {
    expect(normalizeFeedUrl('http://script.google.com/macros/s/AKfy/exec')).toBeNull()
    expect(normalizeFeedUrl('https://evil.example/macros/s/AKfy/exec')).toBeNull()
    expect(normalizeFeedUrl('https://script.google.com/macros/s/AKfy/dev')).toBeNull()
    expect(normalizeFeedUrl('not a url')).toBeNull()
  })
})

describe('feed URLs', () => {
  it('asks the scoreboard for JSON and encodes the GSR key', () => {
    expect(scoreboardFeedUrl()).toMatch(/\/exec\?format=json$/)
    expect(gsrFeedUrl('https://script.google.com/macros/s/X/exec', 'a b&c')).toBe(
      'https://script.google.com/macros/s/X/exec?key=a%20b%26c',
    )
  })
})

describe('fetchJson', () => {
  it('returns parsed JSON', async () => {
    await expect(fetchJson('u', { fetchImpl: respond('{"ok":true}') })).resolves.toEqual({ ok: true })
  })

  it('treats an HTML page (sign-in wall, script error) as unavailable', async () => {
    await expect(fetchJson('u', { fetchImpl: respond('<html>Sign in</html>') })).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('treats HTTP errors and network failures as unavailable', async () => {
    await expect(fetchJson('u', { fetchImpl: respond('x', 500) })).rejects.toBeInstanceOf(BoardDataError)
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(fetchJson('u', { fetchImpl: offline })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('gives up after the timeout', async () => {
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    await expect(fetchJson('u', { fetchImpl: hang, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
