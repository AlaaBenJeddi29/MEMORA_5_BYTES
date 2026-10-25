/**
 * useAudioRecorder — MediaRecorder API wrapper.
 *
 * Provides start / stop / reset controls and exposes the recorded blob
 * once recording stops.  Handles browser permission errors gracefully.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error'

export interface UseAudioRecorderReturn {
  state: RecorderState
  /** Elapsed recording time in seconds. */
  elapsed: number
  /** The recorded audio blob, available when state === 'stopped'. */
  audioBlob: Blob | null
  /** URL to preview the recorded audio, available when state === 'stopped'. */
  previewUrl: string | null
  /** Start recording. Requests microphone permission if needed. */
  start: () => Promise<void>
  /** Stop recording. */
  stop: () => void
  /** Reset to idle, clearing the recorded blob and preview URL. */
  reset: () => void
  /** Error message when state === 'error'. */
  errorMessage: string | null
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // The unmount effect below runs once, so it reads the URL through a ref
  // instead of the state value captured at mount.
  const previewUrlRef = useRef<string | null>(null)

  // Clean up object URLs and streams on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async () => {
    setState('requesting')
    setErrorMessage(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Prefer webm/opus; fall back to whatever the browser supports.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        setAudioBlob(blob)
        setPreviewUrl(url)
        setState('stopped')
        if (timerRef.current) clearInterval(timerRef.current)
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start(250) // collect data every 250 ms
      setState('recording')
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      setState('error')
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Microphone access denied. Please allow microphone in your browser.')
      } else {
        setErrorMessage('Could not start recording. Check your microphone.')
      }
    }
  }, [])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    mediaRecorderRef.current = null
    streamRef.current = null
    chunksRef.current = []
    setAudioBlob(null)
    setPreviewUrl(null)
    setElapsed(0)
    setErrorMessage(null)
    setState('idle')
  }, [])

  return { state, elapsed, audioBlob, previewUrl, start, stop, reset, errorMessage }
}
