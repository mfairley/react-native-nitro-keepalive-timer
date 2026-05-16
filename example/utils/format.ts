export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export function fmtDurationMs(ms: number): string {
  if (Math.abs(ms) < 1000) return `${ms.toFixed(0)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function fmtDrift(ms: number): string {
  const sign = ms >= 0 ? '+' : ''
  return `${sign}${fmtDurationMs(ms)}`
}
