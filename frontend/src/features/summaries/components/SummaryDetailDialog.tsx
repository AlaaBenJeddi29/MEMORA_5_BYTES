import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'
import { Dialog } from './Dialog'

export interface SummaryDetailDialogProps {
  summary: Summary
  onClose: () => void
}

function mediaLibraryHref(summary: Summary): string {
  const params = new URLSearchParams({ summary_id: String(summary.id) })
  if (summary.journal_entry_id !== null) {
    params.set('journal_entry_id', String(summary.journal_entry_id))
  }
  return `/app/media?${params.toString()}`
}

export function SummaryDetailDialog({ summary, onClose }: SummaryDetailDialogProps) {
  const canIllustrate = Boolean(summary.illustration_prompt.trim())

  return (
    <Dialog
      title={`Summary ${summary.id}`}
      onClose={onClose}
      footer={
        <>
          {canIllustrate && (
            <a className="btn" href={mediaLibraryHref(summary)}>
              <Icon name="image" size={15} />
              Generate illustration
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="reflection-detail">
        <div className="reflection-detail__meta">
          <time dateTime={summary.created_at}>{formatDateTime(summary.created_at)}</time>
          {summary.mood && (
            <span className="badge badge--neutral">
              <Icon name="leaf" size={12} />
              {summary.mood}
            </span>
          )}
          {summary.journal_entry_id !== null && (
            <a
              className="reflection-detail__source"
              href={`/app/journal?edit=${summary.journal_entry_id}`}
            >
              Journal entry #{summary.journal_entry_id}
              <Icon name="arrowUpRight" size={13} />
            </a>
          )}
        </div>

        <blockquote className="reflection-detail__quote">
          <Icon name="quote" size={22} />
          <p>{summary.summary_text}</p>
        </blockquote>

        <section className="reflection-detail__section" aria-labelledby="reflection-themes">
          <h3 id="reflection-themes">Themes</h3>
          {summary.themes.length > 0 ? (
            <ul className="tag-list" aria-label={`Themes for summary ${summary.id}`}>
              {summary.themes.map((theme, index) => (
                <li className="tag" key={`${theme}-${index}`}>
                  {theme}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No themes</p>
          )}
        </section>

        <section
          className="reflection-detail__section"
          aria-labelledby="reflection-illustration"
        >
          <h3 id="reflection-illustration">Illustration prompt</h3>
          {canIllustrate ? (
            <p className="reflection-detail__prompt">{summary.illustration_prompt}</p>
          ) : (
            <p className="muted">
              Not set. Add an illustration prompt in the summary editor to enable illustration
              generation.
            </p>
          )}
        </section>

        <p className="reflection-detail__timestamps">
          Created {formatDateTime(summary.created_at)}
          <span aria-hidden="true"> · </span>
          Updated {formatDateTime(summary.updated_at)}
        </p>
      </div>
    </Dialog>
  )
}
