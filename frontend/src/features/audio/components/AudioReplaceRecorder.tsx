/**
 * AudioReplaceRecorder — microphone recorder used to replace the recording of an
 * already saved voice memo.
 *
 * It is the recording half of the "Re-record" action inside an AudioEntryCard:
 * the page-level VoiceRecorder creates *new* memos through POST, this one hands
 * the blob back so the card can PATCH it onto the existing entry, which sends
 * the memo through the AI pipeline again.
 *
 * Only stops the microphone and previews the take; the user confirms before
 * anything is sent, because a new recording overwrites the stored AI results.
 */

import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'

interface AudioReplaceRecorderProps {
  /** Resolves once the PATCH answer is known. */
  onFile: (file: File) => Promise<void>
  /** True while the replacement is being uploaded. */
  busy: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function AudioReplaceRecorder({ onFile, busy }: AudioReplaceRecorderProps) {
  const { state, elapsed, audioBlob, previewUrl, start, stop, reset, errorMessage } =
    useAudioRecorder()

  async function handleSend() {
    if (!audioBlob) return
    // Date-stamped name: storage keeps both takes until the old one is deleted.
    const file = new File([audioBlob], `memo_${Date.now()}.webm`, { type: audioBlob.type })
    await onFile(file)
  }

  return (
    <div className="voice-recorder voice-recorder--replace" aria-label="Re-record this memo">
      <p className="audio-card__replace-note">
        Sending a new recording replaces the transcript, the language, the
        sentiment and the summary — and discards the corrections typed above.
      </p>

      {state === 'recording' && (
        <div className="voice-recorder__recording" role="status" aria-live="polite">
          <span className="voice-recorder__dot" aria-hidden="true" />
          <span className="voice-recorder__time">{formatTime(elapsed)}</span>
          <span className="sr-only">Recording in progress</span>
        </div>
      )}

      {state === 'stopped' && previewUrl && (
        <div className="voice-recorder__preview">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={previewUrl} className="voice-recorder__audio" />
        </div>
      )}

      {state === 'error' && errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      <div className="voice-recorder__controls">
        {(state === 'idle' || state === 'error') && (
          <Button size="sm" onClick={start} variant="primary" disabled={busy}>
            🎙 Start recording
          </Button>
        )}

        {state === 'requesting' && (
          <Button size="sm" disabled variant="secondary">
            Requesting microphone…
          </Button>
        )}

        {state === 'recording' && (
          <Button size="sm" onClick={stop} variant="danger" aria-label="Stop recording">
            ⏹ Stop
          </Button>
        )}

        {state === 'stopped' && (
          <>
            <Button
              size="sm"
              onClick={handleSend}
              variant="primary"
              disabled={busy}
              aria-label="Replace the memo audio with this recording"
            >
              {busy ? 'Sending…' : '⬆ Replace with this take'}
            </Button>
            <Button size="sm" onClick={reset} variant="secondary" disabled={busy}>
              🔄 Re-record
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
