import { Button } from '../../../components/Button'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'

export interface SummaryCardProps {
  summary: Summary
  onView: (summary: Summary) => void
  onEdit: (summary: Summary) => void
  onDelete: (summary: Summary) => void
}

export function SummaryCard({ summary, onView, onEdit, onDelete }: SummaryCardProps) {
  const title =
    summary.journal_entry_id === null
      ? `Summary #${summary.id}`
      : `Summary for journal entry #${summary.journal_entry_id}`

  return (
    <li className="card summary-card">
      <div className="summary-card__header">
        <h3 className="card__title">{title}</h3>
        {summary.mood && <span className="badge badge--neutral">{summary.mood}</span>}
      </div>

      <p className="summary-card__source">
        <time dateTime={summary.created_at}>{formatDateTime(summary.created_at)}</time>
      </p>

      <p className="summary-card__excerpt">{summary.summary_text}</p>

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
