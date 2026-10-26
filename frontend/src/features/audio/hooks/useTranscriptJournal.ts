/**
 * useTranscriptJournal — sends a voice-memo transcript to the journal module.
 *
 * Everything goes through the journal feature's own service (`journalApi`), so
 * the audio module never writes to the journal model directly: the entry is
 * created by `POST /api/journal/entries/`, which binds it to the authenticated
 * user server-side (`perform_create`).
 *
 * Duplicate protection uses a deterministic title carrying the audio id
 * ("Voice memo #12"). Before creating, the journal search endpoint is asked for
 * that title, so a second click — even after a page refresh — updates the
 * existing entry instead of adding a second one.
 */

import { useCallback, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import { normalizeApiError } from '../../../services/errors'
import { journalApi } from '../../../services/journal'
import type { JournalEntry } from '../../../types/journal'
import type { AudioEntry } from '../types/audio'

/** Per-entry state of the "Use in journal" action. */
export type JournalAction = 'idle' | 'saving' | 'saved'

export interface JournalMessage {
  variant: 'success' | 'error'
  text: string
}

export interface JournalSaveResult {
  entry: JournalEntry
  /** False when the memo had already been injected before this click. */
  created: boolean
}

/** Stable, searchable link between a journal entry and the memo it came from. */
export function journalTitleFor(entry: AudioEntry): string {
  return `Voice memo #${entry.id}`
}

export function useTranscriptJournal() {
  const navigate = useNavigate()
  const [savingId, setSavingId] = useState<number | null>(null)
  const [savedIds, setSavedIds] = useState<Set<number>>(() => new Set())
  const [message, setMessage] = useState<JournalMessage | null>(null)
  // Guards against a double click during the round trip, which state alone
  // cannot see because it has not been committed yet.
  const inFlight = useRef<Set<number>>(new Set())

  const actionFor = useCallback(
    (id: number): JournalAction => {
      if (savedIds.has(id)) return 'saved'
      if (savingId === id) return 'saving'
      return 'idle'
    },
    [savedIds, savingId],
  )

  const markSaved = useCallback((id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const save = useCallback(
    async (entry: AudioEntry): Promise<JournalSaveResult | null> => {
      const text = entry.transcript?.trim() ?? ''
      if (!text) {
        setMessage({
          variant: 'error',
          text: 'This memo has no transcript yet. Wait for the analysis, or write the text with Edit first.',
        })
        return null
      }
      if (inFlight.current.has(entry.id)) return null

      inFlight.current.add(entry.id)
      setSavingId(entry.id)
      setMessage(null)

      const title = journalTitleFor(entry)
      try {
        const existing = await findByTitle(title)
        if (existing) {
          markSaved(entry.id)
          setMessage({ variant: 'success', text: `"${title}" is already in your journal.` })
          return { entry: existing, created: false }
        }

        const created = await journalApi.create({
          title,
          text,
          audio_file: entry.file ?? '',
          summary_text: entry.summary ?? '',
          sentiment: entry.sentiment ?? '',
        })
        markSaved(entry.id)
        setMessage({ variant: 'success', text: `Saved in your journal as "${created.title}".` })
        return { entry: created, created: true }
      } catch (err) {
        setMessage({ variant: 'error', text: describeError(err) })
        return null
      } finally {
        inFlight.current.delete(entry.id)
        setSavingId(null)
      }
    },
    [markSaved],
  )

  /** Called when the button is pressed on a memo that is already in the journal. */
  const saveOrOpen = useCallback(
    async (entry: AudioEntry) => {
      if (savedIds.has(entry.id)) {
        navigate('/app/journal')
        return
      }
      await save(entry)
    },
    [navigate, savedIds, save],
  )

  const clearMessage = useCallback(() => setMessage(null), [])

  return { save, saveOrOpen, actionFor, savingId, savedIds, message, clearMessage }
}

/**
 * Exact-title lookup. `search` filters with `title__icontains`, so "#1" would
 * also match "#12" — the results are compared on the full title.
 */
async function findByTitle(title: string): Promise<JournalEntry | null> {
  const page = await journalApi.search({ q: title })
  return page.results.find((item) => item.title === title) ?? null
}

/** Turns whatever the journal API answered into one actionable sentence. */
function describeError(err: unknown): string {
  const normalized = normalizeApiError(err)
  if (normalized.detail) return normalized.detail
  if (normalized.formErrors.length > 0) return normalized.formErrors[0]

  const fieldError = Object.entries(normalized.fieldErrors).find(([, list]) => list.length > 0)
  if (fieldError) {
    const [field, messages] = fieldError
    return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${messages[0]}`
  }
  return 'Could not save this transcript in the journal.'
}
