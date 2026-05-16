import { StyleSheet, Text, View } from 'react-native'
import type { AppStateStatus } from 'react-native'

import { Card } from './Card'

export function AppStateCard({
  appState,
  pendingCount,
}: {
  appState: AppStateStatus
  pendingCount: number
}) {
  return (
    <Card title="App state">
      <View style={styles.row}>
        <Text style={styles.label}>Current</Text>
        <Text
          style={[
            styles.value,
            appState === 'active' ? styles.active : styles.inactive,
          ]}
        >
          {appState}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Pending timers</Text>
        <Text style={styles.value}>{pendingCount}</Text>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { fontSize: 13, color: '#52525b' },
  value: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  active: { color: '#16a34a' },
  inactive: { color: '#dc2626' },
})
