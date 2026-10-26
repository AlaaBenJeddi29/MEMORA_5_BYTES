/**
 * AudioListPage — main page for the audio / voice memo feature.
 *
 * Layout:
 *   - PageHeader with title
 *   - VoiceRecorder component (record → upload → live AI status)
 *   - File upload fallback (for pre-recorded .mp3 / .wav files)
 *   - List of AudioEntryCards (with polling for pending/processing entries,
 *     inline correction of the transcript/summary and audio replacement)
 *   - Read-aloud on each card's transcript and summary, through the browser's
 *     own `speechSynthesis` (one speaker at a time; the page says so out loud
 *     when the browser has none)
 *   - AccessibilityWidget (fixed ♿ trigger → text size, contrast, dark mode,
 *     focus ring, announcements, shortcuts; preferences are saved and re-applied
 *     on the next visit)
 *
 * Journal injection ("réinjection automatique"): the transcript of the memo
 * just analysed is previewed in a banner, and "Use in journal" stores it through
 * the journal module's own API (`journalApi` → POST /api/journal/entries/), so
 * the entry is owned by the signed-in user, appears in the journal list and
 * survives a refresh. Clicking twice re-uses the same journal entry instead of
 * creating a duplicate.
 */

import { useEffect, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { AccessibilityWidget } from '../../../components/AccessibilityWidget'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { SPEECH_UNSUPPORTED_NOTICE_ID } from '../../../components/ReadAloudControls'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useSpeech, useStopSpeechOnLeave } from '../../../hooks/useSpeech'
import { UNSUPPORTED_MESSAGE } from '../../../utils/speech'
import { AudioEntryCard } from '../components/AudioEntryCard'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { useAudioEntries } from '../hooks/useAudioEntries'
import { useTranscriptJournal } from '../hooks/useTranscriptJournal'

export function AudioListPage() {
  useDocumentTitle('Audio & voice memos · MEMORA')

  const navigate = useNavigate()

  // Read-aloud is one global speaker: leaving this page must silence it.
  const speech = useSpeech()
  useStopSpeechOnLeave()

  const {
    entries,
    loading,
    uploading,
    uploadError,
    fetchError,
    updateError,
    upload,
    update,
    remove,
    clearUpdateError,
    activeEntry,
    clearActive,
  } = useAudioEntries()

  const journal = useTranscriptJournal()

  // Transcript injected from the latest successful analysis or "Use in journal" click.
  const [injectedTranscript, setInjectedTranscript] = useState<string | null>(null)

  // Announce each analysed state only once, even though polling re-renders it.
  // Keyed on updated_at so replacing the recording re-injects the fresh text.
  const announced = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!activeEntry) return
    if (activeEntry.status === 'succeeded' || activeEntry.status === 'failed') {
      const key = `${activeEntry.id}:${activeEntry.updated_at}`
      if (announced.current.has(key)) return
      announced.current.add(key)
      if (activeEntry.status === 'succeeded' && activeEntry.transcript) {
        setInjectedTranscript(activeEntry.transcript)
      }
    }
  }, [activeEntry])

  // File input ref for the "upload existing file" flow.
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      upload(file)
      // Reset so the same file can be re-selected if needed.
      e.target.value = ''
    }
  }

  function dismissAnalysis() {
    clearActive()
    setInjectedTranscript(null)
  }

  return (
    <main className="audio-page">
      <PageHeader
        title="Audio & voice memos"
        description="Record, upload and transcribe your voice memos. The AI analyses the text, detects the spoken language and the sentiment."
      />

      {/* Shown once for the page; the per-text read buttons point at it. */}
      {!speech.supported && (
        <p id={SPEECH_UNSUPPORTED_NOTICE_ID} className="audio-page__notice" role="note">
          ⚠ {UNSUPPORTED_MESSAGE}
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Transcript injection banner                                         */}
      {/* ------------------------------------------------------------------ */}
      {injectedTranscript && (
        <section className="audio-page__transcript-banner" aria-live="polite">
          <Alert variant="success">
            <strong>Transcript ready to use in your journal:</strong>
            <blockquote className="audio-page__quote">{injectedTranscript}</blockquote>
            {activeEntry && (
              <Button
                size="sm"
                onClick={() => void journal.saveOrOpen(activeEntry)}
                disabled={journal.actionFor(activeEntry.id) === 'saving'}
              >
                {journal.actionFor(activeEntry.id) === 'saved'
                  ? '📓 In your journal'
                  : '📝 Add to journal'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismissAnalysis}>
              Dismiss
            </Button>
          </Alert>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Intake: recorder and file upload side by side on wide screens       */}
      {/* ------------------------------------------------------------------ */}
      <div className="audio-page__intake">
        {/* Record a new memo */}
        <section className="audio-page__recorder" aria-labelledby="recorder-heading">
          <h2 id="recorder-heading" className="audio-page__section-title">
            Record a new memo
          </h2>
          <VoiceRecorder
            onUpload={upload}
            uploading={uploading}
            uploadError={uploadError}
            analysis={activeEntry}
          />
          {activeEntry && (activeEntry.status === 'succeeded' || activeEntry.status === 'failed') && (
            <Button size="sm" variant="ghost" onClick={clearActive}>
              Hide analysis status
            </Button>
          )}
        </section>

        {/* Upload an existing file */}
        <section className="audio-page__upload" aria-labelledby="upload-heading">
          <h2 id="upload-heading" className="audio-page__section-title">
            Or upload an existing file
          </h2>
          <p className="audio-page__upload-hint">
            Accepted formats: MP3, WAV, WebM, MP4 audio — max 25 MB.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/webm,audio/mp4"
            className="sr-only"
            id="audio-file-input"
            aria-label="Choose an audio file to upload"
            onChange={handleFileChange}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-controls="audio-file-input"
          >
            {uploading ? 'Uploading…' : '📁 Choose file'}
          </Button>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* List                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="audio-page__list" aria-labelledby="list-heading">
        <h2 id="list-heading" className="audio-page__section-title">
          Your voice memos
        </h2>

        {fetchError && <Alert variant="error">{fetchError}</Alert>}
        {updateError && (
          <Alert variant="error">
            {updateError}
            <Button size="sm" variant="ghost" onClick={clearUpdateError}>
              Dismiss
            </Button>
          </Alert>
        )}
        {journal.message && (
          <Alert variant={journal.message.variant}>
            {journal.message.text}
            {journal.message.variant === 'success' && (
              <Button size="sm" variant="ghost" onClick={() => navigate('/app/journal')}>
                Open the journal
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={journal.clearMessage}>
              Dismiss
            </Button>
          </Alert>
        )}

        {loading ? (
          <LoadingState label="Loading voice memos…" />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No voice memos yet"
            description="Record or upload your first voice memo above."
          />
        ) : (
          <ul className="audio-page__entries" aria-label="Voice memo list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <AudioEntryCard
                  entry={entry}
                  onDelete={remove}
                  onUpdate={update}
                  journalAction={journal.actionFor(entry.id)}
                  onUseTranscript={journal.saveOrOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Fixed bottom-right: the page reserves room so it never covers a card. */}
      <AccessibilityWidget />
    </main>
  )
}
