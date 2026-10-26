/**
 * AudioEntryCard — displays a single audio entry with all 4 AI results:
 *   1. Transcript
 *   2. Sentiment (label + confidence score)
 *   3. Language detected
 *   4. Summary
 * The transcript and the summary are editable: the AI can mishear a word, and
 * the corrected text is what gets reused in the journal. From the same edit mode
 * the recording can be replaced — picked as a file or re-recorded with the
 * microphone — which sends the entry back through the AI pipeline.
 * Each finished text can also be read aloud (components/ReadAloudControls.tsx,
 * browser speech synthesis) without touching the recorded file.
 *
 * Layout: a wide card — header (date, duration, status), then three columns
 * that use the available width (player + language | sentiment + summary |
 * transcript), then the action row (replace on the left, edit / journal /
 * delete on the right). Below 720px the columns stack.
 */

import { useRef, useState } from 'react'

import { StatusBadge } from '../../../components/StatusBadge'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ReadAloudControls } from '../../../components/ReadAloudControls'
import { Icon } from '../../../components/Icon'
import type { JournalAction } from '../hooks/useTranscriptJournal'
import { AudioReplaceRecorder } from './AudioReplaceRecorder'
import type { AudioEntryPatch } from '../services/audio'
import type { AudioEntry } from '../types/audio'

// Emoji used by the module2 layout. If you already have these maps elsewhere
// in your project, delete these two and import yours instead.
const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊',
  negative: '😞',
  neutral: '😐',
  mixed: '🤔',
}

const LANGUAGE_FLAG: Record<string, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
  ar: '🇹🇳',
  es: '🇪🇸',
  de: '🇩🇪',
  it: '🇮🇹',
  pt: '🇵🇹',
  nl: '🇳🇱',
  ru: '🇷🇺',
  tr: '🇹🇷',
  zh: '🇨🇳',
  ja: '🇯🇵',
}

