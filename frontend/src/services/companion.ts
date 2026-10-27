import type {
  CompanionAnswer,
  CompanionQuestionInput,
  EmotionalPatterns,
} from '../types/companion'
import { apiRequest } from './apiClient'

/**
 * AI Memory Companion API. Both requests are owner-scoped by Django. The
 * Gemini key and memory selection stay on the server; the browser only sends
 * the question and receives validated answers and references.
 */
export const companionApi = {
  /** POST /api/summaries/companion/ — answer from the caller's own summaries. */
  ask: (input: CompanionQuestionInput, options: { signal?: AbortSignal } = {}) =>
    apiRequest<CompanionAnswer>('/api/summaries/companion/', {
      method: 'POST',
      body: input,
      signal: options.signal,
    }),

  /** GET /api/summaries/patterns/ — read-only counts of stored fields. */
  patterns: (options: { signal?: AbortSignal } = {}) =>
    apiRequest<EmotionalPatterns>('/api/summaries/patterns/', {
      signal: options.signal,
    }),
}
