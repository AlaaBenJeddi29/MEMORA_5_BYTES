import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import type { JournalEntry, JournalPage } from '../../../types/journal'
import type {
  Summary,
  SummarySearchHit,
  SummarySearchPage,
} from '../../../types/summaries'
import { DEFAULT_BOOK_PREFERENCES } from '../bookThemes'
import { SummariesPage } from './SummariesPage'

const SUMMARY: Summary = {
  id: 1,
  owner: 1,
  journal_entry_id: 2,
  summary_text: 'A calm morning walk through the park.',
  mood: 'calm',
  themes: ['nature', 'rest'],
  illustration_prompt: 'A park path in autumn light.',
  created_at: '2026-10-20T07:50:00Z',
  updated_at: '2026-10-20T07:50:00Z',
}

const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 2,
    user: 1,
    title: 'Project stand-up',
    text: 'The team stand-up ran longer than expected.',
    audio_file: '',
    summary_text: '',
    sentiment: '',
    created_at: '2026-10-21T09:30:00Z',
    photos: [],
  },
]

const JOURNAL_PAGE: JournalPage = {
  count: JOURNAL_ENTRIES.length,
  next: null,
  previous: null,
  results: JOURNAL_ENTRIES,
}

const JOURNAL_PICKER_URL = '/api/journal/entries/?page=1&page_size=100'
const SEARCH_PATH = '/api/summaries/search/'
const PREFERENCES_PATH = '/api/summaries/book-preferences/'
const SEARCH_LABEL = /Recherche dans vos souvenirs/i

interface FetchCall {
  url: string
  init: RequestInit
}

interface FetchOptions {
  /** Serve the default saved preferences unless the test opts out. */
  servePreferences?: boolean
}

function installFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
  { servePreferences = true }: FetchOptions = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    if (
      servePreferences &&
      call.url.endsWith(PREFERENCES_PATH) &&
      (call.init.method ?? 'GET') === 'GET'
    ) {
      return jsonResponse(DEFAULT_BOOK_PREFERENCES)
    }
    return handler(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callsOf(fetchMock: ReturnType<typeof installFetch>): FetchCall[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: String(input),
    init: init ?? {},
  }))
}

function jsonBody(call: FetchCall | undefined): unknown {
  return call?.init.body ? JSON.parse(String(call.init.body)) : undefined
}

function searchPageOf(
  results: SummarySearchHit[],
  overrides: Partial<SummarySearchPage> = {},
): SummarySearchPage {
  return { count: results.length, next: null, previous: null, results, ...overrides }
}

function searchHitOf(
  summaryOverrides: Partial<Summary> = {},
  overrides: Partial<SummarySearchHit> = {},
): SummarySearchHit {
  const summary: Summary = { ...SUMMARY, ...summaryOverrides }
  return {
    summary,
    score: 5,
    matched_fields: ['summary_text'],
    matched_terms: ['accomplishment'],
    snippet: summary.summary_text,
    ...overrides,
  }
}

function isSearchCall(call: FetchCall): boolean {
  return call.url.includes(SEARCH_PATH)
}

function searchParamsOf(call: FetchCall): URLSearchParams {
  return new URL(call.url, 'http://localhost').searchParams
}

beforeEach(() => {
  // Skip the CSRF bootstrap request; the shared client reads this cookie.
  document.cookie = 'csrftoken=test-token'
})

