import { useCallback, useEffect, useState } from 'react'

/**
 * Accessibility preferences for the settings panel
 * (`components/AccessibilitySettingsDialog.tsx`).
 *
 * The hook is the single writer of the `data-*` attributes on `<html>`; all the
 * visual work happens in `styles/accessibility.css`. The same values are stored
 * under `a11y-settings` and re-applied by the inline script in `index.html`
 * before the first paint, so a refresh never flashes the default theme.
 *
 * This is deliberately separate from the legacy `useAccessibilityPreferences`
 * (key `memora:accessibility`, `data-a11y-*`): the two systems never share
 * storage or attributes, so neither can corrupt the other.
 */

export type TextSize = 'default' | 'large' | 'xl'

export interface AccessibilitySettings {
  textSize: TextSize
  highContrast: boolean
  dyslexia: boolean
  underlineLinks: boolean
}

export type ToggleableSetting = 'highContrast' | 'dyslexia' | 'underlineLinks'

export const ACCESSIBILITY_STORAGE_KEY = 'a11y-settings'

export const TEXT_SIZE_STEPS: readonly TextSize[] = ['default', 'large', 'xl']

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  default: 'Default',
  large: 'Large',
  xl: 'Extra large',
}

/** `matchMedia` is absent in some environments (older jsdom, SSR). */
function systemPrefersHighContrast(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia('(prefers-contrast: more)').matches
  } catch {
    return false
  }
}

/** First-visit defaults: honour the OS contrast request, everything else off. */
export function getDefaultAccessibilitySettings(): AccessibilitySettings {
  return {
    textSize: 'default',
    highContrast: systemPrefersHighContrast(),
    dyslexia: false,
    underlineLinks: false,
  }
}

function isTextSize(value: unknown): value is TextSize {
  return typeof value === 'string' && (TEXT_SIZE_STEPS as readonly string[]).includes(value)
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Reads and validates the saved settings. A missing, half-written or corrupt
 * entry falls back field by field instead of throwing, so a bad value in
 * localStorage can never leave the page unstyled or prevent the app from
 * mounting.
 */
export function loadAccessibilitySettings(): AccessibilitySettings {
  const defaults = getDefaultAccessibilitySettings()
  let raw: string | null = null
  try {
    raw = readStorage()?.getItem(ACCESSIBILITY_STORAGE_KEY) ?? null
  } catch {
    return defaults
  }
  if (!raw) {
    return defaults
  }
  try {
    const stored = JSON.parse(raw) as Partial<Record<keyof AccessibilitySettings, unknown>>
    if (!stored || typeof stored !== 'object') {
      return defaults
    }
    return {
      textSize: isTextSize(stored.textSize) ? stored.textSize : defaults.textSize,
      highContrast: flag(stored.highContrast, defaults.highContrast),
      dyslexia: flag(stored.dyslexia, defaults.dyslexia),
      underlineLinks: flag(stored.underlineLinks, defaults.underlineLinks),
    }
  } catch {
    return defaults
  }
}

export function saveAccessibilitySettings(settings: AccessibilitySettings): void {
  try {
    readStorage()?.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private mode or full quota: the session still works, it is just not remembered.
  }
}

/**
 * Mirrors the settings onto `<html>`. `data-text-size` is always present so the
 * CSS rule for the default size has a stable anchor; the boolean attributes are
 * removed when off, which keeps the inspected document readable.
 */
export function applyAccessibilitySettings(
  settings: AccessibilitySettings,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.textSize = settings.textSize
  setFlag(root, 'contrast', settings.highContrast ? 'high' : null)
  setFlag(root, 'dyslexia', settings.dyslexia ? 'true' : null)
  setFlag(root, 'underlineLinks', settings.underlineLinks ? 'true' : null)
}

function setFlag(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    delete root.dataset[name]
  } else {
    root.dataset[name] = value
  }
}

export interface UseAccessibilityApi {
  settings: AccessibilitySettings
  setTextSize: (size: TextSize) => void
  toggle: (key: ToggleableSetting) => void
  reset: () => void
}

export function useAccessibility(): UseAccessibilityApi {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    loadAccessibilitySettings(),
  )

  useEffect(() => {
    applyAccessibilitySettings(settings)
    saveAccessibilitySettings(settings)
  }, [settings])

  const setTextSize = useCallback((size: TextSize) => {
    setSettings((current) => (current.textSize === size ? current : { ...current, textSize: size }))
  }, [])

  const toggle = useCallback((key: ToggleableSetting) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const reset = useCallback(() => {
    // Back to what the system asked for, not blindly to "no contrast".
    setSettings(getDefaultAccessibilitySettings())
  }, [])

  return { settings, setTextSize, toggle, reset }
}
