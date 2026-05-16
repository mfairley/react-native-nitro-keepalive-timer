import { Pressable, StyleSheet, Text, View } from 'react-native'

import { DURATIONS } from '../utils/constants'
import { Card } from './Card'

export type Duration = (typeof DURATIONS)[number]

export function DurationCard({
  selected,
  onSelect,
}: {
  selected: Duration
  onSelect: (d: Duration) => void
}) {
  return (
    <Card title="Duration">
      <View style={styles.row}>
        {DURATIONS.map((d) => {
          const active = d.ms === selected.ms
          return (
            <Pressable
              key={d.ms}
              onPress={() => onSelect(d)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.text, active && styles.textActive]}>
                {d.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  chipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  text: { fontSize: 13, color: '#27272a' },
  textActive: { color: '#fff', fontWeight: '600' },
})
