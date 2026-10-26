import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AccessibilityPreferences,
  type TextSize,
  applyAccessibilityPreferences,
  describePreferenceChange,
  getDefaultAccessibilityPreferences,
  loadAccessibilityPreferences,
  nextTextSize,
  saveAccessibilityPreferences,
} from '../utils/accessibilityPreferences'
import { announce } from '../utils/announcements'

export interface AccessibilityPreferencesApi {
  preferences: AccessibilityPreferences
  setTextSize: (size: TextSize) => void
  /** A− → A → A+ → A−, used by the Alt+Shift+T shortcut. */
  cycleTextSize: () => void
  toggle: (key: ToggleableKey) => void
  reset: () => void
}

export type ToggleableKey = 'highContrast' | 'darkMode' | 'keyboardFocus' | 'screenReaderHelp'

/**
 * Owns the accessibility preferences: keeps them in state, mirrors them onto
 * `<html>` (that is what actually restyles the page), persists them, and
 * announces every change through the shared live region.
 *
 * Mounted by `components/AccessibilityWidget.tsx`; other modules read the
 * resulting `data-a11y-*` attributes through CSS, never through this hook.
 */
export function useAccessibilityPreferences(): AccessibilityPreferencesApi {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() =>
    loadAccessibilityPreferences(),
  )

  useEffect(() => {
    applyAccessibilityPreferences(preferences)
    saveAccessibilityPreferences(preferences)
  }, [preferences])

  // Announce what changed by diffing against the last announced snapshot: every
  // path (panel click, shortcut, reset) is covered, and nothing is announced on
  // the first render.
  const announced = useRef<AccessibilityPreferences>(preferences)
  useEffect(() => {
    const previous = announced.current
    if (previous === preferences) {
      return
    }
    const changed = (Object.keys(preferences) as (keyof AccessibilityPreferences)[]).filter(
      (key) => preferences[key] !== previous[key],
    )
    if (changed.length === 1) {
      announce(describePreferenceChange(changed[0], preferences))
    } else if (changed.length > 1) {
      announce('Accessibility settings reset')
    }
    announced.current = preferences
  }, [preferences])

  const setTextSize = useCallback((size: TextSize) => {
    setPreferences((current) => (current.textSize === size ? current : { ...current, textSize: size }))
  }, [])

  const cycleTextSize = useCallback(() => {
    setPreferences((current) => ({ ...current, textSize: nextTextSize(current.textSize) }))
  }, [])

  const toggle = useCallback((key: ToggleableKey) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const reset = useCallback(() => {
    // Back to what the system asked for, not blindly to light + A.
    setPreferences(getDefaultAccessibilityPreferences())
  }, [])

  return { preferences, setTextSize, cycleTextSize, toggle, reset }
}
