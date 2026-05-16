import { Pressable, StyleSheet, Text } from 'react-native'

export function Button({
  label,
  onPress,
  color,
  disabled,
}: {
  label: string
  onPress: () => void
  color: string
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
