import { afterEach, describe, expect, it, vi } from 'vitest'

import { installSpeechMock } from '../../test/speechMock'
import {
  detectSpeechLanguage,
  isSpeechSupported,
  pickVoice,
} from './speech'

function voice(lang: string, name = lang): SpeechSynthesisVoice {
  return { default: false, lang, localService: true, name, voiceURI: name }
}

describe('detectSpeechLanguage', () => {
  afterEach(() => {
    document.documentElement.lang = ''
  })

  it('detects French from accents and common words', () => {
    expect(
      detectSpeechLanguage('Une journée très fière avec ma famille.'),
    ).toBe('fr-FR')
  })

  it('detects English from common words', () => {
    expect(
      detectSpeechLanguage('A calm morning walk with the family.'),
    ).toBe('en-US')
  })

  it('falls back to the document language when the scores tie', () => {
    document.documentElement.lang = 'fr'
    expect(detectSpeechLanguage('the souvenir')).toBe('fr-FR')

    document.documentElement.lang = 'en-GB'
    expect(detectSpeechLanguage('the souvenir')).toBe('en-US')
  })

  it('falls back to English when the text says nothing', () => {
    document.documentElement.lang = ''
    expect(detectSpeechLanguage('')).toBe('en-US')
  })
})

describe('pickVoice', () => {
  it('prefers an exact locale match', () => {
    const canadian = voice('fr-CA')
    const french = voice('fr-FR')

    expect(pickVoice([canadian, french], 'fr-FR')).toBe(french)
  })

  it('normalizes underscores in voice locales', () => {
    const french = voice('fr_FR')

    expect(pickVoice([french], 'fr-FR')).toBe(french)
  })

  it('accepts another locale of the same language', () => {
    const canadian = voice('fr-CA')

    expect(pickVoice([canadian, voice('en-US')], 'fr-FR')).toBe(canadian)
  })

  it('accepts a bare language voice', () => {
    const bare = voice('fr')

    expect(pickVoice([bare], 'fr-FR')).toBe(bare)
  })

  it('returns null when no voice matches the language', () => {
    expect(pickVoice([voice('en-US')], 'fr-FR')).toBeNull()
    expect(pickVoice([], 'fr-FR')).toBeNull()
  })
})

describe('isSpeechSupported', () => {
  it('reports when the browser has no speech synthesis', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)

    expect(isSpeechSupported()).toBe(false)
  })

  it('reports when the Web Speech API is available', () => {
    installSpeechMock()

    expect(isSpeechSupported()).toBe(true)
  })
})
