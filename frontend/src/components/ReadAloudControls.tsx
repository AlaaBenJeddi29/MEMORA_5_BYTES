import { useEffect, useRef } from 'react'

import { Button } from './Button'
import { useSpeech } from '../hooks/useSpeech'
import type { SpeechField } from '../utils/speech'

/** Id of the page-level notice shown when the browser has no `speechSynthesis`. */
export const SPEECH_UNSUPPORTED_NOTICE_ID = 'speech-unsupported-notice'

const FIELD_TITLE: Record<SpeechField, string> = {
  transcript: 'transcript',
  summary: 'summary',
  assistant: 'assistant answer',
}

interface ReadAloudControlsProps {
  /** Memo the text belongs to — part of the speaker key `<id>:<field>`. */
  entryId: number
  field: SpeechField
  text: string | null | undefined
  /** ISO 639-1 code detected by the AI, so a French memo gets a French voice. */
  lang?: string | null
  /** Phrased subject for the accessible name, e.g. "the transcript of the memo from …". */
  subject: string
}

/**
 * Read-aloud controls for one piece of text, driven by the browser's own Web
 * Speech API through `utils/speech.ts`. Nothing here touches the recorded file:
 * the text the AI produced is spoken, the `<audio>` player stays untouched.
 *
 * Because the speaker is global, only the control whose text is playing shows
 * Pause / Resume / Stop, and starting another text simply replaces the reading.
 */
export function ReadAloudControls({
  entryId,
  field,
  text,
  lang,
  subject,
}: ReadAloudControlsProps) {
  const key = `${entryId}:${field}`
  const { state, supported, isReading, isPaused, start, pause, resume, stop } = useSpeech()

  const reading = isReading(key)
  const paused = isPaused(key)
  const error = state.errorKey === key ? state.error : null
  const title = FIELD_TITLE[field]

  // The card swaps these controls away when it enters edit mode; the engine is
  // outside React, so it would otherwise keep speaking with no Pause/Stop left.
  const readingRef = useRef(reading)
  useEffect(() => {
    readingRef.current = reading
  }, [reading])
  useEffect(
    () => () => {
      if (readingRef.current) {
        stop()
      }
    },
    [stop],
  )

  return (
    <div className="read-aloud">
      {reading ? (
        <div className="read-aloud__controls">
          <Button
            size="sm"
            variant="secondary"
            onClick={paused ? resume : pause}
            aria-label={paused ? `Resume reading ${subject}` : `Pause reading ${subject}`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={stop}
            aria-label={`Stop reading ${subject}`}
          >
            ⏹ Stop
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => start({ key, field, text: text ?? '', lang })}
          aria-label={`Read ${subject} aloud`}
          aria-describedby={supported ? undefined : SPEECH_UNSUPPORTED_NOTICE_ID}
        >
          🔊 Read {title}
        </Button>
      )}

      {reading && (
        <p className="read-aloud__status" role="status">
          {paused ? `Paused — ${subject}` : `Reading ${subject}…`}
        </p>
      )}

      {error && (
        <p className="read-aloud__error" role="alert">
          ⚠ {error}
        </p>
      )}
    </div>
  )
}
