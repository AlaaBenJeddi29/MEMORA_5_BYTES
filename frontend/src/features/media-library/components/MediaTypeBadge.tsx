import { Icon } from '../../../components/Icon'
import type { MediaType } from '../../../types/media'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'

/** Distinguishes original uploads from images produced by local ComfyUI. */
export function MediaTypeBadge({ type }: { type: MediaType }) {
  const modifier = type === 'ai_generated' ? 'ai' : 'original'

  return (
    <span className={`media-type media-type--${modifier}`}>
      <Icon name={type === 'ai_generated' ? 'sparkles' : 'camera'} size={11} />
      {MEDIA_TYPE_LABELS[type]}
    </span>
  )
}
