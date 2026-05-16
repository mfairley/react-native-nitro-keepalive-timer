import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

export function Card({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
})
