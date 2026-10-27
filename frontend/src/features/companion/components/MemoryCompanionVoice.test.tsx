import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import { type SpeechStub, installNoSpeech, installSpeech } from '../../../test/fakeSpeech'
import type { CompanionAnswer, CompanionVoicePreference } from '../../../types/companion'
import { getSpeechState } from '../../../utils/speech'
import { MemoryCompanion } from './MemoryCompanion'

const PATTERNS_PATH = '/api/summaries/patterns/'
const COMPANION_PATH = '/api/summaries/companion/'
const VOICE_PATH = '/api/summaries/companion-voice-preferences/'

const ANSWER: CompanionAnswer = {
  answer:
    'Your summaries mention a family dinner by the river. One possible reading is that the evening felt grounding.',
  reflection_questions: [],
  insufficient_information: false,
  sources: [],
}

const DEFAULT_PREFERENCE: CompanionVoicePreference = {
  gender: 'feminine',
  language: 'fr-FR',
  rate: 1,
}

let stub: SpeechStub

function installFetch(preference: CompanionVoicePreference = DEFAULT_PREFERENCE) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(PATTERNS_PATH)) {
      return jsonResponse({
        has_data: false,
        total_summaries: 0,
        period: null,
        themes: [],
        moods: [],
        months: [],
        method: 'Stored fields only.',
        limitations: 'No summaries are stored yet.',
      })
    }
    if (url.endsWith(VOICE_PATH)) {
      if (method === 'PUT') {
        return jsonResponse(JSON.parse(String(init?.body)))
      }
      return jsonResponse(preference)
    }
    if (url.endsWith(COMPANION_PATH)) {
      return jsonResponse(ANSWER)
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function saveCalls(fetchMock: ReturnType<typeof installFetch>) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ url: String(input), init: init ?? {} }))
    .filter(
      (call) =>
        call.url.endsWith(VOICE_PATH) &&
        (call.init.method ?? 'GET').toUpperCase() === 'PUT',
    )
}

function renderCompanion() {
  return render(
    <MemoryRouter initialEntries={['/app/companion']}>
      <MemoryCompanion />
    </MemoryRouter>,
  )
}

async function askQuestion(question: string) {
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: question },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ask the companion' }))
  await screen.findByText(ANSWER.answer)
}

function lastUtterance() {
  return stub.utterances[stub.utterances.length - 1]
}

function listenStatus(): string {
  return document.querySelector('.companion-listen__status')?.textContent ?? ''
}

beforeEach(() => {
  document.cookie = 'csrftoken=test-token'
  stub = installSpeech({
    voices: [
      { lang: 'fr-FR', name: 'Amelie' },
      { lang: 'fr-FR', name: 'Thomas' },
      { lang: 'en-US', name: 'Alex' },
      { lang: 'en-US', name: 'Jenny' },
    ],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  stub.restore()
})

describe('companion voice settings', () => {
  it('shows the stored default, names the device voice, and previews the feminine voice', async () => {
    installFetch()
    renderCompanion()

    expect(
      await screen.findByText('Voix actuelle : Amelie (français, féminine).'),
    ).toBeTruthy()
    expect((screen.getByLabelText('Voix féminine') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Langue de la voix') as HTMLSelectElement).value).toBe(
      'fr-FR',
    )
    expect((screen.getByLabelText('Vitesse de lecture') as HTMLSelectElement).value).toBe('1')

    fireEvent.click(
      screen.getByRole('button', { name: 'Écouter un aperçu de la voix féminine' }),
    )

    const utterance = lastUtterance()
    expect(utterance?.voice?.name).toBe('Amelie')
    expect(utterance?.lang).toBe('fr-FR')
    expect(utterance?.rate).toBe(1)
    expect(utterance?.text).toContain('compagnon de souvenirs')
  })

  it('previews the masculine voice and stops the preview on a second click', async () => {
    installFetch()
    renderCompanion()
    await screen.findByText(/Voix actuelle : Amelie/)

    fireEvent.click(
      screen.getByRole('button', { name: 'Écouter un aperçu de la voix masculine' }),
    )

    expect(lastUtterance()?.voice?.name).toBe('Thomas')

    const cancelsBefore = stub.calls.cancel()
    fireEvent.click(
      screen.getByRole('button', { name: 'Arrêter un aperçu de la voix masculine' }),
    )

    expect(stub.calls.cancel()).toBeGreaterThan(cancelsBefore)
    expect(getSpeechState().status).toBe('idle')
  })

  it('restores a saved preference and speaks the preview in the chosen language and speed', async () => {
    installFetch({ gender: 'masculine', language: 'en-US', rate: 1.25 })
    renderCompanion()

    expect(await screen.findByText('Voix actuelle : Alex (English, masculine).')).toBeTruthy()
    expect((screen.getByLabelText('Voix masculine') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Langue de la voix') as HTMLSelectElement).value).toBe(
      'en-US',
    )
    expect((screen.getByLabelText('Vitesse de lecture') as HTMLSelectElement).value).toBe(
      '1.25',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Écouter un aperçu de la voix masculine' }),
    )

    const utterance = lastUtterance()
    expect(utterance?.voice?.name).toBe('Alex')
    expect(utterance?.lang).toBe('en-US')
    expect(utterance?.rate).toBe(1.25)
    expect(utterance?.text).toContain('memory companion')
  })

  it('switches to an English voice when the language changes', async () => {
    installFetch()
    renderCompanion()
    await screen.findByText(/Voix actuelle : Amelie/)

    fireEvent.change(screen.getByLabelText('Langue de la voix'), {
      target: { value: 'en-US' },
    })

    expect(
      await screen.findByText('Voix actuelle : Jenny (English, féminine).'),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Écouter un aperçu de la voix féminine' }),
    )

    expect(lastUtterance()?.voice?.name).toBe('Jenny')
    expect(lastUtterance()?.text).toContain('Hello. I am your memory companion.')
  })

  it('never claims a gender for a voice whose genre is not declared', async () => {
    stub.restore()
    stub = installSpeech({ voices: [{ lang: 'fr-FR', name: 'Camille' }] })
    installFetch()
    renderCompanion()

    expect(
      await screen.findByText(
        'Aucune voix féminine identifiée sur cet appareil. Lecture avec Camille, dont le genre n’est pas déclaré.',
      ),
    ).toBeTruthy()

    await askQuestion('When did I feel proud?')
    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))

    expect(lastUtterance()?.voice?.name).toBe('Camille')
    expect(listenStatus()).toContain('Camille (genre non déclaré)')
    expect(listenStatus()).not.toContain('féminine')
  })

  it('says honestly when no voice exists for the language and lets the browser choose', async () => {
    stub.restore()
    stub = installSpeech({ voices: [{ lang: 'en-US', name: 'Alex' }] })
    installFetch()
    renderCompanion()

    expect(
      await screen.findByText(
        'Aucune voix française n’est installée. Le navigateur utilisera sa voix par défaut.',
      ),
    ).toBeTruthy()

    await askQuestion('When did I feel proud?')
    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))

    expect(lastUtterance()?.voice).toBeNull()
    expect(lastUtterance()?.lang).toBe('fr-FR')
    expect(listenStatus()).toContain('voix par défaut du navigateur')
  })

  it('persists gender, language, and speed for the signed-in user', async () => {
    const fetchMock = installFetch()
    renderCompanion()
    await screen.findByText(/Voix actuelle : Amelie/)

    fireEvent.change(screen.getByLabelText('Langue de la voix'), {
      target: { value: 'en-US' },
    })
    fireEvent.change(screen.getByLabelText('Vitesse de lecture'), {
      target: { value: '0.75' },
    })
    fireEvent.click(screen.getByLabelText('Voix masculine'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes préférences' }))

    expect(await screen.findByText('Préférences enregistrées.')).toBeTruthy()

    const calls = saveCalls(fetchMock)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      gender: 'masculine',
      language: 'en-US',
      rate: 0.75,
    })
  })
})

