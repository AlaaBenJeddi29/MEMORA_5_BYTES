import type { JournalEntry } from '../../types/journal'
import type { MediaItem, MediaJournalEntryRef } from '../../types/media'
import type { Summary } from '../../types/summaries'
import { MEDIA_TYPE_LABELS } from './mediaHelpers'

export type TimelineKind = 'all' | 'journal' | 'original' | 'ai_generated'
export type TimelineOrder = 'newest' | 'oldest'

export interface TimelineJournalEvent {
  kind: 'journal'
  key: string
  date: string
  entry: JournalEntry
  linkedMedia: MediaItem[]
  summaries: Summary[]
  excerpt: string
}

export interface TimelineMediaEvent {
  kind: 'media'
  key: string
  date: string
  media: MediaItem
  linkedEntries: MediaJournalEntryRef[]
  summary: Summary | null
}

export type TimelineEvent = TimelineJournalEvent | TimelineMediaEvent

export interface TimelineFilters {
  activeCollectionId: number | null
  favoritesOnly: boolean
  kind: TimelineKind
  query: string
  dateFrom: string
  dateTo: string
  order: TimelineOrder
}

export interface TimelineGroup {
  dateKey: string
  label: string
  events: TimelineEvent[]
}

const MAX_EXCERPT_LENGTH = 180

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function validDate(isoString: string): Date | null {
  const date = new Date(isoString)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Local calendar date key, so date filters match what the viewer sees. */
export function localDateKey(isoString: string): string {
  const date = validDate(isoString)
  if (!date) {
    return ''
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function timelineDayLabel(isoString: string): string {
  const date = validDate(isoString)
  return date ? dayFormatter.format(date) : 'Undated'
}

export function timelineTimeLabel(isoString: string): string {
  const date = validDate(isoString)
  return date ? timeFormatter.format(date) : ''
}

export function isDateRangeInvalid(dateFrom: string, dateTo: string): boolean {
  return Boolean(dateFrom && dateTo && dateFrom > dateTo)
}

export function excerptFromText(
  text: string,
  maxLength = MAX_EXCERPT_LENGTH,
): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  const slice = normalized.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = (lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice)
    .trimEnd()
  return `${cut}…`
}

export function timelineMediaTitle(media: MediaItem): string {
  const prompt = media.prompt.trim()
  return prompt || `${MEDIA_TYPE_LABELS[media.media_type]} #${media.id}`
}

function groupSummaries(summaries: Summary[]): Map<number, Summary[]> {
  const grouped = new Map<number, Summary[]>()
  for (const summary of summaries) {
    if (summary.journal_entry_id === null) {
      continue
    }
    const list = grouped.get(summary.journal_entry_id) ?? []
    list.push(summary)
    grouped.set(summary.journal_entry_id, list)
  }
  return grouped
}

function inDateRange(
  isoString: string,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom && !dateTo) {
    return true
  }
  const key = localDateKey(isoString)
  if (!key) {
    return false
  }
  if (dateFrom && key < dateFrom) {
    return false
  }
  if (dateTo && key > dateTo) {
    return false
  }
  return true
}

function matchesQuery(needle: string, values: Array<string | null>): boolean {
  if (!needle) {
    return true
  }
  return values.some((value) => value?.toLowerCase().includes(needle))
}

function summarizeEntry(
  entry: JournalEntry,
  summaries: Summary[],
): string {
  const entrySummary = entry.summary_text.trim()
  if (entrySummary) {
    return entrySummary
  }
  const generatedSummary = summaries
    .map((summary) => summary.summary_text.trim())
    .find(Boolean)
  return generatedSummary || entry.text
}

function makeJournalEvent(
  entry: JournalEntry,
  mediaById: Map<number, MediaItem>,
  summariesByEntry: Map<number, Summary[]>,
  activeCollectionId: number | null,
): TimelineJournalEvent {
  const summaries = summariesByEntry.get(entry.id) ?? []
  let linkedMedia = entry.photos
    .map((id) => mediaById.get(id))
    .filter((media): media is MediaItem => Boolean(media))

  if (activeCollectionId !== null) {
    linkedMedia = linkedMedia.filter((media) =>
      media.collection_ids.includes(activeCollectionId),
    )
  }

  linkedMedia = [...linkedMedia].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  )

  return {
    kind: 'journal',
    key: `journal-${entry.id}`,
    date: entry.created_at,
    entry,
    linkedMedia,
    summaries,
    excerpt: excerptFromText(summarizeEntry(entry, summaries)),
  }
}

