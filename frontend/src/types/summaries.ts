/** Shapes returned by the summaries API (apps/summaries/serializers.py). */
export interface Summary {
  id: number
  owner: number
  journal_entry_id: number | null
  summary_text: string
  mood: string
  themes: string[]
  illustration_prompt: string
  created_at: string
  updated_at: string
}

/** Payload for manual create/update. `owner` is assigned by Django. */
export interface SummaryInput {
  journal_entry_id: number | null
  summary_text: string
  mood: string
  themes: string[]
  illustration_prompt: string
}

/** Generation accepts only a Module 1 journal entry ID; content stays server-side. */
export interface GenerateSummaryInput {
  journal_entry_id: number
}

/** Fields the backend checks when ranking a search hit. */
export type SummarySearchField = 'themes' | 'summary_text' | 'mood'

/** One scored result from GET /api/summaries/search/. */
export interface SummarySearchHit {
  summary: Summary
  score: number
  matched_fields: SummarySearchField[]
  matched_terms: string[]
  snippet: string
}

/** PageNumberPagination envelope returned by the summaries search endpoint. */
export interface SummarySearchPage {
  count: number
  next: string | null
  previous: string | null
  results: SummarySearchHit[]
}

export interface SummarySearchParams {
  q: string
  page?: number
  page_size?: number
}
