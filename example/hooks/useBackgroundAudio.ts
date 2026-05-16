import { useAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { useEffect } from 'react'

const SILENT_SOURCE = require('../assets/silent.wav')

/**
 * Plays a silent looped buffer when `active` is true, configured to keep
 * playing while backgrounded. iOS treats this as a live audio session and
 * grants the app indefinite background runtime — exactly what a LiveKit /
 * VoIP call would get, without the CallKit setup.
 */
export function useBackgroundAudio(active: boolean): void {
  const player = useAudioPlayer(SILENT_SOURCE)

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // Use the ambient interruption mode so we don't fight with other audio.
      interruptionMode: 'mixWithOthers',
    }).catch((e) => console.warn('[useBackgroundAudio] setAudioModeAsync', e))
  }, [])

  useEffect(() => {
    if (!player) return
    player.loop = true
    player.volume = 0
    if (active) {
      player.play()
    } else {
      player.pause()
      player.seekTo(0)
    }
  }, [player, active])
}
