import type {
  GenerateImageInput,
  MediaItem,
  UpdateMediaInput,
} from '../types/media'
import { apiRequest } from './apiClient'
import { ApiError } from './errors'

/**
 * Module 4 media API. Every call goes through the shared `apiRequest`, so
 * session cookies, CSRF handling and error parsing stay in one place.
 */
export const mediaApi = {
  list: () => apiRequest<MediaItem[]>('/api/media/'),

  get: (id: number) => apiRequest<MediaItem>(`/api/media/${id}/`),

  /** multipart upload; the server owns provenance and media type. */
  upload: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return apiRequest<MediaItem>('/api/media/', { method: 'POST', body })
  },

  /** PATCH only accepts `prompt`; the server owns the other fields. */
  updatePrompt: (id: number, input: UpdateMediaInput) =>
    apiRequest<MediaItem>(`/api/media/${id}/`, { method: 'PATCH', body: input }),

  remove: (id: number) => apiRequest<void>(`/api/media/${id}/`, { method: 'DELETE' }),

  /** The Django backend is the only caller of local ComfyUI. */
  generate: (input: GenerateImageInput) =>
    apiRequest<MediaItem>('/api/media/generate/', { method: 'POST', body: input }),
}

/**
 * Provider outages and timeouts can succeed on a retry; validation and
 * permission failures should not be retried unchanged.
 */
export function isRetryableGenerationError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 502 || error.status === 503 || error.status === 504
  }
  return error instanceof TypeError
}
