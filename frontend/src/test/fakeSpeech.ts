/**
 * Stand-in for the browser's Web Speech API, so the read-aloud engine can be
 * tested without a real synthesiser (jsdom provides neither `speechSynthesis`
 * nor `SpeechSynthesisUtterance`).
 *
 * `speak()` only records the utterances: the test decides when a chunk ends or
 * fails, which is what `utils/speech.ts` reacts to.
 */

import { vi } from 'vitest'

export interface VoiceLike {
  lang: string
  name?: string
}

export interface FakeUtterance {
  text: string
  voice: VoiceLike | null
  lang: string
  rate: number
  pitch: number
  onend: ((event?: unknown) => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

export interface SpeechStub {
  /** Every utterance handed to `speak()`, in order. */
  utterances: FakeUtterance[]
  calls: { cancel: () => number; pause: () => number; resume: () => number }
  /** Fire `onend` on the queued utterances, as the engine would when it finishes. */
  finishAll(): void
  finishOne(index: number): void
  /** Fire `onerror` on one utterance, with the browser's own error name. */
  failOne(index: number, error: string): void
  restore(): void
}

export function installSpeech(options: { voices?: VoiceLike[] } = {}): SpeechStub {
  const voices = (options.voices ?? []).map((voice) => ({
    lang: voice.lang,
    name: voice.name ?? `voice-${voice.lang}`,
    default: false,
    localService: true,
  }))

  const utterances: FakeUtterance[] = []
  const counts = { cancel: 0, pause: 0, resume: 0 }

  class StubUtterance {
    text: string
    voice: VoiceLike | null = null
    lang = ''
    rate = 1
    pitch = 1
    onend: ((event?: unknown) => void) | null = null
    onerror: ((event: { error?: string }) => void) | null = null

    constructor(text: string) {
      this.text = text
    }
  }

  const synth = {
    speak: vi.fn((utterance: StubUtterance) => {
      utterances.push(utterance)
    }),
    cancel: vi.fn(() => {
      counts.cancel += 1
    }),
    pause: vi.fn(() => {
      counts.pause += 1
    }),
    resume: vi.fn(() => {
      counts.resume += 1
    }),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onvoiceschanged: null,
    speaking: false,
    paused: false,
    pending: false,
  }

  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: synth,
  })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: StubUtterance,
  })

  return {
    utterances,
    calls: {
      cancel: () => counts.cancel,
      pause: () => counts.pause,
      resume: () => counts.resume,
    },
    finishAll() {
      for (const utterance of [...utterances]) {
        utterance.onend?.()
      }
    },
    finishOne(index) {
      utterances[index]?.onend?.()
    },
    failOne(index, error) {
      utterances[index]?.onerror?.({ error })
    },
    restore() {
      delete (window as { speechSynthesis?: unknown }).speechSynthesis
      delete (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance
    },
  }
}

/** The state a browser with no Web Speech API at all is in. */
export function installNoSpeech(): void {
  delete (window as { speechSynthesis?: unknown }).speechSynthesis
  delete (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance
}
