import { Button } from '../../../components/Button'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'
import { Dialog } from './Dialog'

export interface SummaryDetailDialogProps {
  summary: Summary
  onClose: () => void
}

export function SummaryDetailDialog({ summary, onClose }: SummaryDetailDialogProps) {
  return (
    <Dialog
      title={`Summary ${summary.id}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl className="detail-list summary-detail">
        {summary.journal_entry_id !== null && (
          <div className="detail-list__row">
            <dt>Journal entry</dt>
            <dd>Mock entry #{summary.journal_entry_id}</dd>
          </div>
        )}

        <div className="detail-list__row">
          <dt>Summary</dt>
          <dd>
            <p className="summary-detail__text">{summary.summary_text}</p>
          </dd>
        </div>

        <div className="detail-list__row">
          <dt>Mood</dt>
          <dd>
            {summary.mood ? (
              <span className="badge badge--neutral">{summary.mood}</span>
            ) : (
              <span className="muted">Not set</span>
            )}
          </dd>
        </div>

        <div className="detail-list__row">
          <dt>Themes</dt>
          <dd>
            {summary.themes.length > 0 ? (
              <ul className="tag-list" aria-label={`Themes for summary ${summary.id}`}>
                {summary.themes.map((theme, index) => (
                  <li className="tag" key={`${theme}-${index}`}>
                    {theme}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">No themes</span>
            )}
          </dd>
        </div>

        <div className="detail-list__row">
          <dt>Illustration prompt</dt>
          <dd>
            {summary.illustration_prompt ? (
              <p className="summary-detail__prompt">{summary.illustration_prompt}</p>
            ) : (
              <span className="muted">Not set</span>
            )}
          </dd>
        </div>

        <div className="detail-list__row">
          <dt>Created</dt>
          <dd>{formatDateTime(summary.created_at)}</dd>
        </div>

        <div className="detail-list__row">
          <dt>Updated</dt>
          <dd>{formatDateTime(summary.updated_at)}</dd>
        </div>
      </dl>
    </Dialog>
  )
}
