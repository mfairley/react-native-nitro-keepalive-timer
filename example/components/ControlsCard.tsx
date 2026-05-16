import { StyleSheet, View } from 'react-native'

import { KIND_COLOR } from '../utils/constants'
import { Button } from './Button'
import { Card } from './Card'

export function ControlsCard({
  onStartNative,
  onStartJs,
  onStartBoth,
  onCancel,
  onClear,
  canCancel,
  canClear,
}: {
  onStartNative: () => void
  onStartJs: () => void
  onStartBoth: () => void
  onCancel: () => void
  onClear: () => void
  canCancel: boolean
  canClear: boolean
}) {
  return (
    <Card title="Start timer">
      <View style={styles.row}>
        <Button
          label="Start native"
          color={KIND_COLOR.native}
          onPress={onStartNative}
        />
        <Button label="Start JS" color={KIND_COLOR.js} onPress={onStartJs} />
      </View>
      <View style={styles.row}>
        <Button label="Start both" color="#7c3aed" onPress={onStartBoth} />
      </View>
      <View style={styles.row}>
        <Button
          label="Cancel pending"
          color="#6b7280"
          onPress={onCancel}
          disabled={!canCancel}
        />
        <Button
          label="Clear log"
          color="#6b7280"
          onPress={onClear}
          disabled={!canClear}
        />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
})
