import { describe, expect, it } from 'vitest'

import type { JournalEntry } from '../../types/journal'
import type { MediaItem } from '../../types/media'
import type { Summary } from '../../types/summaries'
import {
  buildJournalTimelineEvent,
  buildTimelineEvents,
  excerptFromText,
  groupTimelineEvents,
  isDateRangeInvalid,
  localDateKey,
  timelineMediaTitle,
  type TimelineFilters,
} from './timelineHelpers'

const ORIGINAL: MediaItem = {
  id: 11,
  file: 'http://testserver/media/original.png',
  media_type: 'original',
  prompt: '',
  status: 'succeeded',
  is_favorite: true,
  journal_entry_id: null,
  journal_entries: [],
  summary_id: null,
  collection_ids: [7],
  provider: '',
  model: '',
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
}

const GENERATED: MediaItem = {
  id: 12,
  file: 'http://testserver/media/generated.png',
  media_type: 'ai_generated',
  prompt: 'A quiet lake at dawn, watercolor.',
  status: 'succeeded',
  is_favorite: false,
  journal_entry_id: 2,
  journal_entries: [{ id: 2, title: 'Rainy afternoon' }],
  summary_id: 3,
  collection_ids: [],
  provider: 'comfyui',
  model: 'sd15.safetensors',
  created_at: '2026-10-21T11:30:00Z',
  updated_at: '2026-10-21T11:30:00Z',
}

const ORPHANED: MediaItem = {
  id: 13,
  file: 'http://testserver/media/orphaned.png',
  media_type: 'ai_generated',
  prompt: 'An image referencing records we cannot see.',
  status: 'succeeded',
  is_favorite: false,
  journal_entry_id: null,
  journal_entries: [{ id: 99, title: 'Another account’s entry' }],
  summary_id: 99,
  collection_ids: [],
  provider: 'comfyui',
  model: '',
  created_at: '2026-10-19T09:00:00Z',
  updated_at: '2026-10-19T09:00:00Z',
}

const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 2,
    user: 1,
    title: 'Rainy afternoon',
    text: 'Spent the afternoon reading by the window while the rain fell.',
    audio_file: '',
    summary_text: '',
    sentiment: 'calm',
    created_at: '2026-09-15T15:40:00Z',
    photos: [12],
  },
  {
    id: 3,
    user: 1,
    title: 'A saved reflection',
    text: 'The long version of the entry body that should not become the excerpt.',
    audio_file: '',
    summary_text: 'A short saved reflection about slowing down.',
    sentiment: '',
    created_at: '2026-09-16T15:40:00Z',
    photos: [],
  },
]

const SUMMARIES: Summary[] = [
  {
    id: 3,
    owner: 1,
    journal_entry_id: 2,
    summary_text: 'A quiet afternoon reading by the window.',
    mood: 'calm',
    themes: ['rest'],
    illustration_prompt: 'A rain-soaked window at dusk.',
    created_at: '2026-09-15T16:00:00Z',
    updated_at: '2026-09-15T16:00:00Z',
  },
  {
    id: 5,
    owner: 1,
    journal_entry_id: 3,
    summary_text: 'Generated summary for the second entry.',
    mood: '',
    themes: [],
    illustration_prompt: '',
    created_at: '2026-09-16T16:00:00Z',
    updated_at: '2026-09-16T16:00:00Z',
  },
  {
    id: 6,
    owner: 1,
    journal_entry_id: null,
    summary_text: 'An unlinked manual summary.',
    mood: '',
    themes: [],
    illustration_prompt: '',
    created_at: '2026-09-17T09:00:00Z',
    updated_at: '2026-09-17T09:00:00Z',
  },
]

const BASE_FILTERS: TimelineFilters = {
  activeCollectionId: null,
  favoritesOnly: false,
  kind: 'all',
  query: '',
  dateFrom: '',
  dateTo: '',
  order: 'newest',
}

function build(overrides: Partial<TimelineFilters> = {}, media = [ORIGINAL, GENERATED]) {
  return buildTimelineEvents(media, JOURNAL_ENTRIES, SUMMARIES, {
    ...BASE_FILTERS,
    ...overrides,
  })
}

