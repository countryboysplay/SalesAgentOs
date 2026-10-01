/**
 * useBoard — the last good copy of a team board, refreshed while it is on screen.
 *
 * Shows the cached board immediately (from teamStore), then fetches. It
 * refreshes on an interval only while the page is visible, and again when
 * the device comes back online or the app returns to the foreground. A failed
 * refresh keeps the previous board and reports the error beside it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BoardDataError } from '@/team/boards'
import { fetchJson } from '@/team/fetchBoard'
import { getCachedBoard, putCachedBoard, type BoardId } from '@/team/teamStore'

export interface BoardState<T> {
  data: T | null
  /** When `data` was fetched (epoch ms). */
  fetchedAt: number | null
  refreshing: boolean
  error: BoardDataError | null
  /** True once the cache has been read, so the card can tell "empty" from "not yet looked". */
  ready: boolean
}

export function useBoard<T>(
  id: BoardId,
  url: string | null,
  parse: (raw: unknown) => T,
  intervalMs: number,
): BoardState<T> & { refresh: () => void } {
  const [state, setState] = useState<BoardState<T>>({
    data: null,
    fetchedAt: null,
    refreshing: false,
    error: null,
    ready: false,
  })
  const parseRef = useRef(parse)
  parseRef.current = parse
  const inFlight = useRef(false)

  // Cached copy first.
  useEffect(() => {
    let live = true
    void getCachedBoard<T>(id).then((cached) => {
      if (!live) return
      setState((s) => ({
        ...s,
        ready: true,
        data: s.data ?? cached?.data ?? null,
        fetchedAt: s.fetchedAt ?? cached?.fetchedAt ?? null,
      }))
    })
    return () => {
      live = false
    }
  }, [id])

  const refresh = useCallback(async () => {
    if (!url || inFlight.current) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState((s) => ({ ...s, error: new BoardDataError('unavailable', 'offline') }))
      return
    }
    inFlight.current = true
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const data = parseRef.current(await fetchJson(url))
      const fetchedAt = Date.now()
      setState((s) => ({ ...s, data, fetchedAt, refreshing: false, error: null }))
      void putCachedBoard(id, data, fetchedAt)
    } catch (err) {
      const error =
        err instanceof BoardDataError ? err : new BoardDataError('malformed', String(err))
      setState((s) => ({ ...s, refreshing: false, error }))
    } finally {
      inFlight.current = false
    }
  }, [id, url])

  useEffect(() => {
    if (!url) return
    setState((s) => ({ ...s, error: null }))
    void refresh()

    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [url, intervalMs, refresh])

  return { ...state, refresh: () => void refresh() }
}
