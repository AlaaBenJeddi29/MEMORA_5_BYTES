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
 * The transcript of the memo just analysed is injected automatically into the
 * journal banner (feature "réinjection automatique"). The journal form itself
 * lives in the journal module; once `/api/journal/entries/` exists this banner
 * becomes a navigate-with-prefill.
 */

import { useEffect, useRef, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { AudioEntryCard } from '../components/AudioEntryCard'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { useAudioEntries } from '../hooks/useAudioEntries'

export function AudioListPage() {
  useDocumentTitle('Audio & voice memos · MEMORA')

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

      {/* ------------------------------------------------------------------ */}
      {/* Transcript injection banner                                         */}
      {/* ------------------------------------------------------------------ */}
      {injectedTranscript && (
        <section className="audio-page__transcript-banner" aria-live="polite">
          <Alert variant="success">
            <strong>Transcript ready to use in your journal:</strong>
            <blockquote className="audio-page__quote">{injectedTranscript}</blockquote>
            <Button size="sm" variant="ghost" onClick={dismissAnalysis}>
              Dismiss
            </Button>
          </Alert>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Record a new memo                                                   */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Upload an existing file                                             */}
      {/* ------------------------------------------------------------------ */}
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
                  onUseTranscript={(t) => setInjectedTranscript(t)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
