import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import type { AudioEntry } from '../types/audio'
import { useTranscriptJournal } from './useTranscriptJournal'

const JOURNAL_BASE = '/api/journal/entries/'

function makeEntry(overrides: Partial<AudioEntry> = {}): AudioEntry {
  return {
    id: 7,
    file: 'http://127.0.0.1:8000/media/audio/1/memo.wav',
    duration_seconds: 12,
    transcript: '  j’ai acheté du pain  ',
    language_code: 'fr',
    language_name: 'French',
    sentiment: 'positive',
    sentiment_score: 0.9,
    summary: 'Un achat de pain.',
    status: 'succeeded',
    error: null,
    created_at: '2026-10-25T09:00:00Z',
    updated_at: '2026-10-25T09:00:30Z',
    ...overrides,
  }
}

function journalPage(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results }
}

interface StubOptions {
  existing?: Record<string, unknown>[]
  /** Response for POST /api/journal/entries/. */
  create?: { status: number; body: unknown }
  onPost?: (body: Record<string, string>) => void
  gate?: Promise<void>
}

function stubJournalFetch({ existing = [], create, onPost, gate }: StubOptions = {}) {
  const fetchMock = vi.fn(async (url: unknown, options: { method?: string; body?: unknown } = {}) => {
    const href = String(url)
    const method = String(options.method ?? 'GET').toUpperCase()

    if (href.includes('/api/accounts/csrf/')) {
      return jsonResponse({ detail: 'CSRF cookie set.' })
    }
    if (href.includes('search/')) {
      return jsonResponse(journalPage(existing))
    }
    if (href.endsWith(JOURNAL_BASE) && method === 'POST') {
      if (gate) await gate
      const body = JSON.parse(options.body as string)
      onPost?.(body)
      if (create) return jsonResponse(create.body, create.status)
      return jsonResponse({ id: 42, user: 1, photos: [], created_at: '2026-10-25T10:00:00Z', ...body }, 201)
    }
    return jsonResponse({ detail: 'Not found.' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderJournalHook() {
  return renderHook(() => useTranscriptJournal(), {
    wrapper: ({ children }) => (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {children}
      </MemoryRouter>
    ),
  })
}

function postedBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([, options]) => String(options?.method ?? '').toUpperCase() === 'POST')
    .map(([, options]) => JSON.parse(options.body as string))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTranscriptJournal', () => {
  it('creates the journal entry through the journal API', async () => {
    const fetchMock = stubJournalFetch()
    const { result } = renderJournalHook()

    const saved = await act(async () => result.current.save(makeEntry()))

    expect(saved).not.toBeNull()
    expect(saved?.created).toBe(true)
    expect(postedBodies(fetchMock)).toEqual([
      {
        title: 'Voice memo #7',
        text: 'j’ai acheté du pain',
        audio_file: 'http://127.0.0.1:8000/media/audio/1/memo.wav',
        summary_text: 'Un achat de pain.',
        sentiment: 'positive',
      },
    ])
    expect(result.current.message).toEqual({
      variant: 'success',
      text: 'Saved in your journal as "Voice memo #7".',
    })
    expect(result.current.actionFor(7)).toBe('saved')
  })

  it('re-uses the entry that is already in the journal instead of duplicating it', async () => {
    const fetchMock = stubJournalFetch({
      existing: [{ id: 9, title: 'Voice memo #7', text: 'j’ai acheté du pain' }],
    })
    const { result } = renderJournalHook()

    const saved = await act(async () => result.current.save(makeEntry()))

    expect(saved).toEqual({
      entry: expect.objectContaining({ id: 9 }),
      created: false,
    })
    expect(postedBodies(fetchMock)).toHaveLength(0)
    expect(result.current.message?.text).toBe('"Voice memo #7" is already in your journal.')
  })

  it('does not save a memo whose transcript is still missing', async () => {
    const fetchMock = stubJournalFetch()
    const { result } = renderJournalHook()

    const saved = await act(async () => result.current.save(makeEntry({ transcript: '   ' })))

    expect(saved).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.message?.variant).toBe('error')
    expect(result.current.message?.text).toMatch(/no transcript yet/i)
  })

  it('reports the error the API answered', async () => {
    stubJournalFetch({ create: { status: 400, body: { text: ['This field may not be blank.'] } } })
    const { result } = renderJournalHook()

    const saved = await act(async () => result.current.save(makeEntry()))

    expect(saved).toBeNull()
    await waitFor(() =>
      expect(result.current.message).toEqual({
        variant: 'error',
        text: 'Text: This field may not be blank.',
      }),
    )
    expect(result.current.actionFor(7)).toBe('idle')
  })

  it('ignores a second click while the first save is in flight', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchMock = stubJournalFetch({ gate })
    const { result } = renderJournalHook()

    let first: unknown
    let second: unknown
    act(() => {
      first = result.current.save(makeEntry())
      second = result.current.save(makeEntry())
    })

    await act(async () => {
      release()
      await Promise.all([first, second])
    })

    expect(postedBodies(fetchMock)).toHaveLength(1)
  })

  it('opens the journal instead of saving again once it is stored', async () => {
    const fetchMock = stubJournalFetch()
    const { result } = renderJournalHook()

    await act(async () => result.current.save(makeEntry()))
    fetchMock.mockClear()
    await act(async () => result.current.saveOrOpen(makeEntry()))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
