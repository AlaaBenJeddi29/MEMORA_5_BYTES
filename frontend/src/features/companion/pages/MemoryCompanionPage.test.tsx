import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import type { CompanionAnswer, EmotionalPatterns } from '../../../types/companion'
import type { Summary } from '../../../types/summaries'
import { MemoryCompanionPage } from './MemoryCompanionPage'

const SUMMARY: Summary = {
  id: 1,
  owner: 1,
  journal_entry_id: 2,
  summary_text: 'A family dinner by the river.',
  mood: 'calm',
  themes: ['family', 'gratitude'],
  illustration_prompt: '',
  created_at: '2026-10-20T07:50:00Z',
  updated_at: '2026-10-20T07:50:00Z',
}

const ANSWER: CompanionAnswer = {
  answer:
    'Your summaries mention a family dinner by the river. One possible reading is that the evening felt grounding.',
  reflection_questions: ['What part of that evening stayed with you?'],
  insufficient_information: false,
  sources: [{ summary: SUMMARY, excerpt: 'A family dinner by the river.' }],
}

const PATTERNS: EmotionalPatterns = {
  has_data: true,
  total_summaries: 2,
  period: { start: '2026-09-10', end: '2026-10-20' },
  themes: [
    { name: 'family', count: 2 },
    { name: 'gratitude', count: 1 },
  ],
  moods: [{ name: 'calm', count: 2 }],
  months: [
    { month: '2026-09', count: 1, themes: ['family'], moods: ['calm'] },
    { month: '2026-10', count: 1, themes: ['gratitude'], moods: ['calm'] },
  ],
  method: 'Computed only from stored dates, moods, and themes.',
  limitations: 'Counts of recorded fields only. Not a diagnosis or prediction.',
}

const EMPTY_PATTERNS: EmotionalPatterns = {
  has_data: false,
  total_summaries: 0,
  period: null,
  themes: [],
  moods: [],
  months: [],
  method: 'Computed only from stored dates, moods, and themes.',
  limitations: 'No summaries are stored yet, so there are no patterns to show.',
}

const COMPANION_PATH = '/api/summaries/companion/'
const PATTERNS_PATH = '/api/summaries/patterns/'

interface FetchCall {
  url: string
  init: RequestInit
}

function installFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
  patterns: EmotionalPatterns = PATTERNS,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    if (call.url.endsWith(PATTERNS_PATH)) {
      return jsonResponse(patterns)
    }
    return handler(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function companionCalls(fetchMock: ReturnType<typeof installFetch>): FetchCall[] {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ url: String(input), init: init ?? {} }))
    .filter((call) => call.url.endsWith(COMPANION_PATH))
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/companion']}>
      <MemoryCompanionPage />
    </MemoryRouter>,
  )
}

async function askQuestion(question: string) {
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: question },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ask the companion' }))
}

beforeEach(() => {
  document.cookie = 'csrftoken=test-token'
  window.history.replaceState(null, '', '/app/companion')
})

