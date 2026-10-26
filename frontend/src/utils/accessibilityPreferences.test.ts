import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  A11Y_ATTRIBUTES,
  DEFAULT_PREFERENCES,
  STORAGE_KEY,
  type AccessibilityPreferences,
  applyAccessibilityPreferences,
  describePreferenceChange,
  getDefaultAccessibilityPreferences,
  loadAccessibilityPreferences,
  nextTextSize,
  saveAccessibilityPreferences,
} from './accessibilityPreferences'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? matches : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

function clearA11yAttributes() {
  for (const name of Object.values(A11Y_ATTRIBUTES)) {
    delete document.documentElement.dataset[name]
  }
}

beforeEach(() => {
  localStorage.clear()
  clearA11yAttributes()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearA11yAttributes()
})

describe('loadAccessibilityPreferences', () => {
  it('returns the defaults when nothing was saved', () => {
    expect(loadAccessibilityPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('reads back what was saved', () => {
    const saved: AccessibilityPreferences = {
      textSize: 'lg',
      highContrast: true,
      darkMode: true,
      keyboardFocus: false,
      screenReaderHelp: true,
    }
    saveAccessibilityPreferences(saved)
    expect(loadAccessibilityPreferences()).toEqual(saved)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(saved)
  })

  it('ignores a corrupt entry instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all')
    expect(loadAccessibilityPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('falls back field by field on an unknown or partial payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: 'huge', darkMode: true }))
    expect(loadAccessibilityPreferences()).toEqual({
      ...DEFAULT_PREFERENCES,
      textSize: 'md',
      darkMode: true,
    })
  })

  it('starts from what the system asks for', () => {
    stubMatchMedia(true)
    expect(getDefaultAccessibilityPreferences().darkMode).toBe(true)
    expect(loadAccessibilityPreferences().darkMode).toBe(true)
  })

  it('survives a storage that cannot be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadAccessibilityPreferences()).toEqual(DEFAULT_PREFERENCES)
    getItem.mockRestore()
  })
})

describe('saveAccessibilityPreferences', () => {
  it('never throws when the quota is full', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveAccessibilityPreferences(DEFAULT_PREFERENCES)).not.toThrow()
    setItem.mockRestore()
  })
})

describe('applyAccessibilityPreferences', () => {
  it('writes an attribute per active preference on <html>', () => {
    applyAccessibilityPreferences({
      textSize: 'lg',
      highContrast: true,
      darkMode: true,
      keyboardFocus: true,
      screenReaderHelp: true,
    })

    const { dataset } = document.documentElement
    expect(dataset[A11Y_ATTRIBUTES.textSize]).toBe('lg')
    expect(dataset[A11Y_ATTRIBUTES.contrast]).toBe('high')
    expect(dataset[A11Y_ATTRIBUTES.theme]).toBe('dark')
    expect(dataset[A11Y_ATTRIBUTES.focus]).toBe('enhanced')
    expect(dataset[A11Y_ATTRIBUTES.screenReader]).toBe('on')
  })

  it('removes the attributes of the defaults so the document stays clean', () => {
    applyAccessibilityPreferences({ ...DEFAULT_PREFERENCES, darkMode: true })
    expect(document.documentElement.dataset[A11Y_ATTRIBUTES.theme]).toBe('dark')

    applyAccessibilityPreferences(DEFAULT_PREFERENCES)
    for (const name of Object.values(A11Y_ATTRIBUTES)) {
      expect(document.documentElement.dataset[name]).toBeUndefined()
    }
  })
})

describe('nextTextSize', () => {
  it('cycles A− → A → A+ → A−', () => {
    expect(nextTextSize('sm')).toBe('md')
    expect(nextTextSize('md')).toBe('lg')
    expect(nextTextSize('lg')).toBe('sm')
  })
})

describe('describePreferenceChange', () => {
  it('names the new value, not the option only', () => {
    expect(describePreferenceChange('textSize', { ...DEFAULT_PREFERENCES, textSize: 'lg' })).toBe(
      'Text size A+',
    )
    expect(
      describePreferenceChange('highContrast', { ...DEFAULT_PREFERENCES, highContrast: false }),
    ).toBe('High contrast off')
  })
})
