import { Button } from '../../../components/Button'
import type { Summary } from '../../../types/summaries'
import {
  formatMemoryDate,
  formatMemoryDateRange,
  memoryPreview,
} from '../memoryBook'

export interface MemoryBookCoverProps {
  /** Chronologically ordered memories. */
  summaries: readonly Summary[]
  onOpen: () => void
  onOpenAt: (index: number) => void
  onClose: () => void
  /** Opens the customization dialog; hidden when omitted. */
  onCustomize?: () => void
}

/**
 * Closed book: title, memory count, covered period, and a contents list that
 * jumps straight to a page. No placeholder memories are ever shown.
 */
export function MemoryBookCover({
  summaries,
  onOpen,
  onOpenAt,
  onClose,
  onCustomize,
}: MemoryBookCoverProps) {
  const count = summaries.length
  const range = count > 0 ? formatMemoryDateRange(summaries) : null

  return (
    <div className="memory-book__cover">
      <div className="memory-book__cover-frame">
        <p className="memory-book__eyebrow">MEMORA</p>
        <h1 className="memory-book__title">My Story</h1>
        <p className="memory-book__subtitle">A personal book of memories</p>
        <span className="memory-book__ornament" aria-hidden="true" />

        {count > 0 ? (
          <>
            <p className="memory-book__facts">
              <span>
                {count} {count === 1 ? 'memory' : 'memories'}
              </span>
              {range && <span>{range}</span>}
            </p>

            <Button onClick={onOpen} className="memory-book__open">
              Open my book
            </Button>

            <details className="memory-book__contents">
              <summary>Contents</summary>
              <ol className="memory-book__contents-list">
                {summaries.map((summary, index) => (
                  <li key={summary.id}>
                    <button
                      type="button"
                      className="memory-book__contents-item"
                      onClick={() => onOpenAt(index)}
                    >
                      <span className="memory-book__contents-page">
                        Page {index + 1}
                      </span>
                      <span className="memory-book__contents-text">
                        {memoryPreview(summary)}
                      </span>
                      <span className="memory-book__contents-date">
                        {formatMemoryDate(summary.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          </>
        ) : (
          <div className="memory-book__empty">
            <p className="memory-book__empty-title">Your book is waiting.</p>
            <p>
              No memories yet. Create or generate a summary to begin your story.
            </p>
          </div>
        )}

        <div className="memory-book__cover-actions">
          {onCustomize && (
            <Button variant="secondary" onClick={onCustomize}>
              Personnaliser mon livre
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Back to summaries
          </Button>
        </div>
      </div>
    </div>
  )
}
