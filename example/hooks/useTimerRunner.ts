import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStateStatus } from 'react-native'
import {
  clearTimeout as nativeClearTimeout,
  setTimeout as nativeSetTimeout,
} from 'react-native-nitro-keepalive-timer'

import { fmtDrift, fmtTime } from '../utils/format'
import type { TimerKind, TimerResult } from '../utils/types'

export type TimerRunner = {
  results: TimerResult[]
  pendingCount: number
  start: (kind: TimerKind, durationMs: number) => void
  startBoth: (durationMs: number) => void
  cancelAll: () => void
  clearLog: () => void
}

/**
 * Owns the list of in-flight and finished timer runs.
 * Marks pending runs as `backgrounded` whenever the app leaves the active state.
 */
export function useTimerRunner(appState: AppStateStatus): TimerRunner {
  const [results, setResults] = useState<TimerResult[]>([])

  const pendingNativeIds = useRef<Set<number>>(new Set())
  const pendingJsIds = useRef<Set<ReturnType<typeof globalThis.setTimeout>>>(
    new Set()
  )
  // Keys of results that haven't fired yet — flipped to `backgrounded: true`
  // on any non-active AppState transition.
  const pendingKeys = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (appState === 'active' || pendingKeys.current.size === 0) return
    const keys = new Set(pendingKeys.current)
    setResults((prev) =>
      prev.map((r) => (keys.has(r.key) ? { ...r, backgrounded: true } : r))
    )
  }, [appState])

  const finishTimer = useCallback(
    (key: string, kind: TimerKind, expectedAt: number) => {
      pendingKeys.current.delete(key)
      const firedAt = Date.now()
      const driftMs = firedAt - expectedAt
      setResults((prev) =>
        prev.map((r) =>
          r.key === key ? { ...r, pending: false, firedAt, driftMs } : r
        )
      )
      console.log(
        `[${kind}] fired key=${key} drift=${fmtDrift(driftMs)} at=${fmtTime(firedAt)}`
      )
    },
    []
  )

  const start = useCallback(
    (kind: TimerKind, durationMs: number) => {
      const startedAt = Date.now()
      const expectedAt = startedAt + durationMs
      const key = `${kind}-${startedAt}-${Math.random().toString(36).slice(2, 6)}`

      const initial: TimerResult = {
        key,
        kind,
        durationMs,
        startedAt,
        expectedAt,
        pending: true,
        backgrounded: appState !== 'active',
      }
      pendingKeys.current.add(key)
      setResults((prev) => [initial, ...prev])

      if (kind === 'native') {
        const id = nativeSetTimeout(() => {
          pendingNativeIds.current.delete(id)
          finishTimer(key, kind, expectedAt)
        }, durationMs)
        pendingNativeIds.current.add(id)
      } else {
        const id = globalThis.setTimeout(() => {
          pendingJsIds.current.delete(id)
          finishTimer(key, kind, expectedAt)
        }, durationMs)
        pendingJsIds.current.add(id)
      }
    },
    [appState, finishTimer]
  )

  const startBoth = useCallback(
    (durationMs: number) => {
      start('native', durationMs)
      start('js', durationMs)
    },
    [start]
  )

  const cancelAll = useCallback(() => {
    pendingNativeIds.current.forEach((id) => nativeClearTimeout(id))
    pendingNativeIds.current.clear()
    pendingJsIds.current.forEach((id) => globalThis.clearTimeout(id))
    pendingJsIds.current.clear()
    pendingKeys.current.clear()
    setResults((prev) => prev.filter((r) => !r.pending))
  }, [])

  const clearLog = useCallback(() => {
    cancelAll()
    setResults([])
  }, [cancelAll])

  const pendingCount = useMemo(
    () => results.filter((r) => r.pending).length,
    [results]
  )

  return { results, pendingCount, start, startBoth, cancelAll, clearLog }
}
