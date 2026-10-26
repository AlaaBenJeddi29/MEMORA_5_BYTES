import type {
  CollectionInput,
  GenerateImageInput,
  MediaCollection,
  MediaCollectionDetail,
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

  setFavorite: (id: number, isFavorite: boolean) =>
    apiRequest<MediaItem>(`/api/media/${id}/favorite/`, {
      method: 'PATCH',
      body: { is_favorite: isFavorite },
    }),

  /** The Django backend is the only caller of local ComfyUI. */
  generate: (input: GenerateImageInput) =>
    apiRequest<MediaItem>('/api/media/generate/', { method: 'POST', body: input }),

  listCollections: () => apiRequest<MediaCollection[]>('/api/media/collections/'),

  createCollection: (input: CollectionInput) =>
    apiRequest<MediaCollection>('/api/media/collections/', {
      method: 'POST',
      body: input,
    }),

  getCollection: (id: number) =>
    apiRequest<MediaCollectionDetail>(`/api/media/collections/${id}/`),

  updateCollection: (id: number, input: CollectionInput) =>
    apiRequest<MediaCollection>(`/api/media/collections/${id}/`, {
      method: 'PATCH',
      body: input,
    }),

  removeCollection: (id: number) =>
    apiRequest<void>(`/api/media/collections/${id}/`, { method: 'DELETE' }),

  addToCollection: (collectionId: number, mediaId: number) =>
    apiRequest<MediaItem>(`/api/media/collections/${collectionId}/items/`, {
      method: 'POST',
      body: { media_id: mediaId },
    }),

  removeFromCollection: (collectionId: number, mediaId: number) =>
    apiRequest<void>(
      `/api/media/collections/${collectionId}/items/${mediaId}/`,
      { method: 'DELETE' },
    ),
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
