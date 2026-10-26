import type { JournalEntry } from '../types/journal'
import { apiRequest } from './apiClient'

const BASE = '/api/journal/entries/'

export interface AdvancedSearchRequest {
  query: string
  date_from?: string
  date_to?: string
  sentiment?: string
  use_ai?: boolean
  page?: number
}

export interface AdvancedSearchResponse {
  results: JournalEntry[]
  total: number
  ai_analysis?: {
    query: string
    extracted_sentiments: string[]
    extracted_themes: string[]
    summary: string
  }
}

export const advancedSearchApi = {
  search: (params: AdvancedSearchRequest) =>
    apiRequest<AdvancedSearchResponse>(
      `${BASE}advanced-search/`,
      {
        method: 'POST',
        body: params,
      }
    ),
}
