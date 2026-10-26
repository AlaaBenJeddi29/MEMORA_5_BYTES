import { vi } from 'vitest'

/** Minimal stand-in for SpeechSynthesisUtterance, including its events. */
export class MockUtterance {
  static instances: MockUtterance[] = []

  text: string
  lang = ''
  rate = 1
  pitch = 1
  volume = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: ((event: SpeechSynthesisEvent) => void) | null = null
  onend: ((event: SpeechSynthesisEvent) => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null

  constructor(text: string) {
    this.text = text
    MockUtterance.instances.push(this)
  }
}

/** Installs a deterministic speechSynthesis mock for a test. */
export function installSpeechMock(voices: SpeechSynthesisVoice[] = []) {
  MockUtterance.instances = []

  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
  }

  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)

  return {
    synth,
    latest: () => MockUtterance.instances[MockUtterance.instances.length - 1],
    count: () => MockUtterance.instances.length,
  }
}

export function resetUtterances(): void {
  MockUtterance.instances = []
}
