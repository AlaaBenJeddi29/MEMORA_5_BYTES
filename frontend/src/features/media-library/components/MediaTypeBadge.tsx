import type { MediaType } from '../../../types/media'
import { MEDIA_TYPE_LABELS } from '../mediaHelpers'

/** Distinguishes original uploads from images produced by local ComfyUI. */
export function MediaTypeBadge({ type }: { type: MediaType }) {
  const modifier = type === 'ai_generated' ? 'ai' : 'original'

  return (
    <span className={`media-type media-type--${modifier}`}>
      <span className="media-type__dot" aria-hidden="true" />
      {MEDIA_TYPE_LABELS[type]}
    </span>
  )
}
