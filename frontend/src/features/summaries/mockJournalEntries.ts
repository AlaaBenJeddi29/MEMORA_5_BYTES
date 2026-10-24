/**
 * TEMPORARY development fixtures for Module 3 generation.
 *
 * Mirrors `apps/summaries/mock_journal_entries.py` (IDs 900001–900003) until
 * Module 1 exposes real journal entries and a list endpoint. This file is a UI
 * option list only: the browser sends an ID to Django, and the backend resolves
 * the entry itself. Do not treat these as persisted data and remove this file
 * once journal entries have a real API.
 */
export interface MockJournalEntryOption {
  id: number
  title: string
}

export const MOCK_JOURNAL_ENTRY_OPTIONS: readonly MockJournalEntryOption[] = [
  { id: 900001, title: 'Morning walk' },
  { id: 900002, title: 'Project stand-up' },
  { id: 900003, title: 'Evening with family' },
]
