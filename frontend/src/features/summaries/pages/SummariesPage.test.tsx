import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import type { Summary } from '../../../types/summaries'
import { SummariesPage } from './SummariesPage'

const SUMMARY: Summary = {
  id: 1,
  owner: 1,
  journal_entry_id: 900001,
  summary_text: 'A calm morning walk through the park.',
  mood: 'calm',
  themes: ['nature', 'rest'],
  illustration_prompt: 'A park path in autumn light.',
  created_at: '2026-10-20T07:50:00Z',
  updated_at: '2026-10-20T07:50:00Z',
}

const MOCK_OPTIONS = [
  {
    id: 900002,
    title: 'Project stand-up',
    created_at: '2026-10-21T09:30:00Z',
  },
]

interface FetchCall {
  url: string
  init: RequestInit
}

function installFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler({ url: String(input), init: init ?? {} }),
  )
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
      screen.getByRole('heading', { name: 'Summary for entry #900001' }),
    ).toBeTruthy()
    expect(screen.getByText('calm')).toBeTruthy()
    expect(screen.getByText('nature')).toBeTruthy()
    expect(screen.getByText('rest')).toBeTruthy()
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

  it('generates a summary by sending only the mock entry ID', async () => {
    const generated: Summary = {
      ...SUMMARY,
      id: 9,
      journal_entry_id: 900002,
      summary_text: 'A tense but productive stand-up.',
    }
    let getCount = 0

    const fetchMock = installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        getCount += 1
        return jsonResponse(getCount === 1 ? [] : [generated])
      }
      if (url.endsWith('/api/summaries/mock-journal-entries/')) {
        return jsonResponse(MOCK_OPTIONS)
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
    expect(within(select).queryByRole('option', { name: /Morning walk/ })).toBeNull()
    fireEvent.change(select, { target: { value: '900002' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate summary' }))

    expect(await screen.findByText('Summary generated.')).toBeTruthy()
    expect(await screen.findByText(generated.summary_text)).toBeTruthy()

    const calls = callsOf(fetchMock)
    expect(
      calls.some((call) =>
        call.url.endsWith('/api/summaries/mock-journal-entries/'),
      ),
    ).toBe(true)
    const generate = calls.find((call) =>
      call.url.endsWith('/api/summaries/generate/'),
    )
    expect(generate?.init.method).toBe('POST')
    expect(jsonBody(generate)).toEqual({ journal_entry_id: 900002 })
    expect(getCount).toBe(2)
    // The shared client supplied the CSRF header from the cookie.
    expect((generate?.init.headers as Record<string, string>)['X-CSRFToken']).toBe(
      'test-token',
    )
  })

  it('keeps the generate dialog open and reports a Gemini failure', async () => {
    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([])
      }
      if (url.endsWith('/api/summaries/mock-journal-entries/')) {
        return jsonResponse(MOCK_OPTIONS)
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
    fireEvent.change(select, { target: { value: '900002' } })
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

  it('retries loading the mock entry choices after a failure', async () => {
    let entryCalls = 0

    installFetch(({ url, init }) => {
      const method = init.method ?? 'GET'
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        return jsonResponse([])
      }
      if (url.endsWith('/api/summaries/mock-journal-entries/')) {
        entryCalls += 1
        if (entryCalls === 1) {
          return jsonResponse({ detail: 'Journal entries are unavailable.' }, 503)
        }
        return jsonResponse(MOCK_OPTIONS)
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
