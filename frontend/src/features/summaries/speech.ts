/**
 * One shared Web Speech queue for the whole book. Only one summary can be
 * spoken at a time, and the text never leaves the browser.
 */

export type SpeechStatus = 'idle' | 'speaking' | 'paused'

export interface SpeechState {
  status: SpeechStatus
  /** The player currently owning the synthesis queue, if any. */
  ownerId: string | null
  /** The player whose reading finished normally. */
  completedOwner: string | null
  /** The player whose reading failed. */
  errorOwner: string | null
}

export interface SpeakSummaryOptions {
  ownerId: string
  text: string
  rate?: number
}

const INITIAL_STATE: SpeechState = {
  status: 'idle',
  ownerId: null,
  completedOwner: null,
  errorOwner: null,
}

const FRENCH_MARKERS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en', 'est',
  'que', 'qui', 'pour', 'dans', 'avec', 'sur', 'pas', 'plus', 'au', 'aux',
  'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'ai', 'as', 'avons', 'avez', 'ont', 'été', 'être', 'avoir', 'faire',
  'fait', 'très', 'bien', 'tout', 'tous', 'toute', 'comme', 'mais', 'ou',
  'où', 'quand', 'jour', 'journée', 'souvenir', 'souvenirs', 'heureux',
  'heureuse', 'calme', 'famille', 'travail', 'étude', 'études', 'fier',
  'fière', 'fierté', 'triste', 'joie', 'peur', 'colère',
])

const ENGLISH_MARKERS = new Set([
  'the', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that',
  'these', 'those', 'not', 'no', 'yes', 'day', 'morning', 'evening',
  'memory', 'memories', 'happy', 'calm', 'family', 'work', 'study',
  'studies', 'proud', 'sad', 'joy', 'fear', 'anger',
])

const FRENCH_ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/u

const listeners = new Set<() => void>()

let state: SpeechState = INITIAL_STATE
let playbackToken = 0

function publish(next: SpeechState): void {
  state = next
  listeners.forEach((listener) => listener())
}

function fallbackLanguage(): string {
  const documentLang =
    typeof document === 'undefined'
      ? ''
      : document.documentElement.lang.trim().toLowerCase()

  if (documentLang.startsWith('fr')) {
    return 'fr-FR'
  }
  if (documentLang.startsWith('en')) {
    return 'en-US'
  }
  return documentLang || 'en-US'
}

/**
 * Lightweight French/English detector. It only reads the already-visible
 * summary and falls back to the document language when the text is ambiguous.
 */
export function detectSpeechLanguage(text: string): string {
  const normalized = text.normalize('NFC').toLowerCase().replace(/[’']/g, ' ')
  const words = normalized.match(/\p{L}+/gu) ?? []

  let frenchScore = FRENCH_ACCENTS.test(normalized) ? 2 : 0
  let englishScore = 0

  for (const word of words) {
    if (FRENCH_MARKERS.has(word)) {
      frenchScore += 1
    }
    if (ENGLISH_MARKERS.has(word)) {
      englishScore += 1
    }
  }

  if (frenchScore === englishScore) {
    return fallbackLanguage()
  }
  return frenchScore > englishScore ? 'fr-FR' : 'en-US'
}

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace(/_/g, '-')
}

/** Prefers an exact locale, then the same language, then the browser default. */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | null {
  const target = normalizeLang(lang)
  const base = target.split('-')[0]

  return (
    voices.find((voice) => normalizeLang(voice.lang) === target) ??
    voices.find((voice) => normalizeLang(voice.lang).startsWith(`${base}-`)) ??
    voices.find((voice) => normalizeLang(voice.lang) === base) ??
    null
  )
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof SpeechSynthesisUtterance === 'function'
  )
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSpeechSnapshot(): SpeechState {
  return state
}

function availableVoices(synth: SpeechSynthesis): SpeechSynthesisVoice[] {
  try {
    return synth.getVoices()
  } catch {
    return []
  }
}

/** Starts reading one summary, replacing any reading already in progress. */
export function speakSummary({
  ownerId,
  text,
  rate = 1,
}: SpeakSummaryOptions): void {
  const trimmed = text.trim()
  if (!trimmed || !isSpeechSupported()) {
    return
  }

  const synth = window.speechSynthesis
  playbackToken += 1
  const token = playbackToken

  try {
    synth.cancel()
  } catch {
    // A failed cancel must not prevent the new reading.
  }

  const lang = detectSpeechLanguage(trimmed)
  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.lang = lang
  utterance.rate = rate

  const voice = pickVoice(availableVoices(synth), lang)
  if (voice) {
    utterance.voice = voice
  }

  utterance.onstart = () => {
    if (token !== playbackToken) {
      return
    }
    publish({
      status: 'speaking',
      ownerId,
      completedOwner: null,
      errorOwner: null,
    })
  }

  utterance.onend = () => {
    if (token !== playbackToken) {
      return
    }
    publish({
      status: 'idle',
      ownerId: null,
      completedOwner: ownerId,
      errorOwner: null,
    })
  }

  utterance.onerror = (event) => {
    if (token !== playbackToken) {
      return
    }
    const benign = event.error === 'canceled' || event.error === 'interrupted'
    publish({
      status: 'idle',
      ownerId: null,
      completedOwner: null,
      errorOwner: benign ? null : ownerId,
    })
  }

  publish({
    status: 'speaking',
    ownerId,
    completedOwner: null,
    errorOwner: null,
  })

  try {
    synth.speak(utterance)
  } catch {
    if (token === playbackToken) {
      publish({
        status: 'idle',
        ownerId: null,
        completedOwner: null,
        errorOwner: ownerId,
      })
    }
  }
}

export function pauseSpeech(ownerId: string): void {
  if (
    !isSpeechSupported() ||
    state.ownerId !== ownerId ||
    state.status !== 'speaking'
  ) {
    return
  }

  try {
    window.speechSynthesis.pause()
  } catch {
    return
  }

  publish({ ...state, status: 'paused' })
}

export function resumeSpeech(ownerId: string): void {
  if (
    !isSpeechSupported() ||
    state.ownerId !== ownerId ||
    state.status !== 'paused'
  ) {
    return
  }

  try {
    window.speechSynthesis.resume()
  } catch {
    return
  }

  publish({ ...state, status: 'speaking' })
}

/**
 * Stops speech for one owner, or for the whole book when no owner is given.
 * Unmounting an inactive player only clears its own completion/error record.
 */
export function stopSpeech(ownerId?: string): void {
  if (ownerId !== undefined && state.ownerId !== ownerId) {
    if (state.completedOwner === ownerId || state.errorOwner === ownerId) {
      publish({
        ...state,
        completedOwner: state.completedOwner === ownerId ? null : state.completedOwner,
        errorOwner: state.errorOwner === ownerId ? null : state.errorOwner,
      })
    }
    return
  }

  playbackToken += 1
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // The queue is already unusable; resetting local state is enough.
    }
  }
  publish(INITIAL_STATE)
}
