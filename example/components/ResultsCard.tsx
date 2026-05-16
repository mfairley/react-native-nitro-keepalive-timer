import { StyleSheet, Text } from 'react-native'

import type { TimerResult } from '../utils/types'
import { Card } from './Card'
import { ResultRow } from './ResultRow'

export function ResultsCard({ results }: { results: TimerResult[] }) {
  return (
    <Card title={`Results (${results.length})`}>
      {results.length === 0 ? (
        <Text style={styles.empty}>No timers yet.</Text>
      ) : (
        results.map((r) => <ResultRow key={r.key} r={r} />)
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, color: '#71717a', fontStyle: 'italic' },
})
