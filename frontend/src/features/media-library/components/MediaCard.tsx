import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { MediaItem } from '../../../types/media'
import { formatDateTime } from '../../../utils/format'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'
import { FavoriteButton } from './FavoriteButton'
import { MediaImage } from './MediaImage'
import { MediaTypeBadge } from './MediaTypeBadge'

export interface MediaCardProps {
  media: MediaItem
  favoriteBusy?: boolean
  removeBusy?: boolean
  activeCollectionName?: string
  onOpen: (media: MediaItem) => void
  onDelete: (media: MediaItem) => void
  onToggleFavorite: (media: MediaItem) => void
  onRemoveFromCollection?: (media: MediaItem) => void
}

export function MediaCard({
  media,
  favoriteBusy = false,
  removeBusy = false,
  activeCollectionName,
  onOpen,
  onDelete,
  onToggleFavorite,
  onRemoveFromCollection,
}: MediaCardProps) {
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  const imageAlt = media.prompt
    ? `${typeLabel}: ${media.prompt}`
    : `${typeLabel} ${media.id}`
  const promptText =
    media.prompt ||
    (media.media_type === 'ai_generated' ? 'No prompt recorded.' : 'No description yet.')

  return (
    <li className="media-card">
      <FavoriteButton
        media={media}
        busy={favoriteBusy}
        className="media-card__favorite"
        onToggle={onToggleFavorite}
      />

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
          {onRemoveFromCollection && (
            <Button
              size="sm"
              variant="ghost"
              disabled={removeBusy}
              onClick={() => onRemoveFromCollection(media)}
              aria-label={`Remove ${typeLabel} ${media.id} from ${
                activeCollectionName ?? 'this collection'
              }`}
            >
              <Icon name="folder" size={14} />
              {removeBusy ? 'Removing…' : 'Remove'}
            </Button>
          )}
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
