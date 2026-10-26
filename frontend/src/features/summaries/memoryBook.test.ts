import { describe, expect, it } from 'vitest'

import type { Summary } from '../../types/summaries'
import {
  formatMemoryDate,
  formatMemoryDateRange,
  memoryPreview,
  sortMemories,
} from './memoryBook'

function summaryOf(overrides: Partial<Summary>): Summary {
  return {
    id: 1,
    owner: 1,
    journal_entry_id: 1,
    summary_text: 'A default memory.',
    mood: '',
    themes: [],
    illustration_prompt: '',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  }
}

const monthYear = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

describe('sortMemories', () => {
  it('orders copies oldest-first and breaks ties with the ID', () => {
    const latest = summaryOf({ id: 9, created_at: '2026-03-01T10:00:00Z' })
    const tiedHigherId = summaryOf({ id: 5, created_at: '2026-02-01T10:00:00Z' })
    const tiedLowerId = summaryOf({ id: 2, created_at: '2026-02-01T10:00:00Z' })
    const earliest = summaryOf({ id: 7, created_at: '2026-01-01T10:00:00Z' })
    const shared = [latest, tiedHigherId, tiedLowerId, earliest]

    const sorted = sortMemories(shared)

    expect(sorted.map((summary) => summary.id)).toEqual([7, 2, 5, 9])
    expect(shared.map((summary) => summary.id)).toEqual([9, 5, 2, 7])
    expect(sorted).not.toBe(shared)
  })

  it('keeps unparsable dates at the end', () => {
    const invalid = summaryOf({ id: 1, created_at: 'not-a-date' })
    const valid = summaryOf({ id: 2, created_at: '2026-04-01T10:00:00Z' })

    expect(sortMemories([invalid, valid]).map((summary) => summary.id)).toEqual([
      2, 1,
    ])
  })
})

describe('formatMemoryDateRange', () => {
  it('returns null without a usable date', () => {
    expect(formatMemoryDateRange([])).toBeNull()
    expect(
      formatMemoryDateRange([summaryOf({ created_at: 'invalid' })]),
    ).toBeNull()
  })

  it('collapses a single month and joins distinct months', () => {
    const january = summaryOf({ id: 1, created_at: '2026-01-04T10:00:00Z' })
    const januaryToo = summaryOf({ id: 2, created_at: '2026-01-28T10:00:00Z' })
    const march = summaryOf({ id: 3, created_at: '2026-03-15T10:00:00Z' })

    expect(formatMemoryDateRange([january, januaryToo])).toBe(
      monthYear.format(new Date(january.created_at)),
    )
    expect(formatMemoryDateRange([march, january])).toBe(
      `${monthYear.format(new Date(january.created_at))} – ${monthYear.format(
        new Date(march.created_at),
      )}`,
    )
  })
})

describe('formatMemoryDate', () => {
  it('falls back to the original value when the date is invalid', () => {
    expect(formatMemoryDate('someday')).toBe('someday')
  })
})

describe('memoryPreview', () => {
  it('compacts whitespace and truncates long text', () => {
    expect(memoryPreview(summaryOf({ summary_text: '  One\n\n  two   three  ' }))).toBe(
      'One two three',
    )
    expect(
      memoryPreview(summaryOf({ summary_text: 'abcdefghijklmnop' }), 10),
    ).toBe('abcdefghij…')
  })
})
