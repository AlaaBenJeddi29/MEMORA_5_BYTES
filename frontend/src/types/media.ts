/** Shapes returned by the Module 4 media API (docs/API_CONTRACT.md §3.5). */

export type MediaType = 'original' | 'ai_generated'

export type MediaStatus = 'pending' | 'processing' | 'succeeded' | 'failed'

export interface MediaItem {
  id: number
  file: string
  media_type: MediaType
  prompt: string
  status: MediaStatus
  journal_entry_id: number | null
  created_at: string
  updated_at: string
}

/** Read-only sample memory from GET /api/media/mock-journal-entries/. */
export interface MockJournalEntry {
  id: number
  title: string
  content: string
  created_at: string
}

export interface GenerateImageInput {
  prompt?: string
  journal_entry_id?: number
  width?: number
  height?: number
  steps?: number
  seed?: number
}

export interface UpdateMediaInput {
  prompt: string
}
