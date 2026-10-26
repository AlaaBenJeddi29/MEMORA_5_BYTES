import { describe, expect, it } from 'vitest'

import type { BookPreferences } from '../../types/bookPreferences'
import {
  bookThemeClassName,
  DEFAULT_BOOK_PREFERENCES,
  normalizeBookPreferences,
} from './bookThemes'

describe('normalizeBookPreferences', () => {
  it('returns safe defaults for missing or malformed payloads', () => {
    expect(normalizeBookPreferences(null)).toEqual(DEFAULT_BOOK_PREFERENCES)
    expect(normalizeBookPreferences(undefined)).toEqual(DEFAULT_BOOK_PREFERENCES)
    expect(normalizeBookPreferences('night')).toEqual(DEFAULT_BOOK_PREFERENCES)
    expect(normalizeBookPreferences({})).toEqual(DEFAULT_BOOK_PREFERENCES)
  })

  it('accepts the known identifiers', () => {
    const preferences: BookPreferences = {
      cover_style: 'memories',
      theme_id: 'blush',
      font_style: 'handwritten',
    }

    expect(normalizeBookPreferences(preferences)).toEqual(preferences)
  })

  it('falls back per field so one unknown value keeps the other choices', () => {
    expect(
      normalizeBookPreferences({
        cover_style: 'plaid',
        theme_id: 'ocean',
        font_style: 'gothic',
      }),
    ).toEqual({
      cover_style: DEFAULT_BOOK_PREFERENCES.cover_style,
      theme_id: 'ocean',
      font_style: DEFAULT_BOOK_PREFERENCES.font_style,
    })
  })

  it('rejects values that are not identifiers', () => {
    expect(
      normalizeBookPreferences({
        cover_style: 42,
        theme_id: ['night'],
        font_style: null,
      }),
    ).toEqual(DEFAULT_BOOK_PREFERENCES)
  })
})

describe('bookThemeClassName', () => {
  it('returns the three scopes shared by the book and its preview', () => {
    expect(
      bookThemeClassName({
        cover_style: 'nature',
        theme_id: 'night',
        font_style: 'modern',
      }),
    ).toBe(
      'book-theme--night book-font--modern book-cover-style--nature',
    )
  })
})
