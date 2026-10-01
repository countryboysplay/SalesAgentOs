import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFS,
  clearTeamData,
  closeTeamStore,
  getCachedBoard,
  getPrefs,
  putCachedBoard,
  setPrefs,
} from './teamStore'

afterEach(async () => {
  await clearTeamData()
  await closeTeamStore()
})

describe('teamStore', () => {
  it('starts with default prefs and merges patches', async () => {
    expect(await getPrefs()).toEqual(DEFAULT_PREFS)
    await setPrefs({ agentName: 'Jonathan Lindsay' })
    await setPrefs({ gsrKey: 'k' })
    expect(await getPrefs()).toEqual({ agentName: 'Jonathan Lindsay', gsrUrl: null, gsrKey: 'k' })
  })

  it('keeps the last board per id with its fetch time, across reopen', async () => {
    await putCachedBoard('scoreboard', { agents: [1] }, 1000)
    await closeTeamStore()
    expect(await getCachedBoard('scoreboard')).toEqual({ data: { agents: [1] }, fetchedAt: 1000 })
    expect(await getCachedBoard('gsr')).toBeUndefined()
  })

  it('erases everything', async () => {
    await setPrefs({ agentName: 'A' })
    await putCachedBoard('gsr', {}, 1)
    await clearTeamData()
    expect(await getPrefs()).toEqual(DEFAULT_PREFS)
    expect(await getCachedBoard('gsr')).toBeUndefined()
  })
})