describe('SummariesPage', () => {
  it('loads and renders the signed-in user’s summaries', async () => {
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        return jsonResponse([SUMMARY])
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)

    expect(screen.getByText('Loading summaries…')).toBeTruthy()
    expect(await screen.findByText(SUMMARY.summary_text)).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Summary for journal entry #2' }),
    ).toBeTruthy()
    expect(screen.getByText('calm')).toBeTruthy()
    expect(screen.getByText('nature')).toBeTruthy()
    expect(screen.getByText('rest')).toBeTruthy()
  })

  it('links a summary with an illustration prompt to the media library', async () => {
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        return jsonResponse([SUMMARY])
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.click(screen.getByRole('button', { name: 'View summary 1' }))
    const dialog = await screen.findByRole('dialog')
    const link = within(dialog).getByRole('link', {
      name: 'Generate illustration',
    })

    expect(link.getAttribute('href')).toBe(
      '/app/media?summary_id=1&journal_entry_id=2',
    )
  })

  it('does not offer illustration generation without an illustration prompt', async () => {
    const withoutPrompt: Summary = {
      ...SUMMARY,
      id: 8,
      illustration_prompt: '',
    }
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        return jsonResponse([withoutPrompt])
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(withoutPrompt.summary_text)

    fireEvent.click(screen.getByRole('button', { name: 'View summary 8' }))
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).queryByRole('link', { name: 'Generate illustration' }),
    ).toBeNull()
    expect(
      within(dialog).getByText(/Add an illustration prompt in the summary editor/i),
    ).toBeTruthy()
  })

  it('shows an empty state when there are no summaries', async () => {
    installFetch(() => jsonResponse([]))

    render(<SummariesPage />)

    expect(await screen.findByText('No summaries yet')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Generate your first summary' }),
    ).toBeTruthy()
  })

  it('shows a required-field error and never posts an empty summary', async () => {
    const fetchMock = installFetch(() => jsonResponse([]))

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'New summary' }))
    const dialog = screen.getByRole('dialog', { name: 'New summary' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create summary' }))

    expect(await within(dialog).findByText('Summary text is required.')).toBeTruthy()
    expect(callsOf(fetchMock).some((call) => call.init.method === 'POST')).toBe(false)
  })

  it('creates a summary and refreshes the list', async () => {
    const created: Summary = {
      ...SUMMARY,
      id: 7,
      journal_entry_id: null,
      summary_text: 'A new manual summary.',
    }
    let listCalls = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse(listCalls === 1 ? [] : [created])
      }
      if (url.endsWith('/api/summaries/') && method === 'POST') {
        return jsonResponse(created, 201)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'New summary' }))
    const dialog = screen.getByRole('dialog', { name: 'New summary' })
    fireEvent.change(within(dialog).getByLabelText(/Summary text/), {
      target: { value: 'A new manual summary.' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Mood/), {
      target: { value: 'hopeful' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Themes/), {
      target: { value: 'work, rest' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create summary' }))

    expect(await screen.findByText('Summary created.')).toBeTruthy()
    expect(await screen.findByText('A new manual summary.')).toBeTruthy()

    const post = callsOf(fetchMock).find((call) => call.init.method === 'POST')
    expect(post?.url).toMatch(/\/api\/summaries\/$/)
    expect(jsonBody(post)).toEqual({
      summary_text: 'A new manual summary.',
      mood: 'hopeful',
      themes: ['work', 'rest'],
      illustration_prompt: '',
      journal_entry_id: null,
    })
    expect(jsonBody(post)).not.toHaveProperty('owner')
    expect(listCalls).toBe(2)
  })

  it('updates a summary with PATCH and refreshes the list', async () => {
    const updated: Summary = { ...SUMMARY, summary_text: 'An updated recap.' }
    let getCount = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        getCount += 1
        return jsonResponse(getCount === 1 ? [SUMMARY] : [updated])
      }
      if (url.endsWith('/api/summaries/1/') && method === 'PATCH') {
        return jsonResponse(updated)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.click(screen.getByRole('button', { name: 'Edit summary 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit summary' })
    fireEvent.change(within(dialog).getByLabelText(/Summary text/), {
      target: { value: 'An updated recap.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Summary updated.')).toBeTruthy()
    expect(await screen.findByText('An updated recap.')).toBeTruthy()

    const patch = callsOf(fetchMock).find((call) => call.init.method === 'PATCH')
    expect(patch?.url).toMatch(/\/api\/summaries\/1\/$/)
    expect(jsonBody(patch)).toMatchObject({ summary_text: 'An updated recap.' })
    expect(getCount).toBe(2)
  })

  it('deletes a summary after confirmation and refreshes the list', async () => {
    let getCount = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        getCount += 1
        return jsonResponse(getCount === 1 ? [SUMMARY] : [])
      }
      if (url.endsWith('/api/summaries/1/') && method === 'DELETE') {
        return jsonResponse(undefined, 204)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.click(screen.getByRole('button', { name: 'Delete summary 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete summary' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete summary' }))

    expect(await screen.findByText('Summary deleted.')).toBeTruthy()
    expect(await screen.findByText('No summaries yet')).toBeTruthy()

    const remove = callsOf(fetchMock).find((call) => call.init.method === 'DELETE')
    expect(remove?.url).toMatch(/\/api\/summaries\/1\/$/)
    expect(getCount).toBe(2)
  })

  it('generates a summary by sending only the real journal entry ID', async () => {
    const generated: Summary = {
      ...SUMMARY,
      id: 9,
      journal_entry_id: 2,
      summary_text: 'A tense but productive stand-up.',
    }
    let getCount = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        getCount += 1
        return jsonResponse(getCount === 1 ? [] : [generated])
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        return jsonResponse(JOURNAL_PAGE)
      }
      if (url.endsWith('/api/summaries/generate/') && method === 'POST') {
        return jsonResponse(generated, 201)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })
    const select = await within(dialog).findByLabelText(/Journal entry/)
    expect(within(select).getByRole('option', { name: /Project stand-up/ })).toBeTruthy()
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate summary' }))

    expect(await screen.findByText('Summary generated.')).toBeTruthy()
    expect(await screen.findByText(generated.summary_text)).toBeTruthy()

    const card = screen.getByText(generated.summary_text).closest('li')
    expect(card?.classList.contains('is-highlighted')).toBe(true)
    expect(document.activeElement).toBe(card)

    const calls = callsOf(fetchMock)
    expect(calls.some((call) => call.url.endsWith(JOURNAL_PICKER_URL))).toBe(true)
    const generate = calls.find((call) =>
      call.url.endsWith('/api/summaries/generate/'),
    )
    expect(generate?.init.method).toBe('POST')
    expect(jsonBody(generate)).toEqual({ journal_entry_id: 2 })
    expect(getCount).toBe(2)
    // The shared client supplied the CSRF header from the cookie.
    expect((generate?.init.headers as Record<string, string>)['X-CSRFToken']).toBe(
      'test-token',
    )
  })

  it('keeps the generated card when the list refresh fails', async () => {
    const generated: Summary = {
      ...SUMMARY,
      id: 14,
      journal_entry_id: 2,
      summary_text: 'A recap that survives a failed refresh.',
    }
    let listCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        if (listCalls === 1) {
          return jsonResponse([])
        }
        throw new TypeError('Failed to fetch')
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        return jsonResponse(JOURNAL_PAGE)
      }
      if (url.endsWith('/api/summaries/generate/') && method === 'POST') {
        return jsonResponse(generated, 201)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })
    const select = await within(dialog).findByLabelText(/Journal entry/)
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate summary' }))

    expect(await screen.findByText('Summary generated.')).toBeTruthy()
    expect(await screen.findByText(generated.summary_text)).toBeTruthy()
    expect(
      await screen.findByText('We couldn’t refresh your summaries'),
    ).toBeTruthy()
    expect(screen.getByText(generated.summary_text)).toBeTruthy()
    expect(listCalls).toBe(2)
  })

  it('clears an active search so the generated card is visible', async () => {
    const generated: Summary = {
      ...SUMMARY,
      id: 15,
      journal_entry_id: 2,
      summary_text: 'A recap after a concept search.',
    }
    const hit = searchHitOf({ ...SUMMARY }, { snippet: 'A calm morning walk.' })
    let listCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse(listCalls === 1 ? [SUMMARY] : [generated, SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return jsonResponse(searchPageOf([hit]))
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        return jsonResponse(JOURNAL_PAGE)
      }
      if (url.endsWith('/api/summaries/generate/') && method === 'POST') {
        return jsonResponse(generated, 201)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'calme' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByRole('list', { name: 'Résultats de recherche' })

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })
    const select = await within(dialog).findByLabelText(/Journal entry/)
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate summary' }))

    expect(await screen.findByText('Summary generated.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your summaries' })).toBeTruthy()
    expect((screen.getByLabelText(SEARCH_LABEL) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('list', { name: 'Résultats de recherche' })).toBeNull()
    expect(await screen.findByText(generated.summary_text)).toBeTruthy()
  })

  it('keeps the generate dialog open and reports a Gemini failure', async () => {
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([])
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        return jsonResponse(JOURNAL_PAGE)
      }
      if (url.endsWith('/api/summaries/generate/') && method === 'POST') {
        return jsonResponse(
          { detail: 'Summary generation is not configured on the server.' },
          503,
        )
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })
    const select = await within(dialog).findByLabelText(/Journal entry/)
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate summary' }))

    expect(
      await within(dialog).findByText(
        'Summary generation is not configured on the server.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Generate a summary' })).toBeTruthy()
    expect(
      (within(dialog).getByRole('button', { name: 'Generate summary' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('retries loading the real journal entry choices after a failure', async () => {
    let entryCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([])
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        entryCalls += 1
        if (entryCalls === 1) {
          return jsonResponse({ detail: 'Journal entries are unavailable.' }, 503)
        }
        return jsonResponse(JOURNAL_PAGE)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })

    expect(
      await within(dialog).findByText('Journal entries are unavailable.'),
    ).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))

    const select = await within(dialog).findByLabelText(/Journal entry/)
    expect(within(select).getByRole('option', { name: /Project stand-up/ })).toBeTruthy()
    expect(entryCalls).toBe(2)
  })

  it('shows an empty state when the user has no journal entries', async () => {
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([])
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        return jsonResponse({ count: 0, next: null, previous: null, results: [] })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    const dialog = await screen.findByRole('dialog', { name: 'Generate a summary' })

    expect(await within(dialog).findByText('No journal entries yet')).toBeTruthy()
    expect(within(dialog).queryByLabelText(/Journal entry/)).toBeNull()
  })

  it('shows a network error and retries loading the list', async () => {
    let getCount = 0

    installFetch(({ url }) => {
      if (!url.endsWith('/api/summaries/')) {
        throw new Error(`Unexpected request: ${url}`)
      }
      getCount += 1
      if (getCount === 1) {
        throw new TypeError('Failed to fetch')
      }
      return jsonResponse([SUMMARY])
    })

    render(<SummariesPage />)

    expect(
      await screen.findByText(
        'We couldn’t reach the server. Check your connection and try again.',
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(SUMMARY.summary_text)).toBeTruthy()
    expect(getCount).toBe(2)
  })
})

describe('SummariesPage search', () => {
  it('renders an accessible search bar and submits a concept query with Enter', async () => {
    const first = searchHitOf(
      { id: 11, journal_entry_id: 2, summary_text: 'A real accomplishment.' },
      { snippet: '…a real sense of accomplishment.', score: 9 },
    )
    const second = searchHitOf(
      { id: 12, journal_entry_id: 5, summary_text: 'A calm day at school.' },
      {
        snippet: '…school was calm.',
        score: 4,
        matched_fields: ['themes'],
        matched_terms: ['school'],
      },
    )

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return jsonResponse(searchPageOf([first, second]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const input = screen.getByLabelText(SEARCH_LABEL)
    expect(input.getAttribute('type')).toBe('search')
    expect(input.getAttribute('maxlength')).toBe('200')
    expect(screen.getByRole('search')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'fierté' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(await screen.findByText('…a real sense of accomplishment.')).toBeTruthy()

    const results = screen.getByRole('list', { name: 'Résultats de recherche' })
    expect(
      within(results)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Summary for journal entry #2', 'Summary for journal entry #5'])
    expect(screen.queryByText(SUMMARY.summary_text)).toBeNull()

    const searchCall = callsOf(fetchMock).find(isSearchCall)
    expect(searchCall).toBeDefined()
    const params = searchParamsOf(searchCall!)
    expect(params.get('q')).toBe('fierté')
    expect(params.get('page')).toBe('1')
    expect(params.get('page_size')).toBe('20')
  })

  it('shows a loading indicator while the search button request is in flight', async () => {
    let resolveSearch!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const result = searchHitOf(
      { id: 21, summary_text: 'A study session result.' },
      { snippet: 'A study session result.' },
    )

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return pending
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'études' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('Recherche dans vos souvenirs…')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Recherche…' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    await act(async () => {
      resolveSearch(jsonResponse(searchPageOf([result])))
      await pending
    })

    expect(await screen.findByText('A study session result.')).toBeTruthy()
  })

  it('shows the empty state when nothing matches', async () => {
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return jsonResponse(searchPageOf([]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'astrophysique' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(
      await screen.findByText('Aucun souvenir correspondant à cette recherche.'),
    ).toBeTruthy()
    expect(screen.getByText('Essayez une autre formulation.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Effacer la recherche' }),
    ).toBeTruthy()
  })

  it('reports an API error and retries the same query', async () => {
    const result = searchHitOf(
      { id: 31, summary_text: 'A recovered result.' },
      { snippet: 'A recovered result.' },
    )
    let searchCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        searchCalls += 1
        if (searchCalls === 1) {
          return jsonResponse({ detail: 'Search is temporarily unavailable.' }, 503)
        }
        return jsonResponse(searchPageOf([result]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'fierté' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(
      await screen.findByText('La recherche n’a pas pu aboutir.'),
    ).toBeTruthy()
    expect(screen.getByText('Search is temporarily unavailable.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('A recovered result.')).toBeTruthy()
    expect(searchCalls).toBe(2)
  })

  it('shows the search error on a network failure', async () => {
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        throw new TypeError('Failed to fetch')
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'famille' },
    })
    fireEvent.submit(screen.getByRole('search'))

    expect(
      await screen.findByText('La recherche n’a pas pu aboutir.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'We couldn’t reach the server. Check your connection and try again.',
      ),
    ).toBeTruthy()
  })

  it('clears the query and returns to the normal list', async () => {
    const result = searchHitOf(
      { id: 41, summary_text: 'A result to clear.' },
      { snippet: 'A result to clear.' },
    )

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return jsonResponse(searchPageOf([result]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const input = screen.getByLabelText(SEARCH_LABEL) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'fierté' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('A result to clear.')

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(screen.queryByRole('list', { name: 'Résultats de recherche' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your summaries' })).toBeTruthy()
    expect(screen.getByText(SUMMARY.summary_text)).toBeTruthy()
  })

  it('paginates search results with the standard page parameters', async () => {
    const first = searchHitOf(
      { id: 51, journal_entry_id: 51, summary_text: 'First page result.' },
      { snippet: 'First page result.' },
    )
    const second = searchHitOf(
      { id: 52, journal_entry_id: 52, summary_text: 'Second page result.' },
      { snippet: 'Second page result.' },
    )
    const requestedPages: string[] = []

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        const page = searchParamsOf({ url, init }).get('page') ?? ''
        requestedPages.push(page)
        if (page === '2') {
          return jsonResponse(
            searchPageOf([second], {
              count: 21,
              previous:
                'http://localhost/api/summaries/search/?q=fierte&page=1&page_size=20',
            }),
          )
        }
        return jsonResponse(
          searchPageOf([first], {
            count: 21,
            next: 'http://localhost/api/summaries/search/?q=fierte&page=2&page_size=20',
          }),
        )
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'fierté' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('First page result.')

    expect(screen.getByText('Page 1 sur 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText('Second page result.')).toBeTruthy()
    expect(screen.getByText('Page 2 sur 2')).toBeTruthy()
    expect(requestedPages).toEqual(['1', '2'])
    expect(
      (screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('opens a search result in the existing detail dialog', async () => {
    const result = searchHitOf(
      {
        id: 61,
        journal_entry_id: null,
        summary_text: 'A proud moment worth revisiting.',
      },
      { snippet: '…proud…' },
    )

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      if (isSearchCall({ url, init })) {
        return jsonResponse(searchPageOf([result]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'fierté' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('…proud…')

    fireEvent.click(screen.getByRole('button', { name: 'View summary 61' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('A proud moment worth revisiting.'),
    ).toBeTruthy()
  })

  it('keeps editing available from search results and refreshes the search', async () => {
    const original = searchHitOf(
      { id: 71, journal_entry_id: 2, summary_text: 'Original recap.' },
      { snippet: 'Original recap.' },
    )
    const updatedSummary: Summary = {
      ...original.summary,
      summary_text: 'Updated recap.',
      updated_at: '2026-10-22T10:00:00Z',
    }
    const updatedHit: SummarySearchHit = {
      ...original,
      summary: updatedSummary,
      snippet: 'Updated recap.',
    }
    let listCalls = 0
    let searchCalls = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse([listCalls === 1 ? original.summary : updatedSummary])
      }
      if (isSearchCall({ url, init })) {
        searchCalls += 1
        return jsonResponse(searchPageOf([searchCalls === 1 ? original : updatedHit]))
      }
      if (url.endsWith('/api/summaries/71/') && method === 'PATCH') {
        return jsonResponse(updatedSummary)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(original.summary.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'fierté' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('Original recap.')

    fireEvent.click(screen.getByRole('button', { name: 'Edit summary 71' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit summary' })
    fireEvent.change(within(dialog).getByLabelText(/Summary text/), {
      target: { value: 'Updated recap.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Summary updated.')).toBeTruthy()
    expect(await screen.findByText('Updated recap.')).toBeTruthy()
    expect(searchCalls).toBe(2)
    expect(listCalls).toBe(2)

    const patch = callsOf(fetchMock).find((call) => call.init.method === 'PATCH')
    expect(patch?.url).toMatch(/\/api\/summaries\/71\/$/)
  })
})

describe('SummariesPage memory book', () => {
  it('opens the book from the loaded summaries without another request', async () => {
    let listCalls = 0
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse([SUMMARY])
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const openButton = screen.getByRole('button', {
      name: 'Open memory book',
    }) as HTMLButtonElement
    expect(openButton.disabled).toBe(false)

    fireEvent.click(openButton)

    expect(screen.getByRole('region', { name: 'Memory book' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'My Story' })).toBeTruthy()
    expect(screen.getByText('1 memory')).toBeTruthy()
    expect(document.title).toBe('My Story · MEMORA')

    fireEvent.click(screen.getByRole('button', { name: 'Open my book' }))

    expect(screen.getByText(SUMMARY.summary_text)).toBeTruthy()
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close book' }))

    expect(screen.getByRole('heading', { name: 'Reflections' })).toBeTruthy()
    expect(document.title).toBe('Summaries · MEMORA')
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open memory book' }),
    )
    expect(listCalls).toBe(1)
  })

  it('opens a search result at its page and restores focus when closed', async () => {
    const later: Summary = {
      ...SUMMARY,
      id: 12,
      journal_entry_id: null,
      summary_text: 'A later proud memory.',
      created_at: '2026-11-02T10:00:00Z',
    }
    const hit = searchHitOf(
      { ...later },
      { snippet: 'A later proud memory.' },
    )
    let listCalls = 0
    let searchCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse([SUMMARY, later])
      }
      if (isSearchCall({ url, init })) {
        searchCalls += 1
        return jsonResponse(searchPageOf([hit]))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: 'fierté' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await screen.findByText('A later proud memory.')

    fireEvent.click(
      screen.getByRole('button', { name: 'Read summary 12 in the book' }),
    )

    expect(screen.getByRole('region', { name: 'Memory book' })).toBeTruthy()
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    expect(screen.getByText(later.summary_text)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close book' }))

    expect(
      screen.getByRole('heading', { name: 'Résultats de recherche' }),
    ).toBeTruthy()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Read summary 12 in the book' }),
    )
    expect(listCalls).toBe(1)
    expect(searchCalls).toBe(1)
  })

  it('opens a list card at its page and restores focus when closed', async () => {
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        return jsonResponse([SUMMARY])
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    fireEvent.click(
      screen.getByRole('button', { name: 'Read summary 1 in the book' }),
    )

    expect(screen.getByRole('region', { name: 'Memory book' })).toBeTruthy()
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    expect(screen.getByText(SUMMARY.summary_text)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close book' }))

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Read summary 1 in the book' }),
    )
  })

  it('shows the empty cover when there are no memories and can return', async () => {
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        return jsonResponse([])
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText('No summaries yet')

    fireEvent.click(screen.getByRole('button', { name: 'Open memory book' }))

    expect(screen.getByText('Your book is waiting.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open my book' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to summaries' }))

    expect(screen.getByText('No summaries yet')).toBeTruthy()
  })

  it('keeps the book unavailable while loading or after a load failure', async () => {
    installFetch(({ url }) => {
      if (url.endsWith('/api/summaries/')) {
        throw new TypeError('Failed to fetch')
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SummariesPage />)

    expect(
      (screen.getByRole('button', { name: 'Open memory book' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await screen.findByText(
      'We couldn’t reach the server. Check your connection and try again.',
    )

    expect(
      (screen.getByRole('button', { name: 'Open memory book' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(screen.queryByRole('region', { name: 'Memory book' })).toBeNull()
  })

  it('applies the saved customization to the book', async () => {
    installFetch(
      ({ url, init }) => {
        const method = init.method ?? 'GET'
        if (url.endsWith('/api/summaries/') && method === 'GET') {
          return jsonResponse([SUMMARY])
        }
        if (url.endsWith(PREFERENCES_PATH) && method === 'GET') {
          return jsonResponse({
            cover_style: 'night',
            theme_id: 'ocean',
            font_style: 'modern',
          })
        }
        throw new Error(`Unexpected request: ${method} ${url}`)
      },
      { servePreferences: false },
    )

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const openButton = screen.getByRole('button', {
      name: 'Open memory book',
    }) as HTMLButtonElement
    await waitFor(() => expect(openButton.disabled).toBe(false))
    fireEvent.click(openButton)

    const book = screen.getByRole('region', { name: 'Memory book' })
    expect(book.classList.contains('book-theme--ocean')).toBe(true)
    expect(book.classList.contains('book-font--modern')).toBe(true)
    expect(book.classList.contains('book-cover-style--night')).toBe(true)
  })

  it('previews and saves a customization without reloading the book', async () => {
    let listCalls = 0
    const saved = {
      cover_style: 'night',
      theme_id: 'ocean',
      font_style: 'modern',
    }

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        listCalls += 1
        return jsonResponse([SUMMARY])
      }
      if (url.endsWith(PREFERENCES_PATH) && method === 'PUT') {
        return jsonResponse(JSON.parse(String(init.body)))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const openButton = screen.getByRole('button', {
      name: 'Open memory book',
    }) as HTMLButtonElement
    await waitFor(() => expect(openButton.disabled).toBe(false))
    fireEvent.click(openButton)

    fireEvent.click(
      screen.getByRole('button', { name: 'Personnaliser mon livre' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Personnaliser mon livre',
    })

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Nuit étoilée' }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Océan' }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Contemporain' }))

    const preview = within(dialog).getByRole('img', { name: /Aperçu/ })
    expect(preview.classList.contains('book-cover-style--night')).toBe(true)
    expect(preview.classList.contains('book-theme--ocean')).toBe(true)
    expect(preview.classList.contains('book-font--modern')).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const book = screen.getByRole('region', { name: 'Memory book' })
    expect(book.classList.contains('book-cover-style--night')).toBe(true)
    expect(book.classList.contains('book-theme--ocean')).toBe(true)
    expect(book.classList.contains('book-font--modern')).toBe(true)
    expect(screen.getByRole('heading', { name: 'My Story' })).toBeTruthy()

    const put = callsOf(fetchMock).find((call) => call.init.method === 'PUT')
    expect(put?.url).toMatch(/\/book-preferences\/$/)
    expect(jsonBody(put)).toEqual(saved)
    expect(listCalls).toBe(1)
  })

  it('discards unsaved customization when cancelled', async () => {
    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([SUMMARY])
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    render(<SummariesPage />)
    await screen.findByText(SUMMARY.summary_text)

    const openButton = screen.getByRole('button', {
      name: 'Open memory book',
    }) as HTMLButtonElement
    await waitFor(() => expect(openButton.disabled).toBe(false))
    fireEvent.click(openButton)

    fireEvent.click(
      screen.getByRole('button', { name: 'Personnaliser mon livre' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Personnaliser mon livre',
    })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Nuit' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const book = screen.getByRole('region', { name: 'Memory book' })
    expect(book.classList.contains('book-theme--night')).toBe(false)
    expect(book.classList.contains('book-theme--paper')).toBe(true)
    expect(callsOf(fetchMock).some((call) => call.init.method === 'PUT')).toBe(
      false,
    )
  })
})
