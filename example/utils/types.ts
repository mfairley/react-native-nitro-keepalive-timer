export type TimerKind = 'native' | 'js'

export type TimerResult = {
  key: string
  kind: TimerKind
  durationMs: number
  startedAt: number
  expectedAt: number
  pending: boolean
  firedAt?: number
  driftMs?: number
  /** App was ever non-active between start and fire. */
  backgrounded: boolean
}
