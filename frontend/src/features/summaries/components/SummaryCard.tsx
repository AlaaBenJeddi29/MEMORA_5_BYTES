import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
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
    <li className="reflection-card">
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

      <blockquote className="reflection-card__excerpt">
        <Icon name="quote" size={18} />
        <p>{summary.summary_text}</p>
      </blockquote>

      {summary.themes.length > 0 && (
        <ul className="tag-list" aria-label={`Themes for summary ${summary.id}`}>
          {summary.themes.map((theme, index) => (
            <li className="tag" key={`${theme}-${index}`}>
              {theme}
            </li>
          ))}
        </ul>
      )}

      <div className="reflection-card__foot">
        {summary.journal_entry_id !== null && (
          <a
            className="reflection-card__source"
            href={`/app/journal?edit=${summary.journal_entry_id}`}
          >
            Open entry #{summary.journal_entry_id}
            <Icon name="arrowUpRight" size={13} />
          </a>
        )}

        <div className="reflection-card__actions">
          <Button
            variant="secondary"
            size="sm"
            aria-label={`View summary ${summary.id}`}
            onClick={() => onView(summary)}
          >
            <Icon name="eye" size={14} />
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit summary ${summary.id}`}
            onClick={() => onEdit(summary)}
          >
            <Icon name="edit" size={14} />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="reflection-card__delete"
            aria-label={`Delete summary ${summary.id}`}
            onClick={() => onDelete(summary)}
          >
            <Icon name="trash" size={14} />
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}
