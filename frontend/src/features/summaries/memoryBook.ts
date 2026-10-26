import type { Summary } from '../../types/summaries'

/** The breakpoint where a two-page spread is comfortable to read. */
export const MEMORY_BOOK_WIDE_QUERY = '(min-width: 900px)'

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
})

const monthYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

function timestampOf(isoString: string): number | null {
  const timestamp = Date.parse(isoString)
  return Number.isNaN(timestamp) ? null : timestamp
}

/**
 * Copy and order summaries oldest-first for the book. `created_at` is the
 * date every summary has; the ID is a stable tie-breaker when two summaries
 * share the same timestamp. The caller's array is never mutated.
 */
export function sortMemories(summaries: readonly Summary[]): Summary[] {
  return [...summaries].sort((left, right) => {
    const leftTime = timestampOf(left.created_at)
    const rightTime = timestampOf(right.created_at)

    if (leftTime === null && rightTime === null) {
      return left.id - right.id
    }
    if (leftTime === null) {
      return 1
    }
    if (rightTime === null) {
      return -1
    }
    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }
    return left.id - right.id
  })
}

/** Long, human-readable date for a book page. */
export function formatMemoryDate(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }
  return longDateFormatter.format(date)
}

/** Month/year span covered by the summaries, or null when no date is valid. */
export function formatMemoryDateRange(summaries: readonly Summary[]): string | null {
  const valid = summaries
    .map((summary) => timestampOf(summary.created_at))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right)

  if (valid.length === 0) {
    return null
  }

  const first = monthYearFormatter.format(new Date(valid[0]))
  const last = monthYearFormatter.format(new Date(valid[valid.length - 1]))
  return first === last ? first : `${first} – ${last}`
}

/** Short, single-line preview used by the cover's contents list. */
export function memoryPreview(summary: Summary, limit = 90): string {
  const compact = summary.summary_text.trim().replace(/\s+/g, ' ')
  if (compact.length <= limit) {
    return compact
  }
  return `${compact.slice(0, limit).trimEnd()}…`
}
