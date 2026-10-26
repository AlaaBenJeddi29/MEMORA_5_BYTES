/**
 * AudioListPage — main page for the audio / voice memo feature.
 *
 * Layout:
 *   - PageHeader with title
 *   - VoiceRecorder component (record → upload → live AI status)
 *   - File upload fallback (for pre-recorded .mp3 / .wav files)
 *   - List of AudioEntryCards (with polling for pending/processing entries,
 *     inline correction of the transcript/summary and audio replacement)
 *
 * The transcript of the memo just analysed is offered in a banner, and can be
 * carried into a new journal entry through the router (no invented data: the
 * text comes from the transcript the backend returned).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { PageHeader } from '../../../components/PageHeader'
import { SPEECH_UNSUPPORTED_NOTICE_ID } from '../../../components/ReadAloudControls'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useSpeech, useStopSpeechOnLeave } from '../../../hooks/useSpeech'
import { UNSUPPORTED_MESSAGE } from '../../../utils/speech'
import { AudioEntryCard } from '../components/AudioEntryCard'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { useAudioEntries } from '../hooks/useAudioEntries'
import '../audio.css'

export function AudioListPage() {
  useDocumentTitle('Voice memos · MEMORA')

  const navigate = useNavigate()

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
    refresh,
    activeEntry,
    clearActive,
  } = useAudioEntries()

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

  function openInJournal(transcript: string) {
    navigate('/app/journal?new=1', {
      state: { prefillText: transcript },
    })
  }

  return (
    <div className="audio-page">
      <PageHeader
        eyebrow="Voice & sound"
        title="Voice memos"
        description="Record or upload a thought. Your own backend transcribes it, detects the spoken language, reads the sentiment and writes a short summary."
      />

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
            <p className="audio-page__transcript-title">Transcript ready to use in your journal</p>
            <blockquote className="audio-page__quote">{injectedTranscript}</blockquote>
            <div className="audio-page__transcript-actions">
              <Button size="sm" onClick={() => openInJournal(injectedTranscript)}>
                <Icon name="pen" size={14} />
                Open in journal
                <Icon name="arrowRight" size={14} />
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissAnalysis}>
                Dismiss
              </Button>
            </div>
          </Alert>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Capture: recorder + file upload                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="audio-page__capture">
        <section className="audio-panel audio-page__recorder" aria-labelledby="recorder-heading">
          <header className="audio-panel__head">
            <p className="eyebrow">New memo</p>
            <h2 id="recorder-heading">Record a voice note</h2>
            <p className="audio-panel__desc">
              Speak for as long as you need. You can listen back before it leaves your device.
            </p>
          </header>

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

        <section className="audio-panel audio-page__upload" aria-labelledby="upload-heading">
          <header className="audio-panel__head">
            <p className="eyebrow">Already recorded?</p>
            <h2 id="upload-heading">Upload a file</h2>
            <p className="audio-panel__desc">
              Bring in a recording from your phone or another app.
            </p>
          </header>

          <div className="audio-upload">
            <span className="audio-upload__icon" aria-hidden="true">
              <Icon name="upload" size={22} />
            </span>
            <p className="audio-upload__formats">
              <strong>MP3, WAV, WebM or MP4 audio</strong>
              <span>Up to 25 MB per file</span>
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
              <Icon name="folder" size={15} />
              {uploading ? 'Uploading…' : 'Choose a file'}
            </Button>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* List                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="audio-page__list" aria-labelledby="list-heading">
        <div className="audio-page__list-head">
          <div>
            <p className="eyebrow">Archived</p>
            <h2 id="list-heading">Your voice memos</h2>
          </div>
          {!loading && entries.length > 0 && (
            <p className="audio-page__count">
              {entries.length} {entries.length === 1 ? 'memo' : 'memos'}
            </p>
          )}
        </div>

        {fetchError && (
          <Alert variant="error" title="We couldn’t load your voice memos">
            {fetchError}
            <div className="alert__actions">
              <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          </Alert>
        )}

        {updateError && (
          <Alert variant="error" title="That change didn’t save">
            {updateError}
            <div className="alert__actions">
              <Button size="sm" variant="ghost" onClick={clearUpdateError}>
                Dismiss
              </Button>
            </div>
          </Alert>
        )}

        {loading ? (
          <div className="audio-skeleton-list" role="status" aria-live="polite">
            <span className="sr-only">Loading voice memos…</span>
            <div className="audio-skeleton" aria-hidden="true" />
            <div className="audio-skeleton" aria-hidden="true" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon="mic"
            title="No voice memos yet"
            description="Record or upload your first voice memo above. Transcription and analysis begin as soon as it arrives."
          />
        ) : (
          <ul className="audio-page__entries" aria-label="Voice memo list" aria-busy={uploading}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <AudioEntryCard
                  entry={entry}
                  onDelete={remove}
                  onUpdate={update}
                  onUseTranscript={(entry) => openInJournal(entry.transcript ?? '')}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
