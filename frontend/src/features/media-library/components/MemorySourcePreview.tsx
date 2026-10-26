import { Icon } from '../../../components/Icon'
import type { JournalEntry } from '../../../types/journal'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'
import { excerptFromText } from '../timelineHelpers'

const CONTEXT_EXCERPT_LENGTH = 220

export interface MemorySourcePreviewProps {
  journalEntries: JournalEntry[]
  summaries: Summary[]
  journalEntryId: string
  summaryId: string
}

/**
 * Read-only context for the selected memory. It only renders records that are
 * already in the caller's owner-scoped lists; anything else is treated as
 * unselected and the server stays the authority on ownership.
 */
export function MemorySourcePreview({
  journalEntries,
  summaries,
  journalEntryId,
  summaryId,
}: MemorySourcePreviewProps) {
  const selectedSummary =
    summaries.find((summary) => String(summary.id) === summaryId) ?? null
  const selectedEntry =
    journalEntries.find((entry) => String(entry.id) === journalEntryId) ?? null
  const linkedEntry =
    selectedSummary && selectedSummary.journal_entry_id !== null
      ? journalEntries.find(
          (entry) => entry.id === selectedSummary.journal_entry_id,
        ) ?? null
      : null

  if (selectedSummary) {
    const excerpt = excerptFromText(
      selectedSummary.summary_text,
      CONTEXT_EXCERPT_LENGTH,
    )
    return (
      <aside
        className="media-source-preview"
        aria-live="polite"
        aria-label="Selected memory context"
      >
        <p className="media-source-preview__kind">
          <Icon name="quote" size={13} />
          Summary memory
        </p>
        <h4 className="media-source-preview__title">
          Summary #{selectedSummary.id}
        </h4>
        <p className="media-source-preview__meta">
          <time dateTime={selectedSummary.created_at}>
            {formatDateTime(selectedSummary.created_at)}
          </time>
          {selectedSummary.mood && <span> · Feeling {selectedSummary.mood}</span>}
        </p>
        <p className="media-source-preview__excerpt">
          {excerpt || 'No summary text was saved.'}
        </p>
        <p className="media-source-preview__link">
          {linkedEntry ? (
            <>
              From journal memory “{linkedEntry.title || `Entry #${linkedEntry.id}`}”
              {' · '}
              {formatDateTime(linkedEntry.created_at)}
            </>
          ) : (
            'This summary is not linked to a journal entry.'
          )}
        </p>
      </aside>
    )
  }

  if (selectedEntry) {
    const excerpt = excerptFromText(
      selectedEntry.summary_text || selectedEntry.text,
      CONTEXT_EXCERPT_LENGTH,
    )
    return (
      <aside
        className="media-source-preview"
        aria-live="polite"
        aria-label="Selected memory context"
      >
        <p className="media-source-preview__kind">
          <Icon name="book" size={13} />
          Journal memory
        </p>
        <h4 className="media-source-preview__title">
          {selectedEntry.title || `Journal entry #${selectedEntry.id}`}
        </h4>
        <p className="media-source-preview__meta">
          <time dateTime={selectedEntry.created_at}>
            {formatDateTime(selectedEntry.created_at)}
          </time>
          {selectedEntry.sentiment && <span> · Feeling {selectedEntry.sentiment}</span>}
        </p>
        <p className="media-source-preview__excerpt">
          {excerpt || 'No recap was saved for this memory.'}
        </p>
        <p className="media-source-preview__link">
          Only the title and recap are used to build the prompt. The entry body
          is never sent.
        </p>
      </aside>
    )
  }

  return (
    <p className="media-source-preview media-source-preview--empty" aria-live="polite">
      Choose one of your journal memories or summaries to preview its title,
      date, and recap. Only records from your account are listed.
    </p>
  )
}
