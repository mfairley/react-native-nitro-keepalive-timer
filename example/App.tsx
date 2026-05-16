import { StatusBar } from 'expo-status-bar'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { AppStateCard } from './components/AppStateCard'
import { BackgroundAudioCard } from './components/BackgroundAudioCard'
import { ControlsCard } from './components/ControlsCard'
import { DurationCard, type Duration } from './components/DurationCard'
import { ResultsCard } from './components/ResultsCard'
import { useAppState } from './hooks/useAppState'
import { useBackgroundAudio } from './hooks/useBackgroundAudio'
import { useTimerRunner } from './hooks/useTimerRunner'
import { DURATIONS } from './utils/constants'

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  )
}

function Screen() {
  const appState = useAppState()
  const [duration, setDuration] = useState<Duration>(DURATIONS[2]) // 1m
  const [holdAlive, setHoldAlive] = useState(false)
  const runner = useTimerRunner(appState)
  useBackgroundAudio(holdAlive)

  const startNative = useCallback(
    () => runner.start('native', duration.ms),
    [runner, duration]
  )
  const startJs = useCallback(
    () => runner.start('js', duration.ms),
    [runner, duration]
  )
  const startBoth = useCallback(
    () => runner.startBoth(duration.ms),
    [runner, duration]
  )

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.header}>Keepalive Timer Drift Test</Text>
        <Text style={styles.subheader}>
          Lock the screen after starting a timer to see how each kind drifts.
        </Text>

        <AppStateCard appState={appState} pendingCount={runner.pendingCount} />
        <BackgroundAudioCard active={holdAlive} onToggle={setHoldAlive} />
        <DurationCard selected={duration} onSelect={setDuration} />
        <ControlsCard
          onStartNative={startNative}
          onStartJs={startJs}
          onStartBoth={startBoth}
          onCancel={runner.cancelAll}
          onClear={runner.clearLog}
          canCancel={runner.pendingCount > 0}
          canClear={runner.results.length > 0}
        />
        <ResultsCard results={runner.results} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f5' },
  scroll: { padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subheader: { fontSize: 13, color: '#52525b', marginBottom: 16 },
})
