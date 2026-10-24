/** People, face tagging and albums — as returned by `/api/people/`. */

export interface Person {
  id: number
  name: string
  avatar: string | null
  created_at: string
}

/** Minimal person shape embedded in a detected face. */
export interface PersonBrief {
  id: number
  name: string
}

export interface PersonInput {
  name: string
  avatar?: File | null
}

export interface BoundingBox {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DetectedFace {
  id: number
  face_crop: string | null
  bounding_box: BoundingBox
  person: PersonBrief | null
  suggested_person: PersonBrief | null
  distance: number | null
}

/** Read-only summary used by the "My photos" grid. */
export interface PhotoSummary {
  id: number
  photo: string
  uploaded_at: string
  faces_count: number
}

export interface PhotoDetail {
  id: number
  photo: string
  uploaded_at: string
  faces: DetectedFace[]
}

/** A photo in a person's album, with the crops of that person's faces. */
export interface AlbumPhoto {
  id: number
  photo: string
  uploaded_at: string
  crops: string[]
}