describe('MemoryCompanionPage', () => {
  it('renders the title, explanation, examples, and stored patterns', async () => {
    installFetch(() => {
      throw new Error('The companion should not be called on mount')
    })

    renderPage()

    expect(
      screen.getByRole('heading', { name: 'AI Memory Companion' }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Answers use only your summaries/i),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'When have I felt proud of myself?' }),
    ).toBeTruthy()
    expect(await screen.findByText('Frequent themes')).toBeTruthy()
    expect(screen.getByText('Recorded moods')).toBeTruthy()
    expect(screen.getByText('Month by month')).toBeTruthy()
    expect(screen.getByText(/Not a diagnosis/i)).toBeTruthy()
  })

  it('asks the companion and renders the answer, reflection, and sources', async () => {
    const fetchMock = installFetch(() => jsonResponse(ANSWER))

    renderPage()
    await askQuestion('When did I feel proud?')

    expect(await screen.findByText(ANSWER.answer)).toBeTruthy()
    expect(
      screen.getByText('What part of that evening stayed with you?'),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: /Sources from your summaries \(1\)/i }),
    ).toBeTruthy()
    expect(screen.getByText('“A family dinner by the river.”')).toBeTruthy()
    expect(screen.getAllByText('family').length).toBeGreaterThan(0)

    const calls = companionCalls(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      question: 'When did I feel proud?',
    })
  })

  it('submits a clicked example question', async () => {
    const fetchMock = installFetch(() => jsonResponse(ANSWER))

    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'What have I learned from difficult moments?' }),
    )

    expect(await screen.findByText(ANSWER.answer)).toBeTruthy()
    expect(
      (screen.getByLabelText('Your question') as HTMLTextAreaElement).value,
    ).toBe('What have I learned from difficult moments?')
    expect(JSON.parse(String(companionCalls(fetchMock)[0].init.body))).toEqual({
      question: 'What have I learned from difficult moments?',
    })
  })

  it('shows a loading state while the companion answers', async () => {
    let resolveAnswer: ((value: Response) => void) | undefined
    const pending = new Promise<Response>((resolve) => {
      resolveAnswer = resolve
    })
    installFetch(() => pending)

    renderPage()
    await askQuestion('Which memories brought me joy?')

    expect(await screen.findByText('Searching your saved memories…')).toBeTruthy()

    await act(async () => {
      resolveAnswer?.(jsonResponse(ANSWER))
    })

    expect(await screen.findByText(ANSWER.answer)).toBeTruthy()
    expect(screen.queryByText('Searching your saved memories…')).toBeNull()
  })

  it('shows an error and retries the same question', async () => {
    let attempts = 0
    const fetchMock = installFetch(() => {
      attempts += 1
      if (attempts === 1) {
        return jsonResponse(
          { detail: 'The memory companion is temporarily unavailable.' },
          502,
        )
      }
      return jsonResponse(ANSWER)
    })

    renderPage()
    await askQuestion('What mattered most to me recently?')

    expect(
      await screen.findByText('The companion couldn’t answer'),
    ).toBeTruthy()
    expect(
      screen.getByText('The memory companion is temporarily unavailable.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))

    expect(await screen.findByText(ANSWER.answer)).toBeTruthy()
    expect(companionCalls(fetchMock)).toHaveLength(2)
    expect(JSON.parse(String(companionCalls(fetchMock)[1].init.body))).toEqual({
      question: 'What mattered most to me recently?',
    })
  })

  it('states when there is not enough recorded detail and lists no sources', async () => {
    installFetch(() =>
      jsonResponse({
        answer:
          "I couldn't find enough relevant memories in your saved summaries to answer that.",
        reflection_questions: [],
        insufficient_information: true,
        sources: [],
      } satisfies CompanionAnswer),
    )

    renderPage()
    await askQuestion('astrophysics')

    expect(
      await screen.findByText(/couldn't find enough relevant memories/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/No sources are listed because the stored summaries/i),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: /Sources from your summaries/i }),
    ).toBeNull()
  })

  it('opens a source in the summary detail dialog and links to the memory book', async () => {
    installFetch(() => jsonResponse(ANSWER))

    renderPage()
    await askQuestion('When did I feel proud?')
    await screen.findByText(ANSWER.answer)

    const bookLink = screen.getByRole('link', { name: /Open in memory book/i })
    expect(bookLink.getAttribute('href')).toBe(
      '/app/summaries?book=1&summary=1',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open summary' }))

    expect(await screen.findByRole('dialog', { name: 'Summary 1' })).toBeTruthy()
    expect(screen.getByText(SUMMARY.summary_text)).toBeTruthy()
  })

  it('disables the send button until the question is long enough', () => {
    installFetch(() => {
      throw new Error('The companion should not be called')
    })

    renderPage()
    const send = screen.getByRole('button', {
      name: 'Ask the companion',
    }) as HTMLButtonElement

    expect(send.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'ab' },
    })
    expect(send.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'abc' },
    })
    expect(send.disabled).toBe(false)
  })

  it('renders an empty stored-patterns state', async () => {
    installFetch(
      () => {
        throw new Error('The companion should not be called')
      },
      EMPTY_PATTERNS,
    )

    renderPage()

    expect(
      await screen.findByText(/Save a summary with a theme or a mood/i),
    ).toBeTruthy()
    expect(screen.queryByText('Frequent themes')).toBeNull()
  })

  it('retries failed pattern loading without calling the companion', async () => {
    let patternAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith(PATTERNS_PATH)) {
        patternAttempts += 1
        if (patternAttempts === 1) {
          return jsonResponse({ detail: 'Patterns unavailable.' }, 502)
        }
        return jsonResponse(PATTERNS)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    expect(
      await screen.findByText('We couldn’t load your patterns'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))

    expect(await screen.findByText('Frequent themes')).toBeTruthy()
    expect(patternAttempts).toBe(2)
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(COMPANION_PATH),
      ),
    ).toBe(false)
  })
})
