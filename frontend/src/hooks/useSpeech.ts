import { useCallback, useEffect, useSyncExternalStore } from 'react'

import {
  type SpeakRequest,
  type SpeechState,
  cancelSpeech,
  getSpeechState,
  isSpeechSupported,
  pauseSpeech,
  resumeSpeech,
  speak,
  stopSpeech,
  subscribeToSpeech,
} from '../utils/speech'

export interface SpeechApi {
  state: SpeechState
  /** False when `speechSynthesis` is missing — the controls say so instead of failing silently. */
  supported: boolean
  /** True while this specific text (transcript or summary of one memo) is being read. */
  isReading: (key: string) => boolean
  isPaused: (key: string) => boolean
  start: (request: SpeakRequest) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

/**
 * React view on the single read-aloud speaker (`utils/speech.ts`). Any number of
 * components can call it; they all see the same state, which is what keeps two
 * cards from reading at the same time.
 */
export function useSpeech(): SpeechApi {
  const state = useSyncExternalStore(subscribeToSpeech, getSpeechState, getSpeechState)
  const supported = isSpeechSupported()

  const isReading = useCallback(
    (key: string) => state.key === key && state.status !== 'idle',
    [state.key, state.status],
  )

  const isPaused = useCallback(
    (key: string) => state.key === key && state.status === 'paused',
    [state.key, state.status],
  )

  const start = useCallback((request: SpeakRequest) => speak(request), [])
  const pause = useCallback(() => pauseSpeech(), [])
  const resume = useCallback(() => resumeSpeech(), [])
  const stop = useCallback(() => stopSpeech(), [])

  return { state, supported, isReading, isPaused, start, pause, resume, stop }
}

/** Silence when leaving the page that started the reading. */
export function useStopSpeechOnLeave(): void {
  // Returning `cancelSpeech` makes it the unmount cleanup only; nothing is
  // playing on the first mount, so StrictMode's double mount is harmless.
  useEffect(() => cancelSpeech, [])
}
