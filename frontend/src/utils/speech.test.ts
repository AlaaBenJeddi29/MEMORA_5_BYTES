import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  UNSUPPORTED_MESSAGE,
  cancelSpeech,
  getSpeechState,
  isSpeechSupported,
  pauseSpeech,
  pickVoice,
  resumeSpeech,
  speak,
  splitIntoChunks,
  stopSpeech,
} from './speech'
import { clearAnnouncement, getLatestAnnouncement } from './announcements'
import { type SpeechStub, installNoSpeech, installSpeech } from '../test/fakeSpeech'

const FR_VOICES = [{ lang: 'fr-FR', name: 'Amelie' }, { lang: 'en-US', name: 'Alex' }]

let stub: SpeechStub

beforeEach(() => {
  cancelSpeech()
  clearAnnouncement()
  stub = installSpeech({ voices: FR_VOICES })
})

afterEach(() => {
  cancelSpeech()
  clearAnnouncement()
  stub.restore()
})

describe('splitIntoChunks', () => {
  it('keeps a short text as a single utterance', () => {
    expect(splitIntoChunks('Jai acheter du pain. Il etait bon.')).toHaveLength(1)
  })

  it('splits a long text on sentence boundaries, never mid-word', () => {
    const text = 'Premiere phrase. '.repeat(20) + 'Derniere phrase.'
    const chunks = splitIntoChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      // Chrome stops an utterance around 15 s, so each one stays short.
      expect(chunk.length).toBeLessThanOrEqual(180)
      expect(chunk.trim().length).toBeGreaterThan(0)
    }
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.trim())
  })

  it('hard-splits a single sentence with no punctuation', () => {
    const chunks = splitIntoChunks('mot '.repeat(100))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(180)
    }
  })
})

describe('pickVoice', () => {
  it('prefers the exact tag, then any voice of the same language', () => {
    expect(pickVoice('fr-FR')?.name).toBe('Amelie')
    expect(pickVoice('fr')?.name).toBe('Amelie')
    expect(pickVoice('EN')?.name).toBe('Alex')
  })

  it('returns null when no voice can speak the language, so the tag is used as a fallback', () => {
    expect(pickVoice('xx')).toBeNull()
    expect(pickVoice(null)).toBeNull()
  })
})