interface AudioEntryCardProps {
  entry: AudioEntry
  onDelete: (id: number) => void
  /** Receives the whole entry: the journal keeps the transcript plus its AI results. */
  onUseTranscript?: (entry: AudioEntry) => void
  /** Journal injection state of this entry (idle → saving → saved). */
  journalAction?: JournalAction
  /** Resolves false when the API rejected the edit, keeping the draft on screen. */
  onUpdate: (id: number, patch: AudioEntryPatch) => Promise<boolean>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDuration(secs: number | null): string {
  if (secs === null) return ''
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function AudioEntryCard({
  entry,
  onDelete,
  onUseTranscript,
  journalAction = 'idle',
  onUpdate,
}: AudioEntryCardProps) {
  const sentimentEmoji = entry.sentiment ? SENTIMENT_EMOJI[entry.sentiment] ?? '❓' : ''
  const langFlag       = entry.language_code ? (LANGUAGE_FLAG[entry.language_code] ?? '🌐') : ''

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Microphone panel, opened from within edit mode.
  const [recorderOpen, setRecorderOpen] = useState(false)
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')

  // One hidden file input per card, for the "replace this recording" flow.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = `audio-replace-input-${entry.id}`

  // The API refuses edits while the worker may still overwrite them (409).
  const editable = entry.status === 'succeeded' || entry.status === 'failed'
  // The three analysis columns; also shown to type a failed memo by hand.
  const analysed = entry.status === 'succeeded' || editing
  // "Use in journal" needs a transcript to send, so it appears with one only.
  const canUseInJournal = analysed && !editing && Boolean(entry.transcript) && Boolean(onUseTranscript)

  function startEdit() {
    setTranscriptDraft(entry.transcript ?? '')
    setSummaryDraft(entry.summary ?? '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaving(false)
    setRecorderOpen(false)
  }

  async function saveEdit() {
    setSaving(true)
    const saved = await onUpdate(entry.id, {
      transcript: transcriptDraft,
      summary: summaryDraft,
    })
    setSaving(false)
    if (saved) setEditing(false)
  }

  async function replaceAudio(file: File) {
    setReplacing(true)
    // On success the entry comes back as "pending" with empty AI fields, and the
    // list hook starts polling it again until the new analysis finishes.
    const saved = await onUpdate(entry.id, { file })
    setReplacing(false)
    if (saved) {
      // The typed drafts would have been cleared server-side anyway.
      setEditing(false)
      setRecorderOpen(false)
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    onDelete(entry.id)
    // La suppression est synchrone côté parent ; on laisse le dialog ouvert
    // le temps que le parent retire la carte de la liste.
    setDeleting(false)
    setConfirmDeleteOpen(false)
  }

  function handleReplaceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset first: choosing the same file twice must still fire change.
    e.target.value = ''
    if (file) void replaceAudio(file)
  }

  return (
    <article
      className={`audio-card audio-card--${entry.status}`}
      aria-label={`Voice memo from ${formatDate(entry.created_at)}`}
    >
      {/* ── Header ── */}
      <div className="audio-card__header">
        <div className="audio-card__meta">
          <span className="audio-card__mark" aria-hidden="true">
            <Icon name="wave" size={18} />
          </span>
          <div className="audio-card__meta-text">
            <time className="audio-card__date" dateTime={entry.created_at}>
              {formatDate(entry.created_at)}
            </time>
            {entry.duration_seconds !== null && (
              <span className="audio-card__duration">
                <Icon name="clock" size={12} />
                {formatDuration(entry.duration_seconds)}
              </span>
            )}
          </div>
        </div>
        <StatusBadge
          status={
            entry.status === 'succeeded'
              ? 'succeeded'
              : entry.status === 'failed'
                ? 'failed'
                : entry.status === 'processing'
                  ? 'processing'
                  : 'pending'
          }
        />
      </div>

      {/* ── Body: playback | analysis | transcript, side by side when there is room ── */}
      <div className="audio-card__body">
        {/* ① The recording itself, then the language it was spoken in */}
        <div className="audio-card__column audio-card__column--playback">
          {entry.file && (
            <div className="audio-card__player">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={entry.file} className="audio-card__audio" />
            </div>
          )}

          {/* Processing indicator */}
          {(entry.status === 'pending' || entry.status === 'processing') && (
            <p className="audio-card__processing" role="status" aria-live="polite">
              ⏳ Analysing your voice memo…
            </p>
          )}

          {analysed && entry.language_name && (
            <div className="audio-card__result-row audio-card__result-row--language">
              <span className="audio-card__result-icon" aria-hidden="true">{langFlag}</span>
              <div>
                <span className="audio-card__result-label">Language detected</span>
                <span className="audio-card__result-value">{entry.language_name}</span>
                {entry.language_code && (
                  <span className="audio-card__result-badge">{entry.language_code.toUpperCase()}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ② Sentiment + summary (also while editing a failed memo: the
            transcript saved from the audio is null, but a hand-written one
            can be added) */}
        {analysed && (
          <div className="audio-card__column audio-card__column--analysis">
            {entry.sentiment && (
              <div className={`audio-card__result-row audio-card__result-row--sentiment audio-card__result-row--${entry.sentiment}`}>
                <span className="audio-card__result-icon" aria-hidden="true">{sentimentEmoji}</span>
                <div>
                  <span className="audio-card__result-label">Sentiment</span>
                  <span className="audio-card__result-value">
                    {entry.sentiment.charAt(0).toUpperCase() + entry.sentiment.slice(1)}
                  </span>
                  {entry.sentiment_score !== null && (
                    <span className="audio-card__result-badge">
                      {Math.round(entry.sentiment_score * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            )}

            {(entry.summary || editing) && (
              <div className="audio-card__result-block">
                <h3 className="audio-card__result-label">📋 Summary</h3>
                {editing ? (
                  <textarea
                    className="audio-card__edit-field"
                    aria-label="Edit summary"
                    value={summaryDraft}
                    rows={3}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                  />
                ) : (
                  <>
                    <p className="audio-card__summary-text">{entry.summary}</p>
                    <ReadAloudControls
                      entryId={entry.id}
                      field="summary"
                      text={entry.summary}
                      lang={entry.language_code}
                      subject={`the summary of the memo from ${formatDate(entry.created_at)}`}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ③ Transcript */}
        {analysed && (
          <div className="audio-card__column audio-card__column--transcript">
            {(entry.transcript || editing) && (
              <div className="audio-card__result-block">
                <h3 className="audio-card__result-label">🎙 Transcript</h3>
                {editing ? (
                  <textarea
                    className="audio-card__edit-field"
                    aria-label="Edit transcript"
                    value={transcriptDraft}
                    rows={5}
                    onChange={(e) => setTranscriptDraft(e.target.value)}
                  />
                ) : (
                  <>
                    <p className="audio-card__transcript-text">{entry.transcript}</p>
                    <ReadAloudControls
                      entryId={entry.id}
                      field="transcript"
                      text={entry.transcript}
                      lang={entry.language_code}
                      subject={`the transcript of the memo from ${formatDate(entry.created_at)}`}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Microphone re-recording (only while editing) ── */}
      {editing && recorderOpen && (
        <AudioReplaceRecorder busy={replacing || saving} onFile={replaceAudio} />
      )}

      {/* ── Error ── */}
      {entry.status === 'failed' && entry.error && (
        <p className="audio-card__error" role="alert">
          <Icon name="alert" size={16} />
          <span>{entry.error}</span>
        </p>
      )}

      {/* ── Footer: secondary action left, main actions right-aligned ── */}
      <div className="audio-card__footer">
        {editing ? (
          <div className="audio-card__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecorderOpen((open) => !open)}
              disabled={saving || replacing}
              aria-label="Re-record this memo with the microphone"
            >
              <Icon name="mic" size={14} />
              {recorderOpen ? 'Hide recorder' : 'Re-record'}
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={saving || replacing}
              aria-label="Save your corrections"
            >
              <Icon name="check" size={14} />
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving || replacing}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            {editable && (
              <div className="audio-card__footer-start">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/webm,audio/mp4"
                  className="sr-only"
                  id={inputId}
                  aria-label="Choose a new recording for this memo"
                  onChange={handleReplaceChange}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={replacing}
                  aria-controls={inputId}
                >
                  <Icon name="repeat" size={14} />
                  {replacing ? 'Replacing…' : 'Replace audio'}
                </Button>
              </div>
            )}
            <div className="audio-card__actions">
              {editable && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={startEdit}
                  aria-label={`Edit the transcript of the memo from ${formatDate(entry.created_at)}`}
                >
                  <Icon name="edit" size={14} />
                  Edit
                </Button>
              )}
              {canUseInJournal && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onUseTranscript?.(entry)}
                  disabled={journalAction === 'saving'}
                  aria-label={
                    journalAction === 'saved'
                      ? 'Open this memo in the journal'
                      : 'Use transcript in journal entry'
                  }
                >
                  {journalAction === 'saving'
                    ? 'Adding to journal…'
                    : journalAction === 'saved'
                    ? '📓 In your journal'
                    : '📝 Use in journal'}
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
                aria-label={`Delete voice memo from ${formatDate(entry.created_at)}`}
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Confirmation de suppression ── */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this voice memo?"
        message="This action is permanent and cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </article>
  )
}