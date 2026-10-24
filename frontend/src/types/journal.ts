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
