import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioEntryCard } from './AudioEntryCard'
import { cancelSpeech, getSpeechState } from '../../../utils/speech'
import { clearAnnouncement } from '../../../utils/announcements'
import { type SpeechStub, installSpeech } from '../../../test/fakeSpeech'
import type { AudioEntryPatch } from '../services/audio'
import type { AudioEntry } from '../types/audio'

type OnUpdate = (id: number, patch: AudioEntryPatch) => Promise<boolean>

function makeEntry(overrides: Partial<AudioEntry> = {}): AudioEntry {
  return {
    id: 7,
    file: '/media/audio/1/memo.wav',
    duration_seconds: 12,
    transcript: 'I bought bread this morning.',
    language_code: 'en',
    language_name: 'English',
    sentiment: 'neutral',
    sentiment_score: 0.9,
    summary: 'A grocery run.',
    status: 'succeeded',
    error: null,
    created_at: '2026-10-20T09:00:00Z',
    updated_at: '2026-10-20T09:00:30Z',
    ...overrides,
  }
}

function renderCard(entry: AudioEntry, onUpdate: OnUpdate = vi.fn(async () => true)) {
  render(
    <AudioEntryCard entry={entry} onDelete={vi.fn()} onUpdate={onUpdate} />,
  )
  return vi.mocked(onUpdate)
}

describe('AudioEntryCard editing', () => {
  it('saves the corrected transcript and summary', async () => {
    const entry = makeEntry()
    const onUpdate = renderCard(entry)

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))

    fireEvent.change(screen.getByLabelText('Edit transcript'), {
      target: { value: 'I bought brown bread this morning.' },
    })
    fireEvent.change(screen.getByLabelText('Edit summary'), {
      target: { value: 'A grocery run, corrected.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save your corrections' }))

    await vi.waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(7, {
        transcript: 'I bought brown bread this morning.',
        summary: 'A grocery run, corrected.',
      }),
    )
    await vi.waitFor(() => expect(screen.queryByLabelText('Edit transcript')).toBeNull())
  })

  it('keeps the draft on screen when the API rejects the save', async () => {
    const entry = makeEntry()
    renderCard(entry, vi.fn(async () => false))

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))
    fireEvent.change(screen.getByLabelText('Edit transcript'), {
      target: { value: 'still editable' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save your corrections' }))

    expect((await screen.findByLabelText('Edit transcript') as HTMLTextAreaElement).value).toBe(
      'still editable',
    )
  })

  it('offers no editor while the AI is still running', () => {
    renderCard(makeEntry({ status: 'processing', transcript: null, summary: null }))

    expect(screen.queryByRole('button', { name: /edit the transcript/i })).toBeNull()
    expect(screen.queryByLabelText('Choose a new recording for this memo')).toBeNull()
  })

  it('sends a new recording for a fresh analysis', async () => {
    const entry = makeEntry()
    const onUpdate = renderCard(entry)

    const file = new File(['RIFF0000WAVEfmt '], 'prise_2.wav', { type: 'audio/wav' })
    fireEvent.change(screen.getByLabelText('Choose a new recording for this memo'), {
      target: { files: [file] },
    })

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(onUpdate.mock.calls[0][0]).toBe(7)
    expect(onUpdate.mock.calls[0][1]).toEqual({ file })
  })

  it('lets a failed memo be written by hand', async () => {
    const entry = makeEntry({
      status: 'failed',
      transcript: null,
      summary: null,
      error: 'Groq is unavailable.',
    })
    const onUpdate = renderCard(entry)

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))
    fireEvent.change(screen.getByLabelText('Edit transcript'), {
      target: { value: 'Typed from the recording myself.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save your corrections' }))

    await vi.waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(7, {
        transcript: 'Typed from the recording myself.',
        summary: '',
      }),
    )
  })

  it('reflects the journal action on its button', () => {
    const entry = makeEntry()
    const onUpdate = vi.fn(async () => true)

    const first = render(
      <AudioEntryCard
        entry={entry}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        onUseTranscript={vi.fn()}
        journalAction="saving"
      />,
    )
    expect(screen.getByText('Adding to journal…')).toBeTruthy()
    expect((screen.getByText('Adding to journal…').closest('button') as HTMLButtonElement).disabled).toBe(true)
    first.unmount()

    render(
      <AudioEntryCard
        entry={entry}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        onUseTranscript={vi.fn()}
        journalAction="saved"
      />,
    )
    expect(screen.getByRole('button', { name: 'Open this memo in the journal' })).toBeTruthy()
  })

  it('opens the microphone recorder from inside edit mode', () => {
    renderCard(makeEntry())

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))
    expect(screen.queryByRole('button', { name: /start recording/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /re-record this memo with the microphone/i }))
    expect(screen.getByText(/replaces the transcript, the language/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /start recording/i })).toBeTruthy()
  })

  it('cancelling discards the draft', () => {
    renderCard(makeEntry())

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))
    fireEvent.change(screen.getByLabelText('Edit transcript'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Edit transcript')).toBeNull()
    expect(screen.getByText('I bought bread this morning.')).toBeTruthy()
  })
})