/** Build one memory event for a journal entry, reusing the caller's media list. */
export function buildJournalTimelineEvent(
  entry: JournalEntry,
  media: MediaItem[],
  summaries: Summary[],
  activeCollectionId: number | null = null,
): TimelineJournalEvent {
  return makeJournalEvent(
    entry,
    new Map(media.map((item) => [item.id, item])),
    groupSummaries(summaries),
    activeCollectionId,
  )
}

function makeMediaEvent(
  media: MediaItem,
  journalIds: Set<number>,
  summaryById: Map<number, Summary>,
): TimelineMediaEvent {
  const linkedEntries = media.journal_entries.filter((entry) =>
    journalIds.has(entry.id),
  )
  const summary =
    media.summary_id !== null ? summaryById.get(media.summary_id) ?? null : null

  return {
    kind: 'media',
    key: `media-${media.id}`,
    date: media.created_at,
    media,
    linkedEntries,
    summary,
  }
}

/**
 * Merge the caller's owner-scoped media and journal entries into one
 * chronologically sorted list. Every relationship comes from the existing
 * API payloads; no IDs are trusted beyond the loaded owner-scoped data.
 */
export function buildTimelineEvents(
  media: MediaItem[],
  journalEntries: JournalEntry[],
  summaries: Summary[],
  filters: TimelineFilters,
): TimelineEvent[] {
  if (isDateRangeInvalid(filters.dateFrom, filters.dateTo)) {
    return []
  }

  const needle = filters.query.trim().toLowerCase()
  const includeJournal = filters.kind === 'all' || filters.kind === 'journal'
  const includeOriginal =
    filters.kind === 'all' || filters.kind === 'original'
  const includeAi =
    filters.kind === 'all' || filters.kind === 'ai_generated'

  const mediaById = new Map(media.map((item) => [item.id, item]))
  const journalIds = new Set(journalEntries.map((entry) => entry.id))
  const summariesByEntry = groupSummaries(summaries)
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]))
  const events: TimelineEvent[] = []

  for (const item of media) {
    if (filters.favoritesOnly && !item.is_favorite) {
      continue
    }
    if (
      filters.activeCollectionId !== null &&
      !item.collection_ids.includes(filters.activeCollectionId)
    ) {
      continue
    }
    if (item.media_type === 'original' && !includeOriginal) {
      continue
    }
    if (item.media_type === 'ai_generated' && !includeAi) {
      continue
    }

    const event = makeMediaEvent(item, journalIds, summaryById)
    const summaryId = event.summary ? String(event.summary.id) : null
    if (
      !matchesQuery(needle, [
        item.prompt,
        String(item.id),
        `#${item.id}`,
        MEDIA_TYPE_LABELS[item.media_type],
        item.provider,
        item.model,
        summaryId,
        ...event.linkedEntries.map((entry) => entry.title),
      ])
    ) {
      continue
    }
    if (!inDateRange(item.created_at, filters.dateFrom, filters.dateTo)) {
      continue
    }
    events.push(event)
  }

  for (const entry of journalEntries) {
    // Favorites describe individual images, so journal-only memories are
    // hidden while that image filter is active.
    if (filters.favoritesOnly || !includeJournal) {
      continue
    }

    const event = makeJournalEvent(
      entry,
      mediaById,
      summariesByEntry,
      filters.activeCollectionId,
    )

    if (
      filters.activeCollectionId !== null &&
      event.linkedMedia.length === 0
    ) {
      continue
    }

    if (
      !matchesQuery(needle, [
        entry.title,
        entry.text,
        entry.summary_text,
        entry.sentiment,
        ...event.summaries.map((summary) => summary.summary_text),
        ...event.linkedMedia.map((item) => item.prompt),
      ])
    ) {
      continue
    }
    if (!inDateRange(entry.created_at, filters.dateFrom, filters.dateTo)) {
      continue
    }
    events.push(event)
  }

  return events.sort((left, right) => {
    const leftTime = validDate(left.date)?.getTime() ?? 0
    const rightTime = validDate(right.date)?.getTime() ?? 0
    if (leftTime !== rightTime) {
      return filters.order === 'newest'
        ? rightTime - leftTime
        : leftTime - rightTime
    }
    return left.key.localeCompare(right.key)
  })
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const groups: TimelineGroup[] = []
  for (const event of events) {
    const dateKey = localDateKey(event.date)
    const current = groups[groups.length - 1]
    if (!current || current.dateKey !== dateKey) {
      groups.push({
        dateKey,
        label: timelineDayLabel(event.date),
        events: [event],
      })
    } else {
      current.events.push(event)
    }
  }
  return groups
}
