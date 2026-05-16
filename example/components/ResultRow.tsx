import { StyleSheet, Text, View } from 'react-native'

import { KIND_COLOR, KIND_LABEL } from '../utils/constants'
import { fmtDrift, fmtDurationMs, fmtTime } from '../utils/format'
import type { TimerResult } from '../utils/types'

export function ResultRow({ r }: { r: TimerResult }) {
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: KIND_COLOR[r.kind] }]} />
        <Text style={styles.kind}>{KIND_LABEL[r.kind]}</Text>
        <Text style={styles.duration}>{fmtDurationMs(r.durationMs)}</Text>
        {r.backgrounded ? <Text style={styles.bgBadge}>bg</Text> : null}
      </View>
      <Text style={styles.line}>
        started {fmtTime(r.startedAt)}  ·  expected {fmtTime(r.expectedAt)}
      </Text>
      {r.pending ? (
        <Text style={styles.pending}>pending…</Text>
      ) : (
        <Text style={styles.line}>
          fired {fmtTime(r.firedAt!)}  ·  drift{' '}
          <Text
            style={Math.abs(r.driftMs!) > 1000 ? styles.driftBig : styles.driftSmall}
          >
            {fmtDrift(r.driftMs!)}
          </Text>
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kind: { fontSize: 13, fontWeight: '600', flex: 1 },
  duration: {
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
  line: { fontSize: 12, color: '#3f3f46', fontVariant: ['tabular-nums'] },
  pending: { fontSize: 12, color: '#a16207', fontStyle: 'italic' },
  driftSmall: { color: '#16a34a', fontWeight: '600' },
  driftBig: { color: '#dc2626', fontWeight: '700' },
})
