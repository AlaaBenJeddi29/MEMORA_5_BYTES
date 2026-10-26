import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Button } from '../../../components/Button'
import {
  getSpeechSnapshot,
  isSpeechSupported,
  pauseSpeech,
  resumeSpeech,
  speakSummary,
  stopSpeech,
  subscribeSpeech,
} from '../speech'

export interface SummaryAudioPlayerProps {
  summaryId: number
  /** The exact summary text shown on the page. */
  text: string
}

const RATES = [
  { value: 0.75, label: '0,75×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1,25×' },
  { value: 1.5, label: '1,5×' },
] as const

function SpeakerIcon() {
  return (
    <svg
      className="summary-audio__icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg
      className="summary-audio__icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      className="summary-audio__icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg
      className="summary-audio__icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function mainControl(
  status: 'idle' | 'speaking' | 'paused',
  completed: boolean,
): { label: string; icon: ReactNode } {
  if (status === 'speaking') {
    return { label: 'Mettre en pause', icon: <PauseIcon /> }
  }
  if (status === 'paused') {
    return { label: 'Reprendre l’écoute', icon: <PlayIcon /> }
  }
  if (completed) {
    return { label: 'Réécouter ce souvenir', icon: <SpeakerIcon /> }
  }
  return { label: 'Écouter ce souvenir', icon: <SpeakerIcon /> }
}

/**
 * Reads the summary already displayed on the page through the browser's
 * speech synthesis. No summary text leaves the device.
 */
export function SummaryAudioPlayer({ summaryId, text }: SummaryAudioPlayerProps) {
  const speech = useSyncExternalStore(
    subscribeSpeech,
    getSpeechSnapshot,
    getSpeechSnapshot,
  )
  const [rate, setRate] = useState<number>(1)

  const ownerId = `summary-${summaryId}`
  const trimmedText = text.trim()
  const supported = isSpeechSupported()

  useEffect(() => {
    return () => {
      stopSpeech(ownerId)
    }
  }, [ownerId, trimmedText])

  if (!trimmedText) {
    return null
  }

  if (!supported) {
    return (
      <p className="summary-audio summary-audio--unavailable" role="note">
        La lecture audio n’est pas disponible dans ce navigateur.
      </p>
    )
  }

  const active = speech.ownerId === ownerId
  const status = active ? speech.status : 'idle'
  const completed = !active && speech.completedOwner === ownerId
  const hasError = speech.errorOwner === ownerId
  const control = mainControl(status, completed)

  function handleMain() {
    if (status === 'speaking') {
      pauseSpeech(ownerId)
      return
    }
    if (status === 'paused') {
      resumeSpeech(ownerId)
      return
    }
    speakSummary({ ownerId, text: trimmedText, rate })
  }

  function handleStop() {
    stopSpeech(ownerId)
  }

  function handleRateChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextRate = Number(event.target.value)
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      return
    }
    setRate(nextRate)
    if (status === 'speaking' || status === 'paused') {
      speakSummary({ ownerId, text: trimmedText, rate: nextRate })
    }
  }

  return (
    <div className="summary-audio" role="group" aria-label="Lecture audio du souvenir">
      <Button
        variant="secondary"
        size="sm"
        className="summary-audio__main"
        onClick={handleMain}
      >
        {control.icon}
        {control.label}
      </Button>

      {active && (
        <Button variant="secondary" size="sm" onClick={handleStop}>
          <StopIcon />
          Arrêter
        </Button>
      )}

      <label className="summary-audio__rate">
        <span>Vitesse</span>
        <select
          aria-label="Vitesse de lecture"
          value={String(rate)}
          onChange={handleRateChange}
        >
          {RATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <span className="summary-audio__status" role="status" aria-live="polite">
        {status === 'speaking' && (
          <>
            <span className="summary-audio__dot" aria-hidden="true" />
            Lecture en cours
          </>
        )}
        {status === 'paused' && 'Lecture en pause'}
        {completed && 'Lecture terminée'}
      </span>

      {hasError && (
        <p className="summary-audio__error" role="alert">
          La lecture audio a échoué. Réessayez.
        </p>
      )}
    </div>
  )
}
