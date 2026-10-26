import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { MediaItem } from '../../../types/media'
import { formatDateTime } from '../../../utils/format'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'
import { MediaImage } from './MediaImage'
import { MediaTypeBadge } from './MediaTypeBadge'

export interface MediaCardProps {
  media: MediaItem
  onOpen: (media: MediaItem) => void
  onDelete: (media: MediaItem) => void
}

export function MediaCard({ media, onOpen, onDelete }: MediaCardProps) {
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  const imageAlt = media.prompt
    ? `${typeLabel}: ${media.prompt}`
    : `${typeLabel} ${media.id}`
  const promptText =
    media.prompt ||
    (media.media_type === 'ai_generated' ? 'No prompt recorded.' : 'No description yet.')

  return (
    <li className="media-card">
      <button
        type="button"
        className="media-card__preview"
        onClick={() => onOpen(media)}
        aria-label={`Open ${typeLabel} ${media.id} preview`}
      >
        <MediaImage className="media-card__image" src={media.file} alt={imageAlt} />
        <span className="media-card__type">
          <MediaTypeBadge type={media.media_type} />
        </span>
        <span className="media-card__open" aria-hidden="true">
          <Icon name="eye" size={15} />
          View image
        </span>
      </button>

      <div className="media-card__body">
        <p className="media-card__meta">
          <span className="media-card__id">#{media.id}</span>
          <span className="media-card__dot" aria-hidden="true" />
          <time dateTime={media.created_at}>{formatDateTime(media.created_at)}</time>
        </p>

        <p className="media-card__prompt">{promptText}</p>

        <div className="media-card__actions">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpen(media)}
            aria-label={`View ${typeLabel} ${media.id} details`}
          >
            <Icon name="eye" size={14} />
            View details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="media-card__delete"
            onClick={() => onDelete(media)}
            aria-label={`Delete ${typeLabel} ${media.id}`}
          >
            <Icon name="trash" size={14} />
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}