describe('speak', () => {
  it('reads the transcript through the engine and reports the playing state', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Jai acheter du pain.', lang: 'fr' })

    expect(stub.utterances).toHaveLength(1)
    expect(stub.utterances[0].text).toBe('Jai acheter du pain.')
    expect(getSpeechState()).toMatchObject({ status: 'playing', key: '7:transcript', error: null })
    expect(getLatestAnnouncement()?.text).toContain('Reading the transcript')
  })

  it('hands the French voice to the utterance when the AI detected French', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour', lang: 'fr' })
    expect(stub.utterances[0].voice?.name).toBe('Amelie')
    expect(stub.utterances[0].lang).toBe('fr-FR')

    speak({ key: '8:transcript', field: 'transcript', text: 'Bonjour', lang: 'xx' })
    expect(stub.utterances[1].voice).toBeNull()
    expect(stub.utterances[1].lang).toBe('xx')
  })

  it('speaks the summary too, and says so in the announcement', () => {
    speak({ key: '7:summary', field: 'summary', text: 'Une course au marche.', lang: 'fr' })
    expect(getSpeechState().key).toBe('7:summary')
    expect(getLatestAnnouncement()?.text).toContain('summary')
  })

  it('stops the first reading when another text starts: never two voices at once', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Le premier texte.', lang: 'fr' })
    const cancelAfterFirst = stub.calls.cancel()

    speak({ key: '8:summary', field: 'summary', text: 'Le second texte.', lang: 'fr' })

    expect(stub.calls.cancel()).toBeGreaterThan(cancelAfterFirst)
    expect(getSpeechState().key).toBe('8:summary')
    // The old chunks can no longer flip the state back: they are stale.
    stub.finishOne(0)
    expect(getSpeechState().key).toBe('8:summary')
    expect(getSpeechState().status).toBe('playing')
  })

  it('returns to idle only after the last chunk of a long text', () => {
    speak({
      key: '7:transcript',
      field: 'transcript',
      text: `${'Une phrase assez longue a lire. '.repeat(10)}Fin.`,
      lang: 'fr',
    })
    expect(stub.utterances.length).toBeGreaterThan(1)

    for (let index = 0; index < stub.utterances.length - 1; index += 1) {
      stub.finishOne(index)
      expect(getSpeechState().status).toBe('playing')
    }
    stub.finishOne(stub.utterances.length - 1)
    expect(getSpeechState()).toMatchObject({ status: 'idle', key: null })
    expect(getLatestAnnouncement()?.text).toBe('End of the transcript')
  })

  it('refuses an empty text instead of pretending to read it', () => {
    speak({ key: '7:transcript', field: 'transcript', text: '   ', lang: 'fr' })

    expect(stub.utterances).toHaveLength(0)
    expect(getSpeechState()).toMatchObject({
      status: 'idle',
      key: null,
      errorKey: '7:transcript',
    })
    expect(getSpeechState().error).toBe('This transcript is still empty, so there is nothing to read.')
  })

  it('reports an unsupported browser explicitly, with no fake success', () => {
    stub.restore()
    installNoSpeech()

    expect(isSpeechSupported()).toBe(false)
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour', lang: 'fr' })

    expect(getSpeechState()).toMatchObject({
      status: 'idle',
      error: UNSUPPORTED_MESSAGE,
      errorKey: '7:transcript',
    })
    expect(getLatestAnnouncement()?.text).toBe(UNSUPPORTED_MESSAGE)
  })

  it('translates an engine error into a message the user can act on', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour', lang: 'fr' })
    stub.failOne(0, 'not-allowed')

    expect(getSpeechState()).toMatchObject({ status: 'idle', errorKey: '7:transcript' })
    expect(getSpeechState().error).toBe(
      'The browser blocked the reading. Interact with the page and try again.',
    )
  })

  it('stays silent about the cancel that our own stop() or next speak() caused', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour', lang: 'fr' })
    stub.failOne(0, 'canceled')
    expect(getSpeechState().status).toBe('playing')
    expect(getSpeechState().error).toBeNull()
  })

  it('uses the device voice, language tag, and speed chosen by the caller', () => {
    const englishVoice = { lang: 'en-US', name: 'Alex' } as SpeechSynthesisVoice

    speak({
      key: 'companion:answer',
      field: 'assistant',
      text: 'A calm reflection about your week.',
      voiceLang: 'fr-FR',
      voice: englishVoice,
      rate: 1.25,
    })

    expect(stub.utterances[0].voice).toBe(englishVoice)
    expect(stub.utterances[0].lang).toBe('en-US')
    expect(stub.utterances[0].rate).toBe(1.25)
    expect(getLatestAnnouncement()?.text).toContain('assistant answer')
  })

  it('lets the chosen BCP 47 tag override the detected language code', () => {
    speak({
      key: 'companion:answer',
      field: 'assistant',
      text: 'Bonjour.',
      lang: 'fr',
      voiceLang: 'en-US',
    })

    expect(stub.utterances[0].voice?.name).toBe('Alex')
    expect(stub.utterances[0].lang).toBe('en-US')
  })

  it('clamps a speed outside the engine range', () => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour.', lang: 'fr', rate: 5 })
    expect(stub.utterances[0].rate).toBe(2)

    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour.', lang: 'fr', rate: 0.1 })
    expect(stub.utterances[1].rate).toBe(0.5)
  })
})

describe('pause, resume and stop', () => {
  beforeEach(() => {
    speak({ key: '7:transcript', field: 'transcript', text: 'Bonjour', lang: 'fr' })
  })

  it('pauses the reading and keeps the same text selected', () => {
    pauseSpeech()
    expect(stub.calls.pause()).toBe(1)
    expect(getSpeechState()).toMatchObject({ status: 'paused', key: '7:transcript' })
    expect(getLatestAnnouncement()?.text).toBe('Reading paused')
  })

  it('resumes from the pause', () => {
    pauseSpeech()
    resumeSpeech()
    expect(stub.calls.resume()).toBe(1)
    expect(getSpeechState()).toMatchObject({ status: 'playing', key: '7:transcript' })
    expect(getLatestAnnouncement()?.text).toBe('Reading resumed')
  })

  it('does nothing when the engine is asked to pause or resume while idle', () => {
    stopSpeech()
    const pauseCount = stub.calls.pause()
    const resumeCount = stub.calls.resume()

    pauseSpeech()
    resumeSpeech()

    expect(stub.calls.pause()).toBe(pauseCount)
    expect(stub.calls.resume()).toBe(resumeCount)
    expect(getSpeechState()).toMatchObject({ status: 'idle', key: null })
  })

  it('stops the reading, cancels the engine and clears the state', () => {
    stopSpeech()
    expect(stub.calls.cancel()).toBeGreaterThan(0)
    expect(getSpeechState()).toMatchObject({ status: 'idle', key: null, error: null })
    expect(getLatestAnnouncement()?.text).toBe('Reading stopped')

    // The chunks already in the queue cannot restart anything.
    stub.finishAll()
    expect(getSpeechState().status).toBe('idle')
  })

  it('leaves the error of a previous attempt behind once a new one starts', () => {
    stopSpeech()
    speak({ key: '8:summary', field: 'summary', text: '', lang: 'fr' })
    expect(getSpeechState().error).toContain('empty')

    speak({ key: '8:summary', field: 'summary', text: 'Reprise', lang: 'fr' })
    expect(getSpeechState()).toMatchObject({ status: 'playing', error: null, errorKey: null })
  })
})
