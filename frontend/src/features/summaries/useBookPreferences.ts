import { useCallback, useEffect, useState } from 'react'

import { bookPreferencesApi } from '../../services/bookPreferences'
import type { BookPreferences } from '../../types/bookPreferences'
import {
  DEFAULT_BOOK_PREFERENCES,
  normalizeBookPreferences,
} from './bookThemes'

export type BookPreferencesStatus = 'loading' | 'ready'

/**
 * Loads the signed-in user's book customization once per page visit. A failed
 * or unknown payload falls back to safe defaults instead of blocking the book.
 */
export function useBookPreferences() {
  const [preferences, setPreferences] = useState<BookPreferences>(
    DEFAULT_BOOK_PREFERENCES,
  )
  const [status, setStatus] = useState<BookPreferencesStatus>('loading')

  useEffect(() => {
    let active = true

    bookPreferencesApi
      .get()
      .then((data) => {
        if (active) {
          setPreferences(normalizeBookPreferences(data))
          setStatus('ready')
        }
      })
      .catch(() => {
        if (active) {
          setPreferences(DEFAULT_BOOK_PREFERENCES)
          setStatus('ready')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const apply = useCallback((next: BookPreferences) => {
    setPreferences(normalizeBookPreferences(next))
  }, [])

  return { preferences, status, apply }
}
