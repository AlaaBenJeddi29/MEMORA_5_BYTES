import { useCallback, useEffect, useState } from 'react'

import { companionApi } from '../../services/companion'
import { normalizeApiError } from '../../services/errors'
import type { CompanionVoicePreference } from '../../types/companion'
import {
  DEFAULT_COMPANION_VOICE,
  normalizeCompanionVoicePreference,
} from './voice'

export type VoiceSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function samePreferences(
  left: CompanionVoicePreference,
  right: CompanionVoicePreference,
): boolean {
  return (
    left.gender === right.gender &&
    left.language === right.language &&
    left.rate === right.rate
  )
}

/**
 * Loads and saves the signed-in user's portable voice settings. A failed load
 * never blocks the companion: safe defaults are used and saving stays possible.
 */
export function useCompanionVoicePreferences() {
  const [preferences, setPreferences] = useState<CompanionVoicePreference>(
    DEFAULT_COMPANION_VOICE,
  )
  const [savedPreferences, setSavedPreferences] = useState<CompanionVoicePreference>(
    DEFAULT_COMPANION_VOICE,
  )
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveStatus, setSaveStatus] = useState<VoiceSaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    companionApi
      .voicePreferences()
      .then((data) => {
        if (!active) {
          return
        }
        const normalized = normalizeCompanionVoicePreference(data)
        setPreferences(normalized)
        setSavedPreferences(normalized)
      })
      .catch(() => {
        if (active) {
          setPreferences(DEFAULT_COMPANION_VOICE)
          setSavedPreferences(DEFAULT_COMPANION_VOICE)
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const update = useCallback((patch: Partial<CompanionVoicePreference>) => {
    setPreferences((current) =>
      normalizeCompanionVoicePreference({ ...current, ...patch }),
    )
    setSaveStatus('idle')
    setSaveError(null)
  }, [])

  const save = useCallback(async () => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const saved = normalizeCompanionVoicePreference(
        await companionApi.saveVoicePreferences(preferences),
      )
      setPreferences(saved)
      setSavedPreferences(saved)
      setSaveStatus('saved')
    } catch (error) {
      const normalized = normalizeApiError(error)
      setSaveError(
        normalized.detail ??
          normalized.formErrors[0] ??
          'Impossible d’enregistrer vos préférences pour le moment.',
      )
      setSaveStatus('error')
    }
  }, [preferences])

  return {
    preferences,
    loading,
    loadFailed,
    save,
    saveError,
    saveStatus,
    update,
    isDirty: !samePreferences(preferences, savedPreferences),
  }
}