describe('buildTimelineEvents', () => {
  it('merges owner media and journal entries newest first', () => {
    const events = build()

    expect(events.map((event) => event.key)).toEqual([
      'media-12',
      'media-11',
      'journal-3',
      'journal-2',
    ])
    expect(events.map((event) => event.kind)).toEqual([
      'media',
      'media',
      'journal',
      'journal',
    ])
  })

  it('sorts oldest first when requested', () => {
    const events = build({ order: 'oldest' })

    expect(events.map((event) => event.key)).toEqual([
      'journal-2',
      'journal-3',
      'media-11',
      'media-12',
    ])
  })

  it('filters by journal, original, and AI media kinds', () => {
    expect(build({ kind: 'journal' }).map((event) => event.key)).toEqual([
      'journal-3',
      'journal-2',
    ])
    expect(build({ kind: 'original' }).map((event) => event.key)).toEqual([
      'media-11',
    ])
    expect(build({ kind: 'ai_generated' }).map((event) => event.key)).toEqual([
      'media-12',
    ])
  })

  it('keeps only favorited images when the favorites filter is on', () => {
    const events = build({ favoritesOnly: true })

    expect(events).toHaveLength(1)
    expect(events[0].key).toBe('media-11')
  })

  it('scopes both media and journal memories to the active collection', () => {
    const events = build({ activeCollectionId: 7 })

    expect(events.map((event) => event.key)).toEqual(['media-11'])
    const journalEvent = buildJournalTimelineEvent(
      JOURNAL_ENTRIES[0],
      [ORIGINAL, GENERATED],
      SUMMARIES,
      7,
    )
    expect(journalEvent.linkedMedia).toEqual([])
  })

  it('searches titles, text, summaries, prompts, and media metadata', () => {
    expect(build({ query: 'watercolor' }).map((event) => event.key)).toEqual([
      'media-12',
      'journal-2',
    ])
    expect(build({ query: 'rainy afternoon' }).map((event) => event.key)).toEqual([
      'media-12',
      'journal-2',
    ])
    expect(build({ query: 'saved reflection' }).map((event) => event.key)).toEqual([
      'journal-3',
    ])
    expect(build({ query: '#11' }).map((event) => event.key)).toEqual(['media-11'])
    expect(build({ query: 'comfyui' }).map((event) => event.key)).toEqual([
      'media-12',
    ])
  })

  it('filters on the viewer’s local calendar date', () => {
    const day = localDateKey(GENERATED.created_at)
    const events = build({ dateFrom: day, dateTo: day })

    expect(events.length).toBeGreaterThan(0)
    expect(
      events.every((event) => localDateKey(event.date) === day),
    ).toBe(true)
  })

  it('returns no events for an inverted date range', () => {
    expect(build({ dateFrom: '2026-10-22', dateTo: '2026-10-01' })).toEqual([])
    expect(isDateRangeInvalid('2026-10-22', '2026-10-01')).toBe(true)
    expect(isDateRangeInvalid('2026-10-01', '2026-10-22')).toBe(false)
  })

  it('only links journal entries and summaries that belong to the loaded owner data', () => {
    const events = build({}, [ORPHANED])
    const mediaEvent = events.find((event) => event.key === 'media-13')

    expect(mediaEvent?.kind).toBe('media')
    if (mediaEvent?.kind === 'media') {
      expect(mediaEvent.linkedEntries).toEqual([])
      expect(mediaEvent.summary).toBeNull()
    }
  })

  it('attaches only summaries that belong to each journal entry', () => {
    const events = build({ kind: 'journal' })
    const entryTwo = events.find((event) => event.key === 'journal-2')
    const entryThree = events.find((event) => event.key === 'journal-3')

    expect(entryTwo?.kind).toBe('journal')
    if (entryTwo?.kind === 'journal') {
      expect(entryTwo.summaries.map((summary) => summary.id)).toEqual([3])
    }
    expect(entryThree?.kind).toBe('journal')
    if (entryThree?.kind === 'journal') {
      expect(entryThree.summaries.map((summary) => summary.id)).toEqual([5])
    }
  })

  it('scopes journal-linked media to the owner media list', () => {
    const event = buildJournalTimelineEvent(
      { ...JOURNAL_ENTRIES[0], photos: [12, 999] },
      [ORIGINAL, GENERATED],
      SUMMARIES,
    )

    expect(event.linkedMedia.map((media) => media.id)).toEqual([12])
  })
})

describe('groupTimelineEvents', () => {
  it('groups consecutive events by local day', () => {
    const events = build()
    const groups = groupTimelineEvents(events)

    expect(groups).toHaveLength(events.length)
    expect(groups.map((group) => group.dateKey)).toEqual(
      events.map((event) => localDateKey(event.date)),
    )
    expect(groups.every((group) => group.label.length > 0)).toBe(true)
  })
})

describe('excerptFromText', () => {
  it('collapses whitespace and truncates long text at a word boundary', () => {
    const text = `  First   line.\nSecond line. ${'word '.repeat(60)}`
    const excerpt = excerptFromText(text, 80)

    expect(excerpt.startsWith('First line. Second line.')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(81)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('prefers the entry summary, then a linked summary, then the entry body', () => {
    const withOwnSummary = buildJournalTimelineEvent(
      { ...JOURNAL_ENTRIES[0], summary_text: 'Own summary.' },
      [ORIGINAL, GENERATED],
      SUMMARIES,
    )
    expect(withOwnSummary.excerpt).toBe('Own summary.')

    const withLinkedSummary = buildJournalTimelineEvent(
      JOURNAL_ENTRIES[0],
      [ORIGINAL, GENERATED],
      SUMMARIES,
    )
    expect(withLinkedSummary.excerpt).toBe(
      'A quiet afternoon reading by the window.',
    )

    const withBodyOnly = buildJournalTimelineEvent(
      { ...JOURNAL_ENTRIES[0], summary_text: '' },
      [],
      [],
    )
    expect(withBodyOnly.excerpt).toBe(JOURNAL_ENTRIES[0].text)
  })
})

describe('timelineMediaTitle', () => {
  it('uses the prompt when present and a labelled fallback otherwise', () => {
    expect(timelineMediaTitle(GENERATED)).toBe(
      'A quiet lake at dawn, watercolor.',
    )
    expect(timelineMediaTitle(ORIGINAL)).toBe('Original photo #11')
    expect(timelineMediaTitle({ ...GENERATED, prompt: '', id: 44 })).toBe(
      'AI illustration #44',
    )
  })
})
