/**
 * Accessibility preferences — the single source of truth behind the floating
 * accessibility widget (`components/AccessibilityWidget.tsx`).
 *
 * The widget is only a control panel: every option is turned into an attribute
 * on `<html>` (`data-a11y-*`) and the real work is done in CSS
 * (`styles/global.css`, section "Accessibility"), which overrides the design
 * tokens. That is what makes the options change the page itself — not just the
 * menu — and why the preferences are applied at boot in `main.tsx`: a saved
 * dark theme must already be on screen for the very first paint after a
 * refresh.
 *
 * Nothing here throws when storage is unavailable (private mode, tests, SSR).
 */

export type TextSize = 'sm' | 'md' | 'lg'

export interface AccessibilityPreferences {
  /** A− / A / A+ — scales the root font size, so every rem-based token scales. */
  textSize: TextSize
  /** High contrast: black-on-white tokens, 2px borders, no soft backgrounds. */
  highContrast: boolean
  /** Dark mode: dark surface tokens with AA-contrast text. */
  darkMode: boolean
  /** Focus highlight: a thick outline on every focused control, not only on keyboard focus. */
  keyboardFocus: boolean
  /** Screen-reader support: mirror important messages in a polite live region. */
  screenReaderHelp: boolean
}

export const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  textSize: 'md',
  highContrast: false,
  darkMode: false,
  keyboardFocus: false,
  screenReaderHelp: false,
}

export const STORAGE_KEY = 'memora:accessibility'

/** Cycle order for the "A− / A / A+" control and its Alt+Shift+T shortcut. */
export const TEXT_SIZE_STEPS: readonly TextSize[] = ['sm', 'md', 'lg']

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  sm: 'A−',
  md: 'A',
  lg: 'A+',
}

/** Attribute names, kept here so the CSS and the tests read the same contract. */
export const A11Y_ATTRIBUTES = {
  textSize: 'a11yTextSize',
  contrast: 'a11yContrast',
  theme: 'a11yTheme',
  focus: 'a11yFocus',
  screenReader: 'a11yScreenReader',
} as const

function prefersDarkScheme(): boolean {
  return matchesMedia('(prefers-color-scheme: dark)')
}

function prefersMoreContrast(): boolean {
  return matchesMedia('(prefers-contrast: more)') || matchesMedia('(forced-colors: active)')
}

/** `window.matchMedia` is missing in some environments (older jsdom, SSR). */
function matchesMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/**
 * Starting point for a first-time visitor: the system already asked for a dark
 * scheme or for more contrast, so honour it instead of forcing light-on-white.
 */
export function getDefaultAccessibilityPreferences(): AccessibilityPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    highContrast: prefersMoreContrast(),
    darkMode: prefersDarkScheme(),
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
 * Reads and validates the saved preferences. Unknown or half-written payloads
 * fall back to the defaults field by field rather than throwing — a broken
 * entry in localStorage must never leave the page unstyled or unmounted.
 */
export function loadAccessibilityPreferences(): AccessibilityPreferences {
  const defaults = getDefaultAccessibilityPreferences()
  let raw: string | null = null
  try {
    raw = readStorage()?.getItem(STORAGE_KEY) ?? null
  } catch {
    return defaults
  }
  if (!raw) {
    return defaults
  }
  try {
    const stored = JSON.parse(raw) as Partial<Record<keyof AccessibilityPreferences, unknown>>
    if (!stored || typeof stored !== 'object') {
      return defaults
    }
    return {
      textSize: isTextSize(stored.textSize) ? stored.textSize : defaults.textSize,
      highContrast: flag(stored.highContrast, defaults.highContrast),
      darkMode: flag(stored.darkMode, defaults.darkMode),
      keyboardFocus: flag(stored.keyboardFocus, defaults.keyboardFocus),
      screenReaderHelp: flag(stored.screenReaderHelp, defaults.screenReaderHelp),
    }
  } catch {
    return defaults
  }
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences): void {
  try {
    readStorage()?.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Quota or privacy mode: the session still works, it just is not remembered.
  }
}

/**
 * Reflects the preferences onto `<html>`. CSS does the visual work; here we
 * only keep the attributes in sync, and remove them when an option is at its
 * default so the inspected document stays readable.
 */
export function applyAccessibilityPreferences(
  preferences: AccessibilityPreferences,
  root: HTMLElement = document.documentElement,
): void {
  set(root, A11Y_ATTRIBUTES.textSize, preferences.textSize === 'md' ? null : preferences.textSize)
  set(root, A11Y_ATTRIBUTES.contrast, preferences.highContrast ? 'high' : null)
  set(root, A11Y_ATTRIBUTES.theme, preferences.darkMode ? 'dark' : null)
  set(root, A11Y_ATTRIBUTES.focus, preferences.keyboardFocus ? 'enhanced' : null)
  set(root, A11Y_ATTRIBUTES.screenReader, preferences.screenReaderHelp ? 'on' : null)
}

function set(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    delete root.dataset[name]
  } else {
    root.dataset[name] = value
  }
}

/**
 * Boot helper: apply whatever was saved before React renders, so a refresh in
 * dark mode does not flash a white page first.
 */
export function initAccessibilityPreferences(): AccessibilityPreferences {
  const preferences = loadAccessibilityPreferences()
  applyAccessibilityPreferences(preferences)
  return preferences
}

export function nextTextSize(current: TextSize): TextSize {
  const index = TEXT_SIZE_STEPS.indexOf(current)
  return TEXT_SIZE_STEPS[(index + 1) % TEXT_SIZE_STEPS.length]
}

/**
 * Short, plain sentence describing what changed — read out by the live region
 * when screen-reader support is on, and shown as a caption in the panel.
 */
export function describePreferenceChange(
  key: keyof AccessibilityPreferences,
  preferences: AccessibilityPreferences,
): string {
  switch (key) {
    case 'textSize':
      return `Text size ${TEXT_SIZE_LABELS[preferences.textSize]}`
    case 'highContrast':
      return `High contrast ${preferences.highContrast ? 'on' : 'off'}`
    case 'darkMode':
      return `Dark mode ${preferences.darkMode ? 'on' : 'off'}`
    case 'keyboardFocus':
      return `Visible focus ${preferences.keyboardFocus ? 'on' : 'off'}`
    case 'screenReaderHelp':
      return `Screen-reader announcements ${preferences.screenReaderHelp ? 'on' : 'off'}`
    default:
      return 'Accessibility settings updated'
  }
}
