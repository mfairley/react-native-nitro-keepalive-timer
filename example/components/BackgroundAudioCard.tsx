import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { Card } from './Card'

export function BackgroundAudioCard({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <Card title="Hold app alive (silent audio)">
      <Pressable
        onPress={() => onToggle(!active)}
        style={styles.row}
        hitSlop={8}
      >
        <View style={styles.copy}>
          <Text style={styles.label}>
            {active ? 'Audio session active' : 'Audio session off'}
          </Text>
          <Text style={styles.hint}>
            Plays a silent looped buffer so iOS keeps the app running past
            the ~30s background budget. Turn on, lock the screen, and the
            native timer should fire on time even while backgrounded.
          </Text>
        </View>
        <Switch value={active} onValueChange={onToggle} />
      </Pressable>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  hint: { fontSize: 11, color: '#71717a', lineHeight: 16 },
})
