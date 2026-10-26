import { Icon } from '../../../components/Icon'
import { StatusBadge } from '../../../components/StatusBadge'
import type { MediaItem } from '../../../types/media'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'
import {
  timelineMediaTitle,
  timelineTimeLabel,
  type TimelineEvent,
} from '../timelineHelpers'
import { FavoriteButton } from './FavoriteButton'
import { MediaImage } from './MediaImage'
import { MediaTypeBadge } from './MediaTypeBadge'

export interface TimelineEventCardProps {
  event: TimelineEvent
  favoriteBusy?: boolean
  onOpenMedia: (media: MediaItem) => void
  onOpenJournal: (entryId: number) => void
  onToggleFavorite: (media: MediaItem) => void
}

function mediaAlt(media: MediaItem): string {
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  return media.prompt ? `${typeLabel}: ${media.prompt}` : `${typeLabel} ${media.id}`
}

function entryLabel(entry: { id: number; title: string }): string {
  return entry.title || `Entry #${entry.id}`
}

function JournalEventCard({
  event,
  onOpenMedia,
  onOpenJournal,
}: Pick<TimelineEventCardProps, 'onOpenMedia' | 'onOpenJournal'> & {
  event: Extract<TimelineEvent, { kind: 'journal' }>
}) {
  const title = entryLabel(event.entry)
  const summaryIds = event.summaries.map((summary) => `#${summary.id}`).join(', ')

  return (
    <li className="media-timeline__item media-timeline__item--journal">
      <span className="media-timeline__marker media-timeline__marker--journal" aria-hidden="true">
        <Icon name="book" size={15} />
      </span>
      <article className="media-timeline-card media-timeline-card--journal">
        <header className="media-timeline-card__head">
          <span className="media-timeline-card__kind media-timeline-card__kind--journal">
            <Icon name="book" size={13} />
            Journal memory
          </span>
          <time className="media-timeline-card__time" dateTime={event.entry.created_at}>
            {timelineTimeLabel(event.entry.created_at)}
          </time>
        </header>

        <h4 className="media-timeline-card__heading">
          <button
            type="button"
            className="media-timeline-card__title"
            onClick={() => onOpenJournal(event.entry.id)}
            aria-label={`Open journal memory ${title}`}
          >
            {title}
          </button>
        </h4>

        {event.excerpt && (
          <p className="media-timeline-card__excerpt">{event.excerpt}</p>
        )}

        {(event.entry.sentiment || event.summaries.length > 0) && (
          <div className="media-timeline-card__chips">
            {event.entry.sentiment && (
              <span className="media-timeline-chip">
                Feeling · {event.entry.sentiment}
              </span>
            )}
            {event.summaries.length > 0 && (
              <a className="media-timeline-chip media-timeline-chip--link" href="/app/summaries">
                <Icon name="quote" size={12} />
                {event.summaries.length === 1 ? 'Summary' : 'Summaries'} {summaryIds}
                <Icon name="arrowUpRight" size={11} />
              </a>
            )}
          </div>
        )}

        {event.linkedMedia.length > 0 && (
          <div className="media-timeline-card__media">
            <p className="media-timeline-card__meta-label">
              Media from this memory
            </p>
            <ul className="media-timeline-card__media-grid">
              {event.linkedMedia.map((media) => {
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
                        alt={mediaAlt(media)}
                      />
                      <span className="media-timeline-thumb__badge">
                        <MediaTypeBadge type={media.media_type} compact />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </article>
    </li>
  )
}

function MediaEventCard({
  event,
  favoriteBusy = false,
  onOpenMedia,
  onOpenJournal,
  onToggleFavorite,
}: TimelineEventCardProps & {
  event: Extract<TimelineEvent, { kind: 'media' }>
}) {
  const { media } = event
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  const title = timelineMediaTitle(media)

  return (
    <li className="media-timeline__item media-timeline__item--media">
      <span
        className={`media-timeline__marker media-timeline__marker--${
          media.media_type === 'ai_generated' ? 'ai' : 'original'
        }`}
        aria-hidden="true"
      >
        <Icon name={media.media_type === 'ai_generated' ? 'sparkles' : 'camera'} size={15} />
      </span>
      <article className="media-timeline-card media-timeline-card--media">
        <header className="media-timeline-card__head">
          <div className="media-timeline-card__badges">
            <MediaTypeBadge type={media.media_type} />
            {media.status !== 'succeeded' && <StatusBadge status={media.status} />}
          </div>
          <div className="media-timeline-card__head-right">
            <time className="media-timeline-card__time" dateTime={media.created_at}>
              {timelineTimeLabel(media.created_at)}
            </time>
            <FavoriteButton
              media={media}
              busy={favoriteBusy}
              onToggle={onToggleFavorite}
            />
          </div>
        </header>

        <div className="media-timeline-card__layout">
          <button
            type="button"
            className="media-timeline-card__preview"
            onClick={() => onOpenMedia(media)}
            aria-label={`Open ${typeLabel} ${media.id} preview`}
          >
            <MediaImage
              className="media-timeline-card__image"
              src={media.file}
              alt={mediaAlt(media)}
            />
          </button>

          <div className="media-timeline-card__copy">
            <h4 className="media-timeline-card__heading">
              <button
                type="button"
                className="media-timeline-card__title"
                onClick={() => onOpenMedia(media)}
                aria-label={`Open ${typeLabel} ${media.id} details`}
              >
                {title}
              </button>
            </h4>

            {event.linkedEntries.length > 0 && (
              <div className="media-timeline-card__meta-row">
                <span className="media-timeline-card__meta-label">
                  <Icon name="book" size={12} />
                  From
                </span>
                <ul className="media-timeline-card__chips">
                  {event.linkedEntries.map((entry) => {
                    const label = entryLabel(entry)
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="media-timeline-chip media-timeline-chip--button"
                          onClick={() => onOpenJournal(entry.id)}
                          aria-label={`Open linked journal memory ${label}`}
                        >
                          {label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {event.summary && (
              <a className="media-timeline-card__link" href="/app/summaries">
                <Icon name="quote" size={12} />
                Summary #{event.summary.id}
                <Icon name="arrowUpRight" size={11} />
              </a>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

/** One dated entry in the memory timeline: a journal memory or a media item. */
export function TimelineEventCard({
  event,
  favoriteBusy = false,
  onOpenMedia,
  onOpenJournal,
  onToggleFavorite,
}: TimelineEventCardProps) {
  if (event.kind === 'journal') {
    return (
      <JournalEventCard
        event={event}
        onOpenMedia={onOpenMedia}
        onOpenJournal={onOpenJournal}
      />
    )
  }
  return (
    <MediaEventCard
      event={event}
      favoriteBusy={favoriteBusy}
      onOpenMedia={onOpenMedia}
      onOpenJournal={onOpenJournal}
      onToggleFavorite={onToggleFavorite}
    />
  )
}
