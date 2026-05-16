import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import {
  clearTimeout as nativeClearTimeout,
  setTimeout as nativeSetTimeout,
} from 'react-native-nitro-keepalive-timer'

type TimerKind = 'native' | 'js'

type TimerResult = {
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

const DURATIONS: { label: string; ms: number }[] = [
  { label: '5s', ms: 5_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '2m', ms: 120_000 },
  { label: '5m', ms: 300_000 },
]

const KIND_LABEL: Record<TimerKind, string> = {
  native: 'Native (keepalive)',
  js: 'JS (setTimeout)',
}

const KIND_COLOR: Record<TimerKind, string> = {
  native: '#16a34a',
  js: '#2563eb',
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function fmtDurationMs(ms: number): string {
  if (Math.abs(ms) < 1000) return `${ms.toFixed(0)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function fmtDrift(ms: number): string {
  const sign = ms >= 0 ? '+' : ''
  return `${sign}${fmtDurationMs(ms)}`
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  )
}

function Screen() {
  const [duration, setDuration] = useState(DURATIONS[2]) // 1m default
  const [results, setResults] = useState<TimerResult[]>([])
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  )

  // Track pending timer ids so we can clear them all.
  const pendingNativeIds = useRef<Set<number>>(new Set())
  const pendingJsIds = useRef<Set<ReturnType<typeof globalThis.setTimeout>>>(
    new Set()
  )
  // Keys of results that are still pending — flip `backgrounded` on bg event.
  const pendingKeys = useRef<Set<string>>(new Set())

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppState(next)
      if (next !== 'active' && pendingKeys.current.size > 0) {
        const keys = new Set(pendingKeys.current)
        setResults((prev) =>
          prev.map((r) => (keys.has(r.key) ? { ...r, backgrounded: true } : r))
        )
      }
    })
    return () => sub.remove()
  }, [])

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
    (kind: TimerKind) => {
      const startedAt = Date.now()
      const expectedAt = startedAt + duration.ms
      const key = `${kind}-${startedAt}-${Math.random().toString(36).slice(2, 6)}`

      const initial: TimerResult = {
        key,
        kind,
        durationMs: duration.ms,
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
        }, duration.ms)
        pendingNativeIds.current.add(id)
      } else {
        const id = globalThis.setTimeout(() => {
          pendingJsIds.current.delete(id)
          finishTimer(key, kind, expectedAt)
        }, duration.ms)
        pendingJsIds.current.add(id)
      }
    },
    [appState, duration, finishTimer]
  )

  const startBoth = useCallback(() => {
    start('native')
    start('js')
  }, [start])

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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.header}>Keepalive Timer Drift Test</Text>
        <Text style={styles.subheader}>
          Lock the screen after starting a timer to see how each kind drifts.
        </Text>

        <Card title="App state">
          <Row>
            <Text style={styles.label}>Current</Text>
            <Text
              style={[
                styles.value,
                appState === 'active'
                  ? styles.valueActive
                  : styles.valueInactive,
              ]}
            >
              {appState}
            </Text>
          </Row>
          <Row>
            <Text style={styles.label}>Pending timers</Text>
            <Text style={styles.value}>{pendingCount}</Text>
          </Row>
        </Card>

        <Card title="Duration">
          <View style={styles.chipRow}>
            {DURATIONS.map((d) => {
              const selected = d.ms === duration.ms
              return (
                <Pressable
                  key={d.ms}
                  onPress={() => setDuration(d)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Card>

        <Card title="Start timer">
          <View style={styles.buttonRow}>
            <Button
              label="Start native"
              color={KIND_COLOR.native}
              onPress={() => start('native')}
            />
            <Button
              label="Start JS"
              color={KIND_COLOR.js}
              onPress={() => start('js')}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              label="Start both"
              color="#7c3aed"
              onPress={startBoth}
              wide
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              label="Cancel pending"
              color="#6b7280"
              onPress={cancelAll}
              disabled={pendingCount === 0}
            />
            <Button
              label="Clear log"
              color="#6b7280"
              onPress={clearLog}
              disabled={results.length === 0}
            />
          </View>
        </Card>

        <Card title={`Results (${results.length})`}>
          {results.length === 0 ? (
            <Text style={styles.empty}>No timers yet.</Text>
          ) : (
            results.map((r) => <ResultRow key={r.key} r={r} />)
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>
}

function Button({
  label,
  onPress,
  color,
  disabled,
  wide,
}: {
  label: string
  onPress: () => void
  color: string
  disabled?: boolean
  wide?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        wide && styles.buttonWide,
        { backgroundColor: color },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

function ResultRow({ r }: { r: TimerResult }) {
  return (
    <View style={styles.result}>
      <View style={styles.resultHeader}>
        <View style={[styles.kindDot, { backgroundColor: KIND_COLOR[r.kind] }]} />
        <Text style={styles.resultKind}>{KIND_LABEL[r.kind]}</Text>
        <Text style={styles.resultDuration}>{fmtDurationMs(r.durationMs)}</Text>
        {r.backgrounded ? (
          <Text style={styles.bgBadge}>bg</Text>
        ) : null}
      </View>
      <Text style={styles.resultLine}>
        started {fmtTime(r.startedAt)}  ·  expected {fmtTime(r.expectedAt)}
      </Text>
      {r.pending ? (
        <Text style={styles.resultPending}>pending…</Text>
      ) : (
        <Text style={styles.resultLine}>
          fired {fmtTime(r.firedAt!)}  ·  drift{' '}
          <Text
            style={
              Math.abs(r.driftMs!) > 1000
                ? styles.driftBig
                : styles.driftSmall
            }
          >
            {fmtDrift(r.driftMs!)}
          </Text>
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f5' },
  scroll: { padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subheader: { fontSize: 13, color: '#52525b', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { fontSize: 13, color: '#52525b' },
  value: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  valueActive: { color: '#16a34a' },
  valueInactive: { color: '#dc2626' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  chipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontSize: 13, color: '#27272a' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonWide: { flex: 1 },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { fontSize: 13, color: '#71717a', fontStyle: 'italic' },
  result: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  resultKind: { fontSize: 13, fontWeight: '600', flex: 1 },
  resultDuration: {
    fontSize: 12,
    color: '#52525b',
    fontVariant: ['tabular-nums'],
  },
  bgBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  resultLine: {
    fontSize: 12,
    color: '#3f3f46',
    fontVariant: ['tabular-nums'],
  },
  resultPending: { fontSize: 12, color: '#a16207', fontStyle: 'italic' },
  driftSmall: { color: '#16a34a', fontWeight: '600' },
  driftBig: { color: '#dc2626', fontWeight: '700' },
})
