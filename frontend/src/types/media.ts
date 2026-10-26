/** Shapes returned by the Module 4 media API (docs/API_CONTRACT.md §3.5). */

export type MediaType = 'original' | 'ai_generated'

export type MediaStatus = 'pending' | 'processing' | 'succeeded' | 'failed'

/** Minimal real journal context returned beside a media item. */
export interface MediaJournalEntryRef {
  id: number
  title: string
}

export interface MediaItem {
  id: number
  file: string
  media_type: MediaType
  prompt: string
  status: MediaStatus
  is_favorite: boolean
  journal_entry_id: number | null
  journal_entries: MediaJournalEntryRef[]
  summary_id: number | null
  collection_ids: number[]
  provider: string
  model: string
  created_at: string
  updated_at: string
}

export interface MediaCollection {
  id: number
  name: string
  description: string
  item_count: number
  created_at: string
  updated_at: string
}

export interface MediaCollectionDetail extends MediaCollection {
  items: MediaItem[]
}

export interface CollectionInput {
  name: string
  description?: string
}

export interface GenerateImageInput {
  prompt?: string
  journal_entry_id?: number
  summary_id?: number
  width?: number
  height?: number
  steps?: number
  seed?: number
}

export interface UpdateMediaInput {
  prompt: string
}
