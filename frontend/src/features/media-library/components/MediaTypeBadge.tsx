import { Icon } from '../../../components/Icon'
import type { MediaType } from '../../../types/media'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'

/** Distinguishes original uploads from images produced by local ComfyUI. */
export function MediaTypeBadge({
  type,
  compact = false,
}: {
  type: MediaType
  /** Short label for small thumbnails; the full label stays in the tooltip. */
  compact?: boolean
}) {
  const modifier = type === 'ai_generated' ? 'ai' : 'original'
  const label = compact
    ? type === 'ai_generated'
      ? 'AI'
      : 'Original'
    : MEDIA_TYPE_LABELS[type]

  return (
    <span
      className={`media-type media-type--${modifier}`}
      title={MEDIA_TYPE_LABELS[type]}
    >
      <Icon name={type === 'ai_generated' ? 'sparkles' : 'camera'} size={11} />
      {label}
    </span>
  )
}
