import type { Summary, SummaryInput } from '../../types/summaries'

// Mirrors the backend limits in apps/summaries/models.py and services/gemini.py.
export const MAX_SUMMARY_TEXT_LENGTH = 4_000
export const MAX_MOOD_LENGTH = 32
export const MAX_THEMES = 8
export const MAX_THEME_LENGTH = 64
export const MAX_ILLUSTRATION_PROMPT_LENGTH = 1_000

/** Raw form state; themes and the entry ID stay as text until validated. */
export interface SummaryFormValues {
  summary_text: string
  mood: string
  themes: string
  illustration_prompt: string
  journal_entry_id: string
}

export interface SummaryFormValidation {
  /** Field name → message, using the same keys as the API. */
  errors: Record<string, string>
  /** Present only when there are no errors. */
  input?: SummaryInput
}

export function emptySummaryFormValues(): SummaryFormValues {
  return {
    summary_text: '',
    mood: '',
    themes: '',
    illustration_prompt: '',
    journal_entry_id: '',
  }
}

export function summaryToFormValues(summary: Summary): SummaryFormValues {
  return {
    summary_text: summary.summary_text,
    mood: summary.mood,
    themes: summary.themes.join(', '),
    illustration_prompt: summary.illustration_prompt,
    journal_entry_id: summary.journal_entry_id === null ? '' : String(summary.journal_entry_id),
  }
}

export function parseThemes(value: string): string[] {
  return value
    .split(',')
    .map((theme) => theme.trim())
    .filter(Boolean)
}

export function validateSummaryForm(values: SummaryFormValues): SummaryFormValidation {
  const errors: Record<string, string> = {}

  const summaryText = values.summary_text.trim()
  const mood = values.mood.trim()
  const illustrationPrompt = values.illustration_prompt.trim()
  const themes = parseThemes(values.themes)
  const entryIdText = values.journal_entry_id.trim()

  if (!summaryText) {
    errors.summary_text = 'Summary text is required.'
  } else if (summaryText.length > MAX_SUMMARY_TEXT_LENGTH) {
    errors.summary_text = `Keep the summary to ${MAX_SUMMARY_TEXT_LENGTH} characters or fewer.`
  }

  if (mood.length > MAX_MOOD_LENGTH) {
    errors.mood = `Mood must be ${MAX_MOOD_LENGTH} characters or fewer.`
  }

  if (themes.length > MAX_THEMES) {
    errors.themes = `Use at most ${MAX_THEMES} themes.`
  } else if (themes.some((theme) => theme.length > MAX_THEME_LENGTH)) {
    errors.themes = `Each theme must be ${MAX_THEME_LENGTH} characters or fewer.`
  }

  if (illustrationPrompt.length > MAX_ILLUSTRATION_PROMPT_LENGTH) {
    errors.illustration_prompt = `Keep the illustration prompt to ${MAX_ILLUSTRATION_PROMPT_LENGTH} characters or fewer.`
  }

  let journalEntryId: number | null = null
  if (entryIdText) {
    const parsed = /^\d+$/.test(entryIdText) ? Number(entryIdText) : Number.NaN
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      errors.journal_entry_id = 'Journal entry ID must be a positive whole number.'
    } else {
      journalEntryId = parsed
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  return {
    errors,
    input: {
      summary_text: summaryText,
      mood,
      themes,
      illustration_prompt: illustrationPrompt,
      journal_entry_id: journalEntryId,
    },
  }
}
