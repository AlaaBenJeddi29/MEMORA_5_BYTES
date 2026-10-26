import { apiRequest } from '../../services/apiClient'
import type {
  AlbumPhoto,
  DetectedFace,
  Person,
  PersonInput,
  PhotoDetail,
  PhotoSummary,
} from './types'

function toFormData(input: PersonInput): FormData {
  const body = new FormData()
  body.append('name', input.name)
  if (input.avatar) {
    body.append('avatar', input.avatar)
  }
  return body
}

/** Single entry point for the people API; components never call fetch directly. */
export const peopleApi = {
  list: () => apiRequest<Person[]>('/api/people/'),

  create: (input: PersonInput) =>
    apiRequest<Person>('/api/people/', { method: 'POST', body: toFormData(input) }),

  get: (id: number) => apiRequest<Person>(`/api/people/${id}/`),

  update: (id: number, input: PersonInput) =>
    apiRequest<Person>(`/api/people/${id}/`, { method: 'PATCH', body: toFormData(input) }),

  remove: (id: number) => apiRequest<void>(`/api/people/${id}/`, { method: 'DELETE' }),

  album: (id: number) => apiRequest<AlbumPhoto[]>(`/api/people/${id}/photos/`),

  photos: () => apiRequest<PhotoSummary[]>('/api/people/photos/'),

  photo: (id: number) => apiRequest<PhotoDetail>(`/api/people/photos/${id}/`),

  setFacePerson: (faceId: number, personId: number | null) =>
    apiRequest<DetectedFace>(`/api/people/faces/${faceId}/`, {
      method: 'PATCH',
      body: { person: personId },
    }),

  confirmFace: (faceId: number) =>
    apiRequest<DetectedFace>(`/api/people/faces/${faceId}/confirm/`, { method: 'POST' }),

  deleteFace: (faceId: number) =>
    apiRequest<void>(`/api/people/faces/${faceId}/`, { method: 'DELETE' }),
}
