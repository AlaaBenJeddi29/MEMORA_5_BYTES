import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { ReadAloudControls, SPEECH_UNSUPPORTED_NOTICE_ID } from './ReadAloudControls'
import { cancelSpeech, getSpeechState } from '../utils/speech'
import { clearAnnouncement } from '../utils/announcements'
import { type SpeechStub, installNoSpeech, installSpeech } from '../test/fakeSpeech'

const SUBJECT = 'the transcript of the memo from 20 October'

function renderTranscript(text: string | null = "J'ai achete du pain ce matin.") {
  render(
    <ReadAloudControls
      entryId={7}
      field="transcript"
      text={text}
      lang="fr"
      subject={SUBJECT}
    />,
  )
}

let stub: SpeechStub

beforeEach(() => {
  cancelSpeech()
  clearAnnouncement()
  stub = installSpeech({ voices: [{ lang: 'fr-FR', name: 'Amelie' }] })
})

afterEach(() => {
  cancelSpeech()
  clearAnnouncement()
  stub.restore()
})

function readButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`Read ${SUBJECT} aloud`, 'i') })
}

describe('the read button', () => {
  it('is labelled per text so several memos stay distinguishable', () => {
    renderTranscript()
    expect(readButton().textContent).toContain('Read transcript')
    expect(readButton().getAttribute('aria-describedby')).toBeNull()
  })

  it('starts the reading and swaps itself for the Pause / Stop controls', () => {
    renderTranscript()
    fireEvent.click(readButton())

    expect(stub.utterances).toHaveLength(1)
    expect(stub.utterances[0].voice?.name).toBe('Amelie')
    expect(getSpeechState()).toMatchObject({ status: 'playing', key: '7:transcript' })

    expect(screen.getByRole('button', { name: new RegExp(`Pause reading ${SUBJECT}`, 'i') })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(`Stop reading ${SUBJECT}`, 'i') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(`Read ${SUBJECT} aloud`, 'i') })).toBeNull()
  })

  it('points at the page notice when the browser cannot speak at all', () => {
    stub.restore()
    installNoSpeech()
    renderTranscript()

    const button = screen.getByRole('button', { name: new RegExp(`Read ${SUBJECT} aloud`, 'i') })
    expect(button.getAttribute('aria-describedby')).toBe(SPEECH_UNSUPPORTED_NOTICE_ID)
  })
})

describe('the reading state', () => {
  it('is announced visibly and to assistive technology', () => {
    renderTranscript()
    fireEvent.click(readButton())

    const status = screen.getByRole('status')
    expect(status.textContent).toBe(`Reading ${SUBJECT}…`)
  })

  it('says "Paused" and offers Resume while the engine holds the text', () => {
    renderTranscript()
    fireEvent.click(readButton())
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`Pause reading ${SUBJECT}`, 'i') }),
    )

    expect(stub.calls.pause()).toBe(1)
    expect(screen.getByRole('status').textContent).toBe(`Paused — ${SUBJECT}`)

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`Resume reading ${SUBJECT}`, 'i') }),
    )
    expect(stub.calls.resume()).toBe(1)
    expect(screen.getByRole('status').textContent).toBe(`Reading ${SUBJECT}…`)
  })

  it('goes back to the read button when the text finishes', () => {
    renderTranscript()
    fireEvent.click(readButton())
    act(() => stub.finishAll())

    expect(screen.queryByRole('status')).toBeNull()
    expect(readButton()).toBeTruthy()
  })

  it('goes back to the read button after Stop', () => {
    renderTranscript()
    fireEvent.click(readButton())
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Stop reading ${SUBJECT}`, 'i') }))

    expect(getSpeechState()).toMatchObject({ status: 'idle', key: null })
    expect(readButton()).toBeTruthy()
  })

  it('leaves the other memos untouched: only the playing control changes', () => {
    render(
      <>
        <ReadAloudControls entryId={7} field="transcript" text="Premier memo." lang="fr" subject="memo 7" />
        <ReadAloudControls entryId={8} field="transcript" text="Second memo." lang="fr" subject="memo 8" />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Read memo 7 aloud' }))
    expect(screen.getByRole('status').textContent).toBe('Reading memo 7…')
    expect(screen.getByRole('button', { name: 'Read memo 8 aloud' })).toBeTruthy()

    // The second click replaces the first reading instead of overlapping it.
    fireEvent.click(screen.getByRole('button', { name: 'Read memo 8 aloud' }))
    expect(getSpeechState().key).toBe('8:transcript')
    expect(screen.getByRole('status').textContent).toBe('Reading memo 8…')
    expect(screen.queryByText('Reading memo 7…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Read memo 7 aloud' })).toBeTruthy()
  })
})

describe('when the reading cannot happen', () => {
  it('shows the unsupported-browser message on the control that was clicked', () => {
    stub.restore()
    installNoSpeech()
    renderTranscript()

    fireEvent.click(readButton())

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('does not support speech synthesis')
    expect(getSpeechState().status).toBe('idle')
  })

  it('says so for an empty transcript instead of reading nothing', () => {
    renderTranscript('')
    fireEvent.click(readButton())
    expect(screen.getByRole('alert').textContent).toContain('still empty')
    expect(stub.utterances).toHaveLength(0)
  })

  it('surfaces an engine failure', () => {
    renderTranscript()
    fireEvent.click(readButton())
    act(() => stub.failOne(0, 'synthesis-unavailable'))

    expect(screen.getByRole('alert').textContent).toContain('Speech synthesis is unavailable')
    expect(readButton()).toBeTruthy()
  })

  it('shows the message on the memo that failed, not on the others', () => {
    render(
      <>
        <ReadAloudControls entryId={7} field="transcript" text="" lang="fr" subject="memo 7" />
        <ReadAloudControls entryId={8} field="transcript" text="Second memo." lang="fr" subject="memo 8" />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Read memo 7 aloud' }))
    expect(screen.getByRole('alert').textContent).toContain('is still empty')
    expect(screen.getByRole('button', { name: 'Read memo 8 aloud' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Read memo 8 aloud' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
