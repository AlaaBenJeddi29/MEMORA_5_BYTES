/**
 * Read-aloud engine on top of the browser's own Web Speech API
 * (`window.speechSynthesis`) — no external service, no key, no audio file
 * involved. It never touches the recorded memo: it speaks the text the AI
 * produced.
 *
 * One module-level speaker on purpose: `speechSynthesis` is global, so several
 * cards cannot read independently anyway. Keeping the state here means a second
 * "Lire" click anywhere replaces the first reading instead of overlapping it,
 * and the Pause / Resume / Stop controls always act on what is really playing.
 *
 * Chrome quirks handled here:
 *   - `getVoices()` is empty until the voices finish loading, so the list is
 *     cached and refreshed on `voiceschanged`;
 *   - a long utterance is cut short after ~15 s, so the text is spoken in
 *     sentence-sized chunks and the state only returns to `idle` after the last
 *     one.
 */

import { announce } from './announcements'

export type SpeechStatus = 'idle' | 'playing' | 'paused'
export type SpeechField = 'transcript' | 'summary' | 'assistant'

export interface SpeechState {
  status: SpeechStatus
  /** `"<entryId>:<field>"` of the text being read, null when nothing is. */
  key: string | null
  /** Last failure or unsupported-browser message, cleared by the next attempt. */
  error: string | null
  /** Which control asked for that message, so only its own card shows it. */
  errorKey: string | null
}

export interface SpeakRequest {
  key: string
  field: SpeechField
  text: string
  /** ISO 639-1 code detected by the AI (`language_code`), e.g. "fr". */
  lang?: string | null
  /** BCP 47 tag chosen by the user, e.g. "fr-FR". */
  voiceLang?: string | null
  /** A device voice resolved by the caller; null lets the engine fall back. */
  voice?: SpeechSynthesisVoice | null
  /** Reading speed; 1 is the browser default. */
  rate?: number
}

export const UNSUPPORTED_MESSAGE =
  'This browser does not support speech synthesis. Use Chrome, Edge or Safari to listen to the text.'

/** Under Chrome's ~15 s cut-off, and still natural to listen to. */
const MAX_CHUNK_CHARS = 180

export const SPEECH_LABELS: Record<SpeechField, string> = {
  transcript: 'transcript',
  summary: 'summary',
  assistant: 'assistant answer',
}

let state: SpeechState = { status: 'idle', key: null, error: null, errorKey: null }
const listeners = new Set<() => void>()

/** Bumped by every new speak/stop so stale utterance callbacks are ignored. */
let generation = 0
let voiceCache: SpeechSynthesisVoice[] = []
let voicesWired = false

function engine(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null
  }
  return window.speechSynthesis
}

export function isSpeechSupported(): boolean {
  return engine() !== null && typeof window.SpeechSynthesisUtterance === 'function'
}

export function getSpeechState(): SpeechState {
  return state
}

export function subscribeToSpeech(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setState(next: SpeechState): void {
  state = next
  for (const listener of listeners) {
    listener()
  }
}

/** Chrome loads the voice list asynchronously; refresh it as soon as it can. */
function readVoices(): SpeechSynthesisVoice[] {
  const synth = engine()
  if (!synth) {
    return []
  }
  if (!voicesWired) {
    voicesWired = true
    try {
      synth.addEventListener('voiceschanged', () => {
        voiceCache = synth.getVoices()
      })
    } catch {
      // Older engines expose onvoiceschanged only.
      synth.onvoiceschanged = () => {
        voiceCache = synth.getVoices()
      }
    }
  }
  const live = synth.getVoices()
  if (live.length > 0) {
    voiceCache = live
  }
  return voiceCache
}

/**
 * Best voice for the language the AI detected: exact tag first ("fr-FR"), then
 * any voice whose tag starts with the code ("fr", "fr-FR", "fr_CA"…). Without a
 * match the tag is still sent, which lets the engine fall back to its own
 * default for that language.
 */
export function pickVoice(lang?: string | null): SpeechSynthesisVoice | null {
  const voices = readVoices()
  const wanted = (lang ?? '').trim().toLowerCase().replace('_', '-')
  if (!voices.length || !wanted) {
    return null
  }
  const normalised = (value: string) => value.toLowerCase().replace('_', '-')
  return (
    voices.find((voice) => normalised(voice.lang) === wanted) ??
    voices.find((voice) => normalised(voice.lang).startsWith(wanted.slice(0, 2))) ??
    null
  )
}

/** Sentence-boundary chunks, hard-split only when a sentence alone is too long. */
export function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim()
    if (!sentence) {
      continue
    }
    if (sentence.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      let rest = sentence
      while (rest.length > MAX_CHUNK_CHARS) {
        const cutAt = rest.lastIndexOf(' ', MAX_CHUNK_CHARS)
        const boundary = cutAt > 0 ? cutAt : MAX_CHUNK_CHARS
        chunks.push(rest.slice(0, boundary).trim())
        rest = rest.slice(boundary).trim()
      }
      current = rest
      continue
    }
    if ((`${current} ${sentence}`).trim().length > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = sentence
    } else {
      current = `${current} ${sentence}`.trim()
    }
  }
  if (current) {
    chunks.push(current)
  }
  return chunks
}

