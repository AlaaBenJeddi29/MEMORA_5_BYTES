import { describe, expect, it } from 'vitest'

import type { Summary } from '../../types/summaries'
import {
  emptySummaryFormValues,
  parseThemes,
  summaryToFormValues,
  validateSummaryForm,
} from './summaryForm'

describe('summaryForm', () => {
  it('requires summary text and returns no input when invalid', () => {
    const result = validateSummaryForm(emptySummaryFormValues())

    expect(result.input).toBeUndefined()
    expect(result.errors.summary_text).toBe('Summary text is required.')
  })

  it('trims values and parses comma-separated themes', () => {
    const result = validateSummaryForm({
      summary_text: '  A short recap.  ',
      mood: ' calm ',
      themes: 'work, rest, ,focus',
      illustration_prompt: ' A lamp on a desk. ',
      journal_entry_id: ' 900001 ',
    })

    expect(result.errors).toEqual({})
    expect(result.input).toEqual({
      summary_text: 'A short recap.',
      mood: 'calm',
      themes: ['work', 'rest', 'focus'],
      illustration_prompt: 'A lamp on a desk.',
      journal_entry_id: 900001,
    })
  })

  it('rejects too many themes and invalid entry IDs', () => {
    const result = validateSummaryForm({
      ...emptySummaryFormValues(),
      summary_text: 'Valid summary.',
      themes: '1,2,3,4,5,6,7,8,9',
      journal_entry_id: '0',
    })

    expect(result.input).toBeUndefined()
    expect(result.errors.themes).toBe('Use at most 8 themes.')
    expect(result.errors.journal_entry_id).toBe(
      'Journal entry ID must be a positive whole number.',
    )
  })

  it('round-trips an existing summary into editable values', () => {
    const summary: Summary = {
      id: 3,
      owner: 1,
      journal_entry_id: 900003,
      summary_text: 'Dinner with family.',
      mood: 'grateful',
      themes: ['family', 'food'],
      illustration_prompt: 'A warm table.',
      created_at: '2026-10-22T19:20:00Z',
      updated_at: '2026-10-22T19:20:00Z',
    }

    expect(summaryToFormValues(summary)).toEqual({
      summary_text: 'Dinner with family.',
      mood: 'grateful',
      themes: 'family, food',
      illustration_prompt: 'A warm table.',
      journal_entry_id: '900003',
    })
    expect(parseThemes('family, food')).toEqual(['family', 'food'])
  })
})
