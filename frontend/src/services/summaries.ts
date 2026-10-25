import type {
  GenerateSummaryInput,
  MockJournalEntryOption,
  Summary,
  SummaryInput,
} from '../types/summaries'
import { apiRequest } from './apiClient'

/**
 * Summaries API. All requests go through the shared client, so the session
 * cookie and CSRF header are reused. Only `generate` reaches Gemini, and it
 * does so via Django — never from the browser.
 */
export const summariesApi = {
  /** GET /api/summaries/ — the signed-in user's summaries. */
  list: () => apiRequest<Summary[]>('/api/summaries/'),

  /** POST /api/summaries/ — manual create; Django assigns the owner. */
  create: (input: SummaryInput) =>
    apiRequest<Summary>('/api/summaries/', { method: 'POST', body: input }),

  /** PATCH /api/summaries/{id}/ — update one owned summary. */
  update: (id: number, input: SummaryInput) =>
    apiRequest<Summary>(`/api/summaries/${id}/`, { method: 'PATCH', body: input }),

  /** DELETE /api/summaries/{id}/ — delete one owned summary. */
  remove: (id: number) => apiRequest<void>(`/api/summaries/${id}/`, { method: 'DELETE' }),

  /**
   * GET /api/summaries/mock-journal-entries/ — temporary Module 3 picker.
   * Returns only id/title/created_at; journal content stays on the server.
   */
  listMockJournalEntries: () =>
    apiRequest<MockJournalEntryOption[]>('/api/summaries/mock-journal-entries/'),

  /** POST /api/summaries/generate/ — summarize one mock journal entry. */
  generate: (input: GenerateSummaryInput) =>
    apiRequest<Summary>('/api/summaries/generate/', { method: 'POST', body: input }),
}