describe('companion answer playback', () => {
  it('plays, pauses, resumes, and stops the answer with the selected voice', async () => {
    installFetch()
    renderCompanion()
    await askQuestion('When did I feel proud?')

    expect(screen.getByText(/Voix utilisée : voix féminine \(Amelie\)/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))

    expect(lastUtterance()?.text).toBe(ANSWER.answer)
    expect(lastUtterance()?.voice?.name).toBe('Amelie')
    expect(listenStatus()).toContain('Lecture en cours')

    fireEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(stub.calls.pause()).toBe(1)
    expect(listenStatus()).toContain('Lecture en pause')

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’écoute' }))
    expect(stub.calls.resume()).toBe(1)
    expect(listenStatus()).toContain('Lecture en cours')

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }))
    expect(getSpeechState().status).toBe('idle')
    expect(screen.getByRole('button', { name: 'Écouter' })).toBeTruthy()
  })

  it('stops an ongoing reading as soon as a setting changes, then uses the new speed', async () => {
    installFetch()
    renderCompanion()
    await askQuestion('When did I feel proud?')

    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))
    expect(getSpeechState().status).toBe('playing')

    fireEvent.change(screen.getByLabelText('Vitesse de lecture'), {
      target: { value: '1.5' },
    })

    expect(getSpeechState().status).toBe('idle')
    expect(screen.getByRole('button', { name: 'Écouter' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))
    expect(lastUtterance()?.rate).toBe(1.5)
  })

  it('stops the previous reading when a new answer replaces it', async () => {
    installFetch()
    renderCompanion()
    await askQuestion('When did I feel proud?')

    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))
    const cancelsBefore = stub.calls.cancel()

    await askQuestion('Which memories brought me joy?')

    expect(stub.calls.cancel()).toBeGreaterThan(cancelsBefore)
    expect(getSpeechState().status).toBe('idle')
    expect(screen.getByRole('button', { name: 'Écouter' })).toBeTruthy()
  })

  it('silences the reading when the companion is unmounted', async () => {
    installFetch()
    const view = renderCompanion()
    await askQuestion('When did I feel proud?')

    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }))
    expect(getSpeechState().status).toBe('playing')

    view.unmount()

    expect(getSpeechState().status).toBe('idle')
  })

  it('disables listening and explains why when the browser has no speech synthesis', async () => {
    installNoSpeech()
    installFetch()
    renderCompanion()

    expect(
      screen.getAllByText('La lecture vocale n’est pas disponible dans ce navigateur.').length,
    ).toBeGreaterThan(0)

    await askQuestion('When did I feel proud?')

    const listen = screen.getByRole('button', { name: 'Écouter' }) as HTMLButtonElement
    expect(listen.disabled).toBe(true)
    expect(
      (screen.getByLabelText('Voix féminine') as HTMLInputElement).disabled,
    ).toBe(true)
    expect(stub.utterances).toHaveLength(0)
  })
})
