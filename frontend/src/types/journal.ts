export interface JournalEntry {
  id: number
  user: number
  title: string
  text: string
  audio_file: string
  summary_text: string
  sentiment: string
  created_at: string  // ISO-8601
  photos: number[]
}

export interface JournalEntryInput {
  title: string
  text: string
  audio_file?: string
  summary_text?: string
  sentiment?: string
}

export interface JournalPage {
  count: number
  next: string | null
  previous: string | null
  results: JournalEntry[]
}

export interface JournalSearchParams {
  q?: string
  date_from?: string
  date_to?: string
  page?: number
}

export interface AdvancedSearchParams {
  query?: string
  date_from?: string
  date_to?: string
  sentiment?: string
  use_ai?: boolean
  isAdvanced?: boolean
}

export interface AiAnalysis {
  query: string
  extracted_sentiments: string[]
  extracted_themes: string[]
  summary: string
}

export interface AdvancedSearchResult {
  results: JournalEntry[]
  total: number
  ai_analysis?: AiAnalysis
}
