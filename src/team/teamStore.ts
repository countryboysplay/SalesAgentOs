/**
 * teamStore — on-device storage for the Team tab, kept apart from the sales
 * database.
 *
 * A separate IndexedDB database ('salesagentos-team'), not a new store in
 * 'salestrack': nothing here is part of the agent's sales record, so it stays
 * out of the frozen schema, out of backups and out of the sales migrations.
 * It holds the agent's board settings and the last good copy of each board,
 * so a card still shows something (with its time) when offline.
 *
 * Every call degrades to "nothing stored" if IndexedDB is unavailable. The
 * boards then simply refetch.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { Millis } from '@/core/types'

export const TEAM_DB_NAME = 'salesagentos-team'
const STORE = 'kv'

export interface TeamPrefs {
  /** The agent's name as it appears on the scoreboard. */
  agentName: string | null
  /** GSR app feed web-app URL (normalized). */
  gsrUrl: string | null
  gsrKey: string | null
}

export const DEFAULT_PREFS: TeamPrefs = { agentName: null, gsrUrl: null, gsrKey: null }

export type BoardId = 'scoreboard' | 'gsr'

export interface CachedBoard<T> {
  data: T
  fetchedAt: Millis
}

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(TEAM_DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE)
    },
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

async function get<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await db()).get(STORE, key)) as T | undefined
  } catch {
    return undefined
  }
}

async function put(key: string, value: unknown): Promise<void> {
  try {
    await (await db()).put(STORE, value, key)
  } catch {
    // Not fatal: board settings and caches are conveniences.
  }
}

export async function getPrefs(): Promise<TeamPrefs> {
  return { ...DEFAULT_PREFS, ...(await get<Partial<TeamPrefs>>('prefs')) }
}

export async function setPrefs(patch: Partial<TeamPrefs>): Promise<TeamPrefs> {
  const next = { ...(await getPrefs()), ...patch }
  await put('prefs', next)
  return next
}

export function getCachedBoard<T>(id: BoardId): Promise<CachedBoard<T> | undefined> {
  return get<CachedBoard<T>>(`board:${id}`)
}

export function putCachedBoard<T>(id: BoardId, data: T, fetchedAt: Millis = Date.now()): Promise<void> {
  return put(`board:${id}`, { data, fetchedAt } satisfies CachedBoard<T>)
}

/** Erases board settings and caches. Called by Settings → Erase all data. */
export async function clearTeamData(): Promise<void> {
  try {
    await (await db()).clear(STORE)
  } catch {
    // Nothing stored, nothing to erase.
  }
}

/** Test hook: drop the cached connection. */
export async function closeTeamStore(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (pending) (await pending.catch(() => null))?.close()
}
