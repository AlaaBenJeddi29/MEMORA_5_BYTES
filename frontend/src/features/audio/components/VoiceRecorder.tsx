/**
 * VoiceRecorder — MediaRecorder-based recording UI.
 *
 * Shows:
 *  - Idle: "Start recording" button
 *  - Recording: animated indicator + elapsed time + "Stop" button
 *  - Stopped: audio preview + "Send & transcribe" / "Re-record" buttons
 *  - Analysing: live AI status (upload → pending → processing → done/failed)
 *  - Error: error message
 *
 * The analysis status comes from `analysis`, the entry returned by the upload
 * and kept fresh by polling, so the user sees the live pipeline instead of a
 * frozen button.
 */

import type { AudioEntry } from '../types/audio'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { Button } from '../../../components/Button'
import { Alert } from '../../../components/Alert'
import { Icon } from '../../../components/Icon'

interface VoiceRecorderProps {
  onUpload: (file: File) => Promise<AudioEntry | null>
  uploading: boolean
  uploadError: string | null
  /** The memo uploaded in this session, updated live by polling. */
  analysis?: AudioEntry | null
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

type AnalysisStage = 'uploading' | 'queued' | 'processing' | 'succeeded' | 'failed'

function analysisStage(
  uploading: boolean,
  analysis: AudioEntry | null | undefined,
): AnalysisStage | null {
  if (analysis) {
    if (analysis.status === 'succeeded') return 'succeeded'
    if (analysis.status === 'failed') return 'failed'
    if (analysis.status === 'processing') return 'processing'
    return 'queued'
  }
  return uploading ? 'uploading' : null
}

const STAGE_TEXT: Record<AnalysisStage, string> = {
  uploading: 'Uploading your memo…',
  queued: 'Memo received — queued for transcription…',
  processing: 'Transcribing and reading language, sentiment and summary on your server…',
  succeeded: 'Analysis complete.',
  failed: 'Analysis failed.',
}

const WAVE_BARS = Array.from({ length: 18 }, (_, index) => index)

export function VoiceRecorder({ onUpload, uploading, uploadError, analysis }: VoiceRecorderProps) {
  const { state, elapsed, audioBlob, previewUrl, start, stop, reset, errorMessage } =
    useAudioRecorder()

  const stage = analysisStage(uploading, analysis)

  async function handleUpload() {
    if (!audioBlob) return
    const file = new File([audioBlob], `memo_${Date.now()}.webm`, { type: audioBlob.type })
    const entry = await onUpload(file)
    if (entry) reset()
  }

  return (
    <section aria-label="Voice recorder" className={`voice-recorder voice-recorder--${state}`}>
      <div className="voice-recorder__stage">
        <div className="voice-recorder__orb" aria-hidden="true">
          <Icon name={state === 'recording' ? 'wave' : 'mic'} size={30} strokeWidth={1.4} />
        </div>

        <div className="voice-recorder__copy">
          <p className="voice-recorder__eyebrow">Voice recorder</p>
          <p className="voice-recorder__lead">
            {state === 'recording'
              ? 'Listening…'
              : state === 'requesting'
                ? 'Waiting for your microphone…'
                : state === 'stopped'
                  ? 'Your take is ready.'
                  : state === 'error'
                    ? 'The microphone didn’t start.'
                    : 'Ready when you are.'}
          </p>
          <p className="voice-recorder__hint">
            {state === 'recording'
              ? 'Speak naturally. You can listen back before sending.'
              : state === 'requesting'
                ? 'Allow microphone access in your browser to begin.'
                : state === 'stopped'
                  ? 'Listen back, then send it for transcription.'
                  : 'Your memo stays on your server and is transcribed by the AI configured there.'}
          </p>
        </div>

        {state === 'recording' && (
          <div className="voice-recorder__wave" aria-hidden="true">
            {WAVE_BARS.map((bar) => (
              <span key={bar} />
            ))}
          </div>
        )}
      </div>

      {/* ---- Recording indicator ---- */}
      {state === 'recording' && (
        <div className="voice-recorder__recording" role="status" aria-live="polite">
          <span className="voice-recorder__dot" aria-hidden="true" />
          <span className="voice-recorder__time">{formatTime(elapsed)}</span>
          <span className="sr-only">Recording in progress</span>
        </div>
      )}

      {/* ---- Audio preview ---- */}
      {state === 'stopped' && previewUrl && (
        <div className="voice-recorder__preview">
          <audio controls src={previewUrl} className="voice-recorder__audio" />
        </div>
      )}

      {/* ---- Live AI analysis status ---- */}
      {stage && (
        <p
          className={`voice-recorder__status voice-recorder__status--${stage}`}
          role="status"
          aria-live="polite"
        >
          {STAGE_TEXT[stage]}
          {stage === 'succeeded' && analysis?.language_name && (
            <span className="voice-recorder__status-detail">
              {' '}
              {analysis.language_name} · {analysis.sentiment ?? 'neutral'} sentiment
            </span>
          )}
          {stage === 'failed' && analysis?.error ? ` ${analysis.error}` : ''}
        </p>
      )}

      {/* ---- Error messages ---- */}
      {(state === 'error' || errorMessage) && (
        <Alert variant="error">{errorMessage ?? 'An error occurred.'}</Alert>
      )}
      {uploadError && <Alert variant="error">{uploadError}</Alert>}

      {/* ---- Controls ---- */}
      <div className="voice-recorder__controls">
        {(state === 'idle' || state === 'error') && (
          <Button onClick={start} variant="primary" aria-label="Start recording" disabled={uploading}>
            <Icon name="mic" size={16} />
            Start recording
          </Button>
        )}

        {state === 'requesting' && (
          <Button disabled variant="secondary">
            Requesting microphone…
          </Button>
        )}

        {state === 'recording' && (
          <Button onClick={stop} variant="danger" aria-label="Stop recording">
            <Icon name="stop" size={15} />
            Stop
          </Button>
        )}

        {state === 'stopped' && (
          <>
            <Button
              onClick={handleUpload}
              variant="primary"
              disabled={uploading}
              aria-label="Upload and transcribe recording"
            >
              <Icon name="send" size={16} />
              {uploading ? 'Uploading…' : 'Send & transcribe'}
            </Button>
            <Button onClick={reset} variant="secondary" disabled={uploading}>
              <Icon name="repeat" size={15} />
              Re-record
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
