import type { NormalizedErrors } from '../../services/errors'
import type { MediaType } from '../../types/media'

/** Mirrors the backend defaults in config/settings.py. The server re-validates. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_PROMPT_LENGTH = 1000
export const MAX_COLLECTION_NAME_LENGTH = 80
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 500
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_UPLOAD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  original: 'Original photo',
  ai_generated: 'AI illustration',
}

export const PROMPT_GUIDANCE =
  'Describe a scene, mood, or style. Do not include names or private details about real people. The local model cannot faithfully recreate a real person’s likeness, so avoid asking for identifiable people.'

export const PROMPT_EXAMPLES = [
  'A quiet lake at dawn, soft watercolor light',
  'A lantern-lit cabin in a snowy forest, warm illustration',
  'A rain-soaked city street at dusk, gentle cinematic light',
] as const

export const GENERATION_SIZES = [
  { value: '512x512', label: 'Square · 512 × 512', width: 512, height: 512 },
  { value: '512x768', label: 'Portrait · 512 × 768', width: 512, height: 768 },
  { value: '768x512', label: 'Landscape · 768 × 512', width: 768, height: 512 },
] as const

/** Mirrors config/settings.py; the server re-validates every value. */
export const GENERATION_DEFAULT_STEPS = 20
export const GENERATION_MIN_STEPS = 1
export const GENERATION_MAX_STEPS = 30
export const GENERATION_MAX_SEED = 2 ** 63 - 1

export const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

export function flattenFormErrors(errors: NormalizedErrors): string[] {
  return [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
}

/** Client-side pre-check; the backend remains authoritative on decoded content. */
export function validateUploadFile(file: File): string | null {
  if (file.size === 0) {
    return 'The selected file is empty.'
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const hasAllowedType = file.type
    ? ALLOWED_UPLOAD_TYPES.includes(file.type)
    : ALLOWED_UPLOAD_EXTENSIONS.includes(extension)

  if (!hasAllowedType) {
    return 'Choose a JPEG, PNG, or WebP image.'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'The image is too large. Maximum size is 10 MB.'
  }
  return null
}
