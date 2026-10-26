import { Icon } from '../../../components/Icon'
import type { MediaItem } from '../../../types/media'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'

export interface FavoriteButtonProps {
  media: MediaItem
  busy?: boolean
  showLabel?: boolean
  className?: string
  onToggle: (media: MediaItem) => void
}

export function FavoriteButton({
  media,
  busy = false,
  showLabel = false,
  className,
  onToggle,
}: FavoriteButtonProps) {
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  const label = media.is_favorite
    ? `Remove ${typeLabel} ${media.id} from favorites`
    : `Add ${typeLabel} ${media.id} to favorites`

  const classes = [
    'media-favorite',
    media.is_favorite ? 'is-active' : null,
    showLabel ? 'media-favorite--labeled' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={media.is_favorite}
      aria-label={label}
      aria-busy={busy || undefined}
      title={label}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(media)
      }}
    >
      <Icon name="heart" size={showLabel ? 16 : 17} />
      {showLabel && (
        <span>{media.is_favorite ? 'Favorited' : 'Favorite'}</span>
      )}
    </button>
  )
}
