import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installSpeechMock, resetUtterances } from '../../../test/speechMock'
import { stopSpeech } from '../speech'
import { SummaryAudioPlayer } from './SummaryAudioPlayer'

const FRENCH_TEXT = 'Un souvenir de fierté après mes études.'
const ENGLISH_TEXT = 'A calm morning walk through the park with the family.'

const FRENCH_VOICE: SpeechSynthesisVoice = {
  default: false,
  lang: 'fr-FR',
  localService: true,
  name: 'Test French',
  voiceURI: 'test-fr',
}

const ENGLISH_VOICE: SpeechSynthesisVoice = {
  default: true,
  lang: 'en-US',
  localService: true,
  name: 'Test English',
  voiceURI: 'test-en',
}

afterEach(() => {
  act(() => {
    stopSpeech()
  })
  resetUtterances()
})

describe('SummaryAudioPlayer', () => {
  it('offers an accessible listen button for non-empty text', () => {
    installSpeechMock()

    render(<SummaryAudioPlayer summaryId={1} text={FRENCH_TEXT} />)

    expect(
      screen.getByRole('button', { name: 'Écouter ce souvenir' }),
    ).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Lecture audio du souvenir' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Vitesse de lecture' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Arrêter' })).toBeNull()
  })

  it('hides the player when the summary text is empty', () => {
    installSpeechMock()

    render(<SummaryAudioPlayer summaryId={1} text="   " />)

    expect(screen.queryByRole('button', { name: /Écouter/ })).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('starts speech synthesis with the displayed text and detected language', () => {
    const speech = installSpeechMock([ENGLISH_VOICE, FRENCH_VOICE])

    render(<SummaryAudioPlayer summaryId={7} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    expect(speech.synth.speak).toHaveBeenCalledTimes(1)
    const utterance = speech.latest()
    expect(utterance?.text).toBe(FRENCH_TEXT)
    expect(utterance?.lang).toBe('fr-FR')
    expect(utterance?.voice).toBe(FRENCH_VOICE)
    expect(utterance?.rate).toBe(1)

    expect(
      screen.getByRole('button', { name: 'Mettre en pause' }),
    ).toBeTruthy()
    expect(screen.getByText('Lecture en cours')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeTruthy()
  })

  it('detects English and falls back to the browser default voice', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={8} text={ENGLISH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    const utterance = speech.latest()
    expect(utterance?.lang).toBe('en-US')
    expect(utterance?.voice).toBeNull()
  })

  it('pauses and resumes the current reading', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={2} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(speech.synth.pause).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Lecture en pause')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Reprendre l’écoute' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’écoute' }))
    expect(speech.synth.resume).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Lecture en cours')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Mettre en pause' }),
    ).toBeTruthy()
  })

  it('stops the reading and returns to the initial control', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={3} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))
    const cancelCalls = speech.synth.cancel.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }))

    expect(speech.synth.cancel.mock.calls.length).toBe(cancelCalls + 1)
    expect(screen.getByRole('button', { name: 'Écouter ce souvenir' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Arrêter' })).toBeNull()
    expect(screen.queryByText('Lecture en cours')).toBeNull()
  })

  it('updates the interface when the reading finishes', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={4} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    act(() => {
      speech.latest()?.onend?.(new Event('end') as SpeechSynthesisEvent)
    })

    expect(
      screen.getByRole('button', { name: 'Réécouter ce souvenir' }),
    ).toBeTruthy()
    expect(screen.getByText('Lecture terminée')).toBeTruthy()
  })

  it('cleans up synthesis when unmounted', () => {
    const speech = installSpeechMock()

    const { unmount } = render(
      <SummaryAudioPlayer summaryId={5} text={FRENCH_TEXT} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))
    const cancelCalls = speech.synth.cancel.mock.calls.length

    unmount()

    expect(speech.synth.cancel.mock.calls.length).toBe(cancelCalls + 1)
  })

  it('reports a synthesis failure without breaking the player', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={6} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    act(() => {
      speech.latest()?.onerror?.({
        error: 'synthesis-failed',
      } as SpeechSynthesisErrorEvent)
    })

    expect(screen.getByRole('alert').textContent).toContain(
      'La lecture audio a échoué',
    )
    expect(screen.getByRole('button', { name: 'Écouter ce souvenir' })).toBeTruthy()
  })

  it('ignores cancellation errors raised while replacing a reading', () => {
    const speech = installSpeechMock()

    render(
      <>
        <SummaryAudioPlayer summaryId={20} text={FRENCH_TEXT} />
        <SummaryAudioPlayer summaryId={21} text={ENGLISH_TEXT} />
      </>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Écouter ce souvenir' })[0])
    const first = speech.latest()

    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))
    act(() => {
      first?.onerror?.({ error: 'canceled' } as SpeechSynthesisErrorEvent)
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Mettre en pause' }),
    ).toBeTruthy()
  })

  it('shows a non-blocking message when speech synthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)

    render(<SummaryAudioPlayer summaryId={10} text={FRENCH_TEXT} />)

    expect(screen.getByRole('note').textContent).toContain(
      'La lecture audio n’est pas disponible dans ce navigateur',
    )
    expect(screen.queryByRole('button', { name: /Écouter/ })).toBeNull()
  })

  it('plays only one summary at a time', () => {
    const speech = installSpeechMock()

    render(
      <>
        <SummaryAudioPlayer summaryId={11} text={FRENCH_TEXT} />
        <SummaryAudioPlayer summaryId={12} text={ENGLISH_TEXT} />
      </>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Écouter ce souvenir' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    expect(speech.synth.speak).toHaveBeenCalledTimes(2)
    expect(speech.count()).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Écouter ce souvenir' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeTruthy()
  })

  it('applies the selected speed to the next reading', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={13} text={FRENCH_TEXT} />)

    const select = screen.getByRole('combobox', { name: 'Vitesse de lecture' })
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(
      ['0,75×', '1×', '1,25×', '1,5×'],
    )

    fireEvent.change(select, { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))

    expect(speech.latest()?.rate).toBe(1.5)
  })

  it('restarts at the new speed when it changes during playback', () => {
    const speech = installSpeechMock()

    render(<SummaryAudioPlayer summaryId={14} text={FRENCH_TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))
    const utteranceCount = speech.count()

    fireEvent.change(screen.getByRole('combobox', { name: 'Vitesse de lecture' }), {
      target: { value: '1.25' },
    })

    expect(speech.count()).toBe(utteranceCount + 1)
    expect(speech.latest()?.rate).toBe(1.25)
    expect(
      screen.getByRole('button', { name: 'Mettre en pause' }),
    ).toBeTruthy()
  })
})