export function speak(request: SpeakRequest): void {
  const synth = engine()
  const label = SPEECH_LABELS[request.field]

  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
    setState({ status: 'idle', key: null, error: UNSUPPORTED_MESSAGE, errorKey: request.key })
    announce(UNSUPPORTED_MESSAGE)
    return
  }

  const text = request.text.trim()
  if (!text) {
    const message = `This ${label} is still empty, so there is nothing to read.`
    setState({ status: 'idle', key: null, error: message, errorKey: request.key })
    announce(message)
    return
  }

  // Never two voices at once: whatever was playing is replaced.
  synth.cancel()
  generation += 1
  const ownGeneration = generation

  const lang = request.voiceLang ?? request.lang
  const voice = request.voice ?? pickVoice(lang)
  const rate = Math.min(Math.max(request.rate ?? 1, 0.5), 2)
  const chunks = splitIntoChunks(text)
  let finished = 0

  setState({ status: 'playing', key: request.key, error: null, errorKey: null })
  announce(voice ? `Reading the ${label} with a ${voice.lang} voice` : `Reading the ${label}`)

  for (const chunk of chunks) {
    const utterance = new window.SpeechSynthesisUtterance(chunk)
    if (voice) {
      utterance.voice = voice
    }
    utterance.lang = voice?.lang ?? lang ?? ''
    utterance.rate = rate
    utterance.pitch = 1

    utterance.onend = () => {
      if (ownGeneration !== generation) {
        return
      }
      finished += 1
      if (finished >= chunks.length) {
        setState({ status: 'idle', key: null, error: null, errorKey: null })
        announce(`End of the ${label}`)
      }
    }

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (ownGeneration !== generation) {
        return
      }
      // 'canceled'/'interrupted' are our own stop() or the next speak().
      if (event.error === 'canceled' || event.error === 'interrupted') {
        return
      }
      generation += 1
      synth.cancel()
      const message = describeSpeechError(event.error)
      setState({ status: 'idle', key: null, error: message, errorKey: request.key })
      announce(message)
    }

    synth.speak(utterance)
  }
}

export function pauseSpeech(): void {
  const synth = engine()
  if (!synth || state.status !== 'playing') {
    return
  }
  synth.pause()
  setState({ ...state, status: 'paused' })
  announce('Reading paused')
}

export function resumeSpeech(): void {
  const synth = engine()
  if (!synth || state.status !== 'paused') {
    return
  }
  synth.resume()
  setState({ ...state, status: 'playing' })
  announce('Reading resumed')
}

export function stopSpeech(): void {
  const synth = engine()
  const wasReading = state.status !== 'idle'
  generation += 1
  synth?.cancel()
  if (wasReading) {
    setState({ status: 'idle', key: null, error: null, errorKey: null })
    announce('Reading stopped')
  }
}

/** Used when leaving a page: silence without pretending something was playing. */
export function cancelSpeech(): void {
  generation += 1
  engine()?.cancel()
  setState({ status: 'idle', key: null, error: null, errorKey: null })
}

function describeSpeechError(error: string | undefined): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The browser blocked the reading. Interact with the page and try again.'
    case 'synthesis-failed':
    case 'synthesis-unavailable':
      return 'Speech synthesis is unavailable right now. Try again in a moment.'
    case 'voice-unavailable':
      return 'No voice is installed for this language yet.'
    case 'language-unavailable':
      return 'This language cannot be spoken by the browser.'
    default:
      return 'The reading could not be played. Try again.'
  }
}
