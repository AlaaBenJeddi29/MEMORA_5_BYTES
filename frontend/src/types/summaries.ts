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