describe('AudioEntryCard read-aloud', () => {
  let stub: SpeechStub

  beforeEach(() => {
    cancelSpeech()
    clearAnnouncement()
    stub = installSpeech({
      voices: [
        { lang: 'fr-FR', name: 'Amelie' },
        { lang: 'en-US', name: 'Alex' },
      ],
    })
  })

  afterEach(() => {
    cancelSpeech()
    clearAnnouncement()
    stub.restore()
  })

  it('offers one button per text of the memo', () => {
    renderCard(makeEntry())

    expect(screen.getByRole('button', { name: /read the transcript of the memo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /read the summary of the memo/i })).toBeTruthy()
  })

  it('speaks the summary in the language the AI detected', () => {
    renderCard(makeEntry({ language_code: 'fr', transcript: "J'ai achete du pain." }))

    fireEvent.click(screen.getByRole('button', { name: /read the summary of the memo/i }))

    expect(stub.utterances).toHaveLength(1)
    expect(stub.utterances[0].text).toBe('A grocery run.')
    expect(stub.utterances[0].voice?.name).toBe('Amelie')
    expect(getSpeechState()).toMatchObject({ status: 'playing', key: '7:summary' })
  })

  it('leaves the original recording exactly where it was', () => {
    renderCard(makeEntry())
    const player = document.querySelector('audio')
    expect(player?.getAttribute('src')).toBe('/media/audio/1/memo.wav')

    fireEvent.click(screen.getByRole('button', { name: /read the transcript of the memo/i }))

    expect(document.querySelector('audio')).toBe(player)
    expect(player?.getAttribute('src')).toBe('/media/audio/1/memo.wav')
    expect(screen.getByText('I bought bread this morning.')).toBeTruthy()
  })

  it('stops when the memo is edited again: no reading over a draft', () => {
    renderCard(makeEntry())
    fireEvent.click(screen.getByRole('button', { name: /read the transcript of the memo/i }))
    expect(screen.getByRole('status').textContent).toContain('Reading the transcript')

    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))

    expect(getSpeechState().status).toBe('idle')
    expect(screen.queryByRole('button', { name: /read the/i })).toBeNull()
  })

  it('keeps replacing, editing and deleting a memo beside the new controls', () => {
    renderCard(makeEntry())

    expect(screen.getByRole('button', { name: /delete voice memo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /replace audio/i })).toBeTruthy()
    expect(screen.getByLabelText('Choose a new recording for this memo')).toBeTruthy()

    // Editing still works exactly as before: the read-aloud block changes nothing.
    fireEvent.click(screen.getByRole('button', { name: /edit the transcript/i }))
    fireEvent.change(screen.getByLabelText('Edit transcript'), { target: { value: 'corrige' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('I bought bread this morning.')).toBeTruthy()
  })
})
