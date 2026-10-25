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

/** Generation accepts only a journal entry ID; content stays server-side. */
export interface GenerateSummaryInput {
  journal_entry_id: number
}

/**
 * Safe picker shape from GET /api/summaries/mock-journal-entries/.
 * Temporary Module 3 fixtures; no journal content is returned.
 */
export interface MockJournalEntryOption {
  id: number
  title: string
  created_at: string
}
