import { useEffect, useState } from 'react'

import { isSpeechSupported } from '../../utils/speech'

/**
 * Device voices load asynchronously in most browsers. This hook refreshes the
 * list on `voiceschanged` so the settings panel can name the real device voice
 * instead of guessing.
 */
export function useBrowserVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (!isSpeechSupported()) {
      return
    }
    const synth = window.speechSynthesis
    let active = true

    const read = () => {
      if (!active) {
        return
      }
      try {
        setVoices(synth.getVoices())
      } catch {
        setVoices([])
      }
    }

    read()
    try {
      synth.addEventListener('voiceschanged', read)
    } catch {
      synth.onvoiceschanged = read
    }

    return () => {
      active = false
      try {
        synth.removeEventListener('voiceschanged', read)
      } catch {
        // Older engines expose onvoiceschanged only.
      }
      if (synth.onvoiceschanged === read) {
        synth.onvoiceschanged = null
      }
    }
  }, [])

  return voices
}
