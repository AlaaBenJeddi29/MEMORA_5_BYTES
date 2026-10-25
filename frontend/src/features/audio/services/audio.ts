/**
 * API service for the audio feature.
 * All calls go through apiRequest which handles CSRF and credentials.
 */

import { apiRequest } from '../../../services/apiClient'
import type { AudioEntry } from '../types/audio'

const BASE = '/api/audio/'

/** Upload an audio file (multipart/form-data). Returns the created entry. */
export async function uploadAudio(file: File, signal?: AbortSignal): Promise<AudioEntry> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<AudioEntry>(BASE, { method: 'POST', body: form, signal })
}

/** List all audio entries owned by the current user. */
export async function listAudioEntries(signal?: AbortSignal): Promise<AudioEntry[]> {
  return apiRequest<AudioEntry[]>(BASE, { signal })
}

/** Fetch a single audio entry by id. */
export async function getAudioEntry(id: number, signal?: AbortSignal): Promise<AudioEntry> {
  return apiRequest<AudioEntry>(`${BASE}${id}/`, { signal })
}

/** Fields the user may change after transcription. */
export interface AudioEntryPatch {
  transcript?: string
  summary?: string
  /** A new recording: sent on its own, it re-runs the whole AI pipeline. */
  file?: File
}

/** Correct the transcript/summary, or replace the audio of an entry (owner only). */
export async function updateAudioEntry(
  id: number,
  patch: AudioEntryPatch,
  signal?: AbortSignal,
): Promise<AudioEntry> {
  if (patch.file) {
    const form = new FormData()
    form.append('file', patch.file)
    return apiRequest<AudioEntry>(`${BASE}${id}/`, { method: 'PATCH', body: form, signal })
  }
  return apiRequest<AudioEntry>(`${BASE}${id}/`, { method: 'PATCH', body: patch, signal })
}

/** Delete an audio entry by id. */
export async function deleteAudioEntry(id: number): Promise<void> {
  return apiRequest<void>(`${BASE}${id}/`, { method: 'DELETE' })
}
