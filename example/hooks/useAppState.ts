import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/** Tracks the current AppState ('active' | 'background' | 'inactive'). */
export function useAppState(): AppStateStatus {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    const sub = AppState.addEventListener('change', setState)
    return () => sub.remove()
  }, [])
  return state
}
