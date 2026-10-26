import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'

export interface SummaryCardProps {
  summary: Summary
  /** Search excerpt from the API; falls back to the summary text when empty. */
  snippet?: string
  onView: (summary: Summary) => void
  onEdit: (summary: Summary) => void
  onDelete: (summary: Summary) => void
  /** Optional shortcut to this memory's page in the memory book. */
  onOpenInBook?: (summary: Summary) => void
  /** Briefly emphasises the card and makes it a focus target. */
  highlighted?: boolean
}

export function SummaryCard({
  summary,
  snippet,
  onView,
  onEdit,
  onDelete,
  onOpenInBook,
  highlighted = false,
}: SummaryCardProps) {
  const title =
    summary.journal_entry_id === null
      ? `Summary #${summary.id}`
      : `Summary for journal entry #${summary.journal_entry_id}`
  const excerpt = snippet?.trim() ? snippet : summary.summary_text

  return (
    <li
      className={
        highlighted ? 'reflection-card is-highlighted' : 'reflection-card'
      }
      data-summary-card={summary.id}
      tabIndex={-1}
    >
      <div className="reflection-card__top">
        <span className="reflection-card__mark" aria-hidden="true">
          <Icon name="sparkles" size={16} />
        </span>
        <time className="reflection-card__date" dateTime={summary.created_at}>
          {formatDateTime(summary.created_at)}
        </time>
        {summary.mood && (
          <span className="reflection-card__mood">
            <Icon name="leaf" size={12} />
            {summary.mood}
          </span>
        )}
      </div>

      <h3 className="reflection-card__title">{title}</h3>

      <p className="summary-card__excerpt">{excerpt}</p>

      {summary.themes.length > 0 && (
        <ul className="tag-list" aria-label={`Themes for summary ${summary.id}`}>
          {summary.themes.map((theme, index) => (
            <li className="tag" key={`${theme}-${index}`}>
              {theme}
            </li>
          ))}
        </ul>
      )}

      <div className="summary-card__actions">
        {onOpenInBook && (
          <Button
            variant="secondary"
            size="sm"
            data-book-trigger={summary.id}
            aria-label={`Read summary ${summary.id} in the book`}
            onClick={() => onOpenInBook(summary)}
          >
            Read in book
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-label={`View summary ${summary.id}`}
          onClick={() => onView(summary)}
        >
          View
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Edit summary ${summary.id}`}
          onClick={() => onEdit(summary)}
        >
          Edit
        </Button>
        <Button
          variant="danger"
          size="sm"
          aria-label={`Delete summary ${summary.id}`}
          onClick={() => onDelete(summary)}
        >
          Delete
        </Button>
      </div>
    </li>
  )
}
