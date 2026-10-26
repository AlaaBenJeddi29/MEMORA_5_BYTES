/**
 * useAudioEntries — fetches and manages the list of audio entries.
 * Supports polling individual entries until AI processing completes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError } from '../../../services/errors'
import {
  deleteAudioEntry,
  getAudioEntry,
  listAudioEntries,
  updateAudioEntry,
  uploadAudio,
  type AudioEntryPatch,
} from '../services/audio'
import type { AudioEntry } from '../types/audio'

const POLL_INTERVAL_MS = 3000

export function useAudioEntries() {
  const [entries, setEntries] = useState<AudioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  // Entry uploaded in this session: the recorder shows its live AI status and
  // the page injects its transcript once analysis succeeds.
  const [activeId, setActiveId] = useState<number | null>(null)

  const pollTimers = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map())

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.id === activeId) ?? null,
    [entries, activeId],
  )

  // -------------------------------------------------------------------------
  // Fetch list
  // -------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    try {
      const data = await listAudioEntries()
      setEntries(data)
      setFetchError(null)
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(`Failed to load audio entries (${err.status}).`)
      } else {
        setFetchError('Failed to load audio entries.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // -------------------------------------------------------------------------
  // Polling helpers
  // -------------------------------------------------------------------------

  const stopPolling = useCallback((id: number) => {
    const timer = pollTimers.current.get(id)
    if (timer !== undefined) {
      clearInterval(timer)
      pollTimers.current.delete(id)
    }
  }, [])

  const startPolling = useCallback(
    (id: number) => {
      if (pollTimers.current.has(id)) return

      const timer = setInterval(async () => {
        try {
          const updated = await getAudioEntry(id)
          setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
          if (updated.status === 'succeeded' || updated.status === 'failed') {
            stopPolling(id)
          }
        } catch {
          stopPolling(id) // stop on error to avoid infinite loop
        }
      }, POLL_INTERVAL_MS)

      pollTimers.current.set(id, timer)
    },
    [stopPolling],
  )

  // Start polling for any pending/processing entries already in the list.
  useEffect(() => {
    entries.forEach((e) => {
      if (e.status === 'pending' || e.status === 'processing') {
        startPolling(e.id)
      }
    })
  }, [entries, startPolling])

  // Clean up all timers on unmount.
  useEffect(() => {
    const timers = pollTimers.current
    return () => {
      timers.forEach((timer) => clearInterval(timer))
    }
  }, [])

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  const upload = useCallback(
    async (file: File): Promise<AudioEntry | null> => {
      setUploading(true)
      setUploadError(null)
      try {
        const entry = await uploadAudio(file)
        setEntries((prev) => [entry, ...prev])
        setActiveId(entry.id)
        // If still processing, start polling.
        if (entry.status === 'pending' || entry.status === 'processing') {
          startPolling(entry.id)
        }
        return entry
      } catch (err) {
        if (err instanceof ApiError && err.data) {
          const body = err.data as Record<string, unknown>
          const msg =
            (body['file'] as string[] | undefined)?.[0] ??
            (body['detail'] as string | undefined) ??
            'Upload failed.'
          setUploadError(msg)
        } else {
          setUploadError('Upload failed. Please try again.')
        }
        return null
      } finally {
        setUploading(false)
      }
    },
    [startPolling],
  )

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const remove = useCallback(
    async (id: number) => {
      stopPolling(id)
      setActiveId((current) => (current === id ? null : current))
      try {
        await deleteAudioEntry(id)
        setEntries((prev) => prev.filter((e) => e.id !== id))
      } catch {
        // Re-fetch to stay in sync.
        fetchEntries()
      }
    },
    [fetchEntries, stopPolling],
  )

  // -------------------------------------------------------------------------
  // Update (correct the transcript / summary)
  // -------------------------------------------------------------------------

  const update = useCallback(
    async (id: number, patch: AudioEntryPatch): Promise<boolean> => {
      setUpdateError(null)
      setUpdatingId(id)
      try {
        const updated = await updateAudioEntry(id, patch)
        setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
        return true
      } catch (err) {
        setUpdateError(describeUpdateError(err))
        return false
      } finally {
        setUpdatingId(null)
      }
    },
    [],
  )

  const clearUpdateError = useCallback(() => setUpdateError(null), [])

  const clearActive = useCallback(() => setActiveId(null), [])

  return {
    entries,
    loading,
    uploading,
    uploadError,
    fetchError,
    updateError,
    updatingId,
    upload,
    update,
    clearUpdateError,
    remove,
    refresh: fetchEntries,
    // Live view of the memo uploaded in this session (null once dismissed).
    activeEntry,
    clearActive,
  }
}

/** Turns a failed PATCH into a message the user can act on. */
function describeUpdateError(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === 'object') {
    const body = err.data as Record<string, unknown>
    if (typeof body.detail === 'string') {
      return body.detail
    }
    for (const field of ['non_field_errors', 'transcript', 'summary']) {
      const messages = body[field]
      if (Array.isArray(messages) && typeof messages[0] === 'string') {
        return messages[0]
      }
    }
  }
  return 'Save failed. Please try again.'
}
