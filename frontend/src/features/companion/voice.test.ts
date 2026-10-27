import { describe, expect, it } from 'vitest'

import type { CompanionVoicePreference } from '../../types/companion'
import {
  DEFAULT_COMPANION_VOICE,
  classifyVoiceGender,
  hasVoiceForLanguage,
  normalizeCompanionVoicePreference,
  previewText,
  resolveCompanionVoice,
  voiceRateLabel,
} from './voice'

function deviceVoice(
  name: string,
  lang: string,
  extra: Partial<SpeechSynthesisVoice> = {},
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    default: false,
    localService: true,
    voiceURI: name,
    ...extra,
  } as SpeechSynthesisVoice
}

const VOICES = [
  deviceVoice('Amelie', 'fr-FR'),
  deviceVoice('Thomas', 'fr-FR'),
  deviceVoice('Alex', 'en-US'),
  deviceVoice('Camille', 'fr-FR'),
]

describe('classifyVoiceGender', () => {
  it('classifies only voices whose name clearly identifies a gender', () => {
    expect(classifyVoiceGender({ name: 'Amelie' })).toBe('feminine')
    expect(classifyVoiceGender({ name: 'Microsoft Hortense - French' })).toBe('feminine')
    expect(classifyVoiceGender({ name: 'Thomas' })).toBe('masculine')
    expect(classifyVoiceGender({ name: 'Microsoft Paul' })).toBe('masculine')
  })

  it('uses explicit gender words without matching them inside other words', () => {
    expect(classifyVoiceGender({ name: 'Female Voice' })).toBe('feminine')
    expect(classifyVoiceGender({ name: 'Male Voice' })).toBe('masculine')
    expect(classifyVoiceGender({ name: 'Mandy' })).toBeNull()
    expect(classifyVoiceGender({ name: 'Roman' })).toBeNull()
  })

  it('never guesses for an unknown or empty name', () => {
    expect(classifyVoiceGender({ name: 'Google français' })).toBeNull()
    expect(classifyVoiceGender({ name: '' })).toBeNull()
  })
})

describe('resolveCompanionVoice', () => {
  it('picks a feminine French voice for the default preference', () => {
    const resolved = resolveCompanionVoice(VOICES, DEFAULT_COMPANION_VOICE)
    expect(resolved.voice?.name).toBe('Amelie')
    expect(resolved.genderMatched).toBe(true)
  })

  it('picks a masculine voice when that gender is selected', () => {
    const resolved = resolveCompanionVoice(VOICES, {
      gender: 'masculine',
      language: 'fr-FR',
    })
    expect(resolved.voice?.name).toBe('Thomas')
    expect(resolved.genderMatched).toBe(true)
  })

  it('matches the language by base code, so fr-CA serves a fr-FR request', () => {
    const resolved = resolveCompanionVoice(
      [deviceVoice('Amelie', 'fr-CA')],
      { gender: 'feminine', language: 'fr-FR' },
    )
    expect(resolved.voice?.name).toBe('Amelie')
  })

  it('falls back to the best voice of the language when the gender is not declared', () => {
    const resolved = resolveCompanionVoice(
      [deviceVoice('Camille', 'fr-FR')],
      { gender: 'masculine', language: 'fr-FR' },
    )
    expect(resolved.voice?.name).toBe('Camille')
    expect(resolved.genderMatched).toBe(false)
  })

  it('returns no voice when the device has none for the requested language', () => {
    const resolved = resolveCompanionVoice([deviceVoice('Alex', 'en-US')], {
      gender: 'feminine',
      language: 'fr-FR',
    })
    expect(resolved.voice).toBeNull()
    expect(resolved.genderMatched).toBe(false)
  })

  it('prefers an enhanced voice of the right gender over a plain one', () => {
    const resolved = resolveCompanionVoice(
      [
        deviceVoice('Amelie', 'fr-FR'),
        deviceVoice('Amelie Natural', 'fr-FR'),
        deviceVoice('Thomas', 'fr-FR'),
      ],
      { gender: 'feminine', language: 'fr-FR' },
    )
    expect(resolved.voice?.name).toBe('Amelie Natural')
  })

  it('prefers a voice tagged exactly for the locale', () => {
    const resolved = resolveCompanionVoice(
      [
        deviceVoice('Amelie', 'fr-CA'),
        deviceVoice('Amelie', 'fr-FR'),
      ],
      { gender: 'feminine', language: 'fr-FR' },
    )
    expect(resolved.voice?.lang).toBe('fr-FR')
  })
})

describe('hasVoiceForLanguage', () => {
  it('reports whether any device voice speaks the language', () => {
    expect(hasVoiceForLanguage(VOICES, 'fr-FR')).toBe(true)
    expect(hasVoiceForLanguage(VOICES, 'en-US')).toBe(true)
    expect(hasVoiceForLanguage([deviceVoice('Alex', 'en-US')], 'fr-FR')).toBe(false)
  })
})

describe('normalizeCompanionVoicePreference', () => {
  it('keeps a valid stored preference', () => {
    expect(
      normalizeCompanionVoicePreference({
        gender: 'masculine',
        language: 'en-US',
        rate: 1.25,
      }),
    ).toEqual<CompanionVoicePreference>({
      gender: 'masculine',
      language: 'en-US',
      rate: 1.25,
    })
  })

  it('accepts an integer rate and a stringified rate from JSON', () => {
    expect(
      normalizeCompanionVoicePreference({ gender: 'feminine', language: 'fr-FR', rate: 1 }),
    ).toEqual(DEFAULT_COMPANION_VOICE)
    expect(
      normalizeCompanionVoicePreference({ gender: 'feminine', language: 'fr-FR', rate: '1.5' })
        .rate,
    ).toBe(1.5)
  })

  it('falls back to safe defaults for unknown values', () => {
    expect(
      normalizeCompanionVoicePreference({
        gender: 'robot',
        language: 'xx-XX',
        rate: 1.1,
      }),
    ).toEqual(DEFAULT_COMPANION_VOICE)
    expect(normalizeCompanionVoicePreference(null)).toEqual(DEFAULT_COMPANION_VOICE)
  })
})

describe('preview helpers', () => {
  it('previews the selected language, not the answer language', () => {
    expect(previewText('fr-FR')).toContain('compagnon de souvenirs')
    expect(previewText('en-US')).toContain('memory companion')
  })

  it('formats the reading speed the French way', () => {
    expect(voiceRateLabel(0.75)).toBe('0,75×')
    expect(voiceRateLabel(1)).toBe('1×')
    expect(voiceRateLabel(1.25)).toBe('1,25×')
    expect(voiceRateLabel(1.5)).toBe('1,5×')
  })
})
