import type { BookPreferences } from '../types/bookPreferences'
import { apiRequest } from './apiClient'

const BOOK_PREFERENCES_PATH = '/api/summaries/book-preferences/'

/**
 * Per-user memory-book customization. The backend derives the owner from the
 * session and only accepts the three known style identifiers.
 */
export const bookPreferencesApi = {
  get: () => apiRequest<BookPreferences>(BOOK_PREFERENCES_PATH),

  save: (input: BookPreferences) =>
    apiRequest<BookPreferences>(BOOK_PREFERENCES_PATH, {
      method: 'PUT',
      body: input,
    }),

  reset: () =>
    apiRequest<BookPreferences>(BOOK_PREFERENCES_PATH, { method: 'DELETE' }),
}
