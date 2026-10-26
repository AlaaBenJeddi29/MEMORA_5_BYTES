import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { JournalEntry } from '../../../types/journal'
import type { MediaItem } from '../../../types/media'
import type { Summary } from '../../../types/summaries'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'
import { timelineDayLabel, timelineTimeLabel } from '../timelineHelpers'
import { MediaImage } from './MediaImage'
import { MediaTypeBadge } from './MediaTypeBadge'
import { Modal } from './Modal'

export interface TimelineMemoryDialogProps {
  entry: JournalEntry
  linkedMedia: MediaItem[]
  summaries: Summary[]
  onClose: () => void
  onOpenMedia: (media: MediaItem) => void
}

/** A read-only view of one journal memory and the real records linked to it. */
export function TimelineMemoryDialog({
  entry,
  linkedMedia,
  summaries,
  onClose,
  onOpenMedia,
}: TimelineMemoryDialogProps) {
  const title = entry.title || `Journal entry #${entry.id}`
  const savedSummary = entry.summary_text.trim()
  const generatedSummary =
    summaries.map((summary) => summary.summary_text.trim()).find(Boolean) ?? ''
  const headline = savedSummary || generatedSummary

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="media-timeline-memory">
        <div className="media-timeline-memory__meta">
          <span className="media-timeline-card__kind media-timeline-card__kind--journal">
            <Icon name="book" size={13} />
            Journal memory
          </span>
          <time dateTime={entry.created_at}>
            {timelineDayLabel(entry.created_at)} · {timelineTimeLabel(entry.created_at)}
          </time>
          {entry.sentiment && (
            <span className="media-timeline-chip">Feeling · {entry.sentiment}</span>
          )}
        </div>

        {headline && (
          <blockquote className="media-timeline-memory__quote">
            <Icon name="quote" size={18} />
            <p>{headline}</p>
          </blockquote>
        )}

        <section className="media-timeline-memory__section" aria-labelledby="timeline-memory-entry">
          <h3 id="timeline-memory-entry">Journal entry</h3>
          {entry.text ? (
            <p className="media-timeline-memory__text">{entry.text}</p>
          ) : (
            <p className="media-timeline-memory__text media-timeline-memory__text--empty">
              No text was saved for this entry.
            </p>
          )}
        </section>

        {summaries.length > 0 && (
          <section className="media-timeline-memory__section" aria-labelledby="timeline-memory-summaries">
            <h3 id="timeline-memory-summaries">
              {summaries.length === 1 ? 'Related summary' : 'Related summaries'}
            </h3>
            <ul className="media-timeline-memory__links">
              {summaries.map((summary) => (
                <li key={summary.id}>
                  <a className="media-timeline-card__link" href="/app/summaries">
                    <Icon name="quote" size={12} />
                    Summary #{summary.id}
                    <Icon name="arrowUpRight" size={11} />
                  </a>
                  {summary.mood && (
                    <span className="media-timeline-memory__mood">
                      {summary.mood}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="media-timeline-memory__section" aria-labelledby="timeline-memory-media">
          <h3 id="timeline-memory-media">Linked media</h3>
          {linkedMedia.length > 0 ? (
            <ul className="media-timeline-memory__media">
              {linkedMedia.map((media) => {
                const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
                return (
                  <li key={media.id}>
                    <button
                      type="button"
                      className="media-timeline-thumb"
                      onClick={() => onOpenMedia(media)}
                      aria-label={`Open ${typeLabel} ${media.id} from this memory`}
                    >
                      <MediaImage
                        className="media-timeline-thumb__image"
                        src={media.file}
                        alt={
                          media.prompt
                            ? `${typeLabel}: ${media.prompt}`
                            : `${typeLabel} ${media.id}`
                        }
                      />
                      <span className="media-timeline-thumb__badge">
                        <MediaTypeBadge type={media.media_type} compact />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="media-timeline-memory__text media-timeline-memory__text--empty">
              No media is linked to this memory yet.
            </p>
          )}
        </section>
      </div>

      <div className="media-modal__actions">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
