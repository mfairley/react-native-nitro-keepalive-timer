import type { TimerKind } from './types'

export const DURATIONS: { label: string; ms: number }[] = [
  { label: '5s', ms: 5_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '2m', ms: 120_000 },
  { label: '5m', ms: 300_000 },
]

export const KIND_LABEL: Record<TimerKind, string> = {
  native: 'Native',
  js: 'JS',
}

export const KIND_COLOR: Record<TimerKind, string> = {
  native: '#16a34a',
  js: '#2563eb',
}
