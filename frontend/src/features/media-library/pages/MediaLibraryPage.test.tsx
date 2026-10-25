import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeResponse, jsonResponse } from '../../../test/fakeResponse'
import type { JournalEntry, JournalPage } from '../../../types/journal'
import type { MediaItem } from '../../../types/media'
import type { Summary } from '../../../types/summaries'
import { MAX_PROMPT_LENGTH } from '../mediaHelpers'
import { MediaLibraryPage } from './MediaLibraryPage'

const ORIGINAL: MediaItem = {
  id: 11,
  file: 'http://testserver/media/users/1/2026/10/original.png',
  media_type: 'original',
  prompt: '',
  status: 'succeeded',
  journal_entry_id: null,
  journal_entries: [],
  summary_id: null,
  provider: '',
  model: '',
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
}

const GENERATED: MediaItem = {
  id: 12,
  file: 'http://testserver/media/users/1/2026/10/generated.png',
  media_type: 'ai_generated',
  prompt: 'A quiet lake at dawn, watercolor.',
  status: 'succeeded',
  journal_entry_id: 2,
  journal_entries: [{ id: 2, title: 'Rainy afternoon' }],
  summary_id: 3,
  provider: 'comfyui',
  model: 'sd15.safetensors',
  created_at: '2026-10-21T11:30:00Z',
  updated_at: '2026-10-21T11:30:00Z',
}

const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 2,
    user: 1,
    title: 'Rainy afternoon',
    text: 'Spent the afternoon reading by the window.',
    audio_file: '',
    summary_text: 'A quiet afternoon reading by the window.',
    sentiment: '',
    created_at: '2026-09-15T15:40:00Z',
    photos: [12],
  },
]

const JOURNAL_PAGE: JournalPage = {
  count: JOURNAL_ENTRIES.length,
  next: null,
  previous: null,
  results: JOURNAL_ENTRIES,
}

const JOURNAL_PICKER_URL = '/api/journal/entries/?page=1&page_size=100'

const SUMMARIES: Summary[] = [
  {
    id: 3,
    owner: 1,
    journal_entry_id: 2,
    summary_text: 'A quiet afternoon reading by the window.',
    mood: 'calm',
    themes: ['rest'],
    illustration_prompt: 'A rain-soaked window at dusk.',
    created_at: '2026-09-15T16:00:00Z',
    updated_at: '2026-09-15T16:00:00Z',
  },
  {
    id: 4,
    owner: 1,
    journal_entry_id: null,
    summary_text: 'A manual recap without an illustration prompt.',
    mood: '',
    themes: [],
    illustration_prompt: '',
    created_at: '2026-09-16T09:00:00Z',
    updated_at: '2026-09-16T09:00:00Z',
  },
]

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

function installFetch(handler: FetchHandler) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => handler(String(input), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

interface SourceFixtures {
  media?: MediaItem[]
  journalPage?: JournalPage
  summaries?: Summary[]
}

function baseHandler({
  media = [ORIGINAL, GENERATED],
  journalPage = JOURNAL_PAGE,
  summaries = SUMMARIES,
}: SourceFixtures = {}): FetchHandler {
  return (url, init) => {
    const method = init?.method ?? 'GET'
    if (url.endsWith('/api/media/') && method === 'GET') {
      return jsonResponse(media)
    }
    if (url.endsWith(JOURNAL_PICKER_URL)) {
      return jsonResponse(journalPage)
    }
    if (url.endsWith('/api/summaries/') && method === 'GET') {
      return jsonResponse(summaries)
    }
    return jsonResponse({ detail: 'Not found' }, 404)
  }
}

function renderPage(initialEntries: string[] = ['/app/media']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MediaLibraryPage />
    </MemoryRouter>,
  )
}

function giveGenerationConsent() {
  fireEvent.click(
    screen.getByRole('checkbox', { name: /I understand generating uses/i }),
  )
}

beforeEach(() => {
  document.cookie = 'csrftoken=test-token; path=/'
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:preview'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('MediaLibraryPage', () => {
  it('renders owner media from the API and distinguishes original from AI', async () => {
    installFetch(baseHandler())
    renderPage()

    expect(await screen.findByText('Original photo')).toBeTruthy()
    expect(screen.getByText('AI illustration')).toBeTruthy()
    expect(screen.getByText('A quiet lake at dawn, watercolor.')).toBeTruthy()
    expect(screen.getByText('2 of 2 shown')).toBeTruthy()
  })

  it('filters by media type and reports an empty filtered result', async () => {
    installFetch(baseHandler())
    renderPage()

    await screen.findByText('Original photo')

    fireEvent.change(screen.getByLabelText('Media type'), {
      target: { value: 'ai_generated' },
    })

    expect(await screen.findByText('1 of 2 shown')).toBeTruthy()
    expect(screen.queryByText('No description yet.')).toBeNull()

    fireEvent.change(screen.getByLabelText('Media type'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'no-such-prompt' },
    })

    expect(await screen.findByText('No media matches these filters')).toBeTruthy()
  })

  it('searches by real journal entry title', async () => {
    installFetch(baseHandler())
    renderPage()

    await screen.findByText('Original photo')

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'rainy afternoon' },
    })

    expect(await screen.findByText('1 of 2 shown')).toBeTruthy()
  })

  it('previews an upload locally and posts multipart form data', async () => {
    const uploaded: MediaItem = {
      ...ORIGINAL,
      id: 21,
      file: 'http://testserver/media/users/1/2026/10/new.png',
    }
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith('/api/media/') && init?.method === 'POST') {
        return jsonResponse(uploaded, 201)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    const file = new File(['image-bytes'], 'holiday.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Image file/), {
      target: { files: [file] },
    })

    expect(screen.getByAltText('Local preview of the selected image')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))

    expect(await screen.findByText('Upload complete')).toBeTruthy()
    expect(screen.getByText('3 of 3 shown')).toBeTruthy()

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeTruthy()
    const body = postCall?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
  })

  it('sends only the selected real journal entry ID to the generation API', async () => {
    const generated: MediaItem = {
      ...GENERATED,
      id: 31,
      summary_id: null,
      prompt: 'Illustrate this journal memory titled "Rainy afternoon".',
      created_at: '2026-10-24T12:00:00Z',
      updated_at: '2026-10-24T12:00:00Z',
    }
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        return jsonResponse(generated, 201)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    const select = (await screen.findByLabelText('Journal entry')) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(screen.getByText(/never the entry body/i)).toBeTruthy()
    fireEvent.change(select, { target: { value: '2' } })
    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(await screen.findByText('AI-generated illustration')).toBeTruthy()
    expect(
      screen.getByText(/It is not an original photograph/i),
    ).toBeTruthy()

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/media/generate/') && init?.method === 'POST',
    )
    const body = JSON.parse(String(postCall?.[1]?.body))
    expect(body).toEqual({ journal_entry_id: 2, width: 512, height: 512 })
    expect(body).not.toHaveProperty('title')
    expect(body).not.toHaveProperty('text')
    expect(body).not.toHaveProperty('content')
  })

  it('uses a real summary and keeps its journal pairing', async () => {
    const generated: MediaItem = {
      ...GENERATED,
      id: 32,
      prompt: 'A rain-soaked window at dusk.',
      created_at: '2026-10-24T12:05:00Z',
      updated_at: '2026-10-24T12:05:00Z',
    }
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        return jsonResponse(generated, 201)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    const summarySelect = (await screen.findByLabelText('Summary')) as HTMLSelectElement
    await waitFor(() => expect(summarySelect.disabled).toBe(false))
    fireEvent.change(summarySelect, { target: { value: '3' } })

    const journalSelect = screen.getByLabelText('Journal entry') as HTMLSelectElement
    expect(journalSelect.value).toBe('2')

    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(await screen.findByText('AI-generated illustration')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'summary #3' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rainy afternoon' })).toBeTruthy()

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/media/generate/') && init?.method === 'POST',
    )
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      summary_id: 3,
      journal_entry_id: 2,
      width: 512,
      height: 512,
    })
  })

  it('preselects a summary and journal entry from query parameters', async () => {
    installFetch(baseHandler())
    renderPage(['/app/media?summary_id=3&journal_entry_id=2'])

    await screen.findByText('Original photo')

    await waitFor(() =>
      expect((screen.getByLabelText('Summary') as HTMLSelectElement).value).toBe('3'),
    )
    expect((screen.getByLabelText('Journal entry') as HTMLSelectElement).value).toBe(
      '2',
    )
  })

  it('blocks a summary hint that is not in the caller account without calling generate', async () => {
    let generateCalls = 0
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        generateCalls += 1
      }
      return baseHandler()(url, init)
    })
    renderPage(['/app/media?summary_id=999'])

    await screen.findByText('Original photo')
    await waitFor(() =>
      expect((screen.getByLabelText('Summary') as HTMLSelectElement).disabled).toBe(
        false,
      ),
    )

    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(
      await screen.findByText(
        'That summary is not in your account. Choose one of your summaries or clear the selection.',
      ),
    ).toBeTruthy()
    expect(generateCalls).toBe(0)
  })

  it('blocks a summary without an illustration prompt when no manual prompt is given', async () => {
    let generateCalls = 0
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        generateCalls += 1
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    const summarySelect = (await screen.findByLabelText('Summary')) as HTMLSelectElement
    await waitFor(() => expect(summarySelect.disabled).toBe(false))
    fireEvent.change(summarySelect, { target: { value: '4' } })

    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(
      await screen.findByText(
        'This summary has no illustration prompt. Add one in Summaries or enter a manual prompt.',
      ),
    ).toBeTruthy()
    expect(generateCalls).toBe(0)
  })

  it('offers a retry after a recoverable generation failure', async () => {
    let attempts = 0
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        attempts += 1
        if (attempts === 1) {
          return jsonResponse(
            { detail: 'The local image generation service is unavailable.' },
            503,
          )
        }
        return jsonResponse(
          { ...GENERATED, id: 41, prompt: 'A quiet lake at dawn' },
          201,
        )
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    fireEvent.change(screen.getByLabelText(/Prompt/), {
      target: { value: 'A quiet lake at dawn' },
    })
    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(
      await screen.findByText('The local image generation service is unavailable.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('AI-generated illustration')).toBeTruthy()
    expect(attempts).toBe(2)
  })

  it('reports source failures and reloads real journal entries and summaries', async () => {
    let journalCalls = 0
    let summaryCalls = 0
    installFetch((url, init) => {
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/media/') && method === 'GET') {
        return jsonResponse([ORIGINAL, GENERATED])
      }
      if (url.endsWith(JOURNAL_PICKER_URL)) {
        journalCalls += 1
        if (journalCalls === 1) {
          return jsonResponse({ detail: 'Journal entries are unavailable.' }, 503)
        }
        return jsonResponse(JOURNAL_PAGE)
      }
      if (url.endsWith('/api/summaries/') && method === 'GET') {
        summaryCalls += 1
        if (summaryCalls === 1) {
          return jsonResponse({ detail: 'Summaries are unavailable.' }, 503)
        }
        return jsonResponse(SUMMARIES)
      }
      return jsonResponse({ detail: 'Not found' }, 404)
    })
    renderPage()

    await screen.findByText('Original photo')
    expect(await screen.findByText(/Journal entries are unavailable\./)).toBeTruthy()
    expect(await screen.findByText(/Summaries are unavailable\./)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() =>
      expect((screen.getByLabelText('Journal entry') as HTMLSelectElement).disabled).toBe(
        false,
      ),
    )
    await waitFor(() =>
      expect((screen.getByLabelText('Summary') as HTMLSelectElement).disabled).toBe(
        false,
      ),
    )
    expect(journalCalls).toBe(2)
    expect(summaryCalls).toBe(2)
  })

  it('shows empty states when the user has no journal entries or summaries', async () => {
    installFetch(
      baseHandler({
        journalPage: { count: 0, next: null, previous: null, results: [] },
        summaries: [],
      }),
    )
    renderPage()

    await screen.findByText('Original photo')

    expect(await screen.findByText('No journal entries yet')).toBeTruthy()
    expect(screen.getByText('No summaries yet')).toBeTruthy()
    expect((screen.getByLabelText('Journal entry') as HTMLSelectElement).disabled).toBe(
      true,
    )
    expect((screen.getByLabelText('Summary') as HTMLSelectElement).disabled).toBe(true)
  })

  it('shows prompt guidance and examples without promising real-person likenesses', async () => {
    installFetch(baseHandler())
    renderPage()

    await screen.findByText('Original photo')

    expect(
      screen.getByText(/cannot faithfully recreate a real person’s likeness/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/do not include names or private details/i),
    ).toBeTruthy()
    expect(screen.getByPlaceholderText(/quiet lake at dawn/i)).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: /Use prompt example/i }).length,
    ).toBeGreaterThan(0)
  })

  it('persistently discloses that a stored AI image is not an original photograph', async () => {
    installFetch(baseHandler())
    renderPage()

    await screen.findByText('AI illustration')
    fireEvent.click(
      screen.getByRole('button', { name: 'View AI illustration 12 details' }),
    )
    const aiDialog = await screen.findByRole('dialog')
    expect(within(aiDialog).getByText('AI-generated image')).toBeTruthy()
    expect(
      within(aiDialog).getByText(/not an original photograph/i),
    ).toBeTruthy()

    fireEvent.click(within(aiDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(
      screen.getByRole('button', { name: 'View Original photo 11 details' }),
    )
    const originalDialog = await screen.findByRole('dialog')
    expect(within(originalDialog).queryByText('AI-generated image')).toBeNull()
    expect(
      within(originalDialog).queryByText(/not an original photograph/i),
    ).toBeNull()
  })

  it('shows real journal and summary provenance in the detail dialog', async () => {
    installFetch(baseHandler())
    renderPage()

    await screen.findByText('AI illustration')
    fireEvent.click(
      screen.getByRole('button', { name: 'View AI illustration 12 details' }),
    )
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('link', { name: 'Rainy afternoon' })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Summary #3' })).toBeTruthy()
    expect(within(dialog).getByText('comfyui · sd15.safetensors')).toBeTruthy()
  })

  it('does not generate on load and requires explicit consent', async () => {
    let attempts = 0
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        attempts += 1
        return jsonResponse({ ...GENERATED, id: 51 }, 201)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    const generateButton = screen.getByRole('button', {
      name: 'Generate illustration',
    }) as HTMLButtonElement
    expect(generateButton.disabled).toBe(true)
    expect(attempts).toBe(0)

    giveGenerationConsent()

    expect(generateButton.disabled).toBe(false)
    expect(attempts).toBe(0)
  })

  it('sends only one request when Generate is clicked twice', async () => {
    let attempts = 0
    let resolveGenerate!: (response: Response) => void
    const pendingGeneration = new Promise<Response>((resolve) => {
      resolveGenerate = resolve
    })
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        attempts += 1
        return pendingGeneration
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')
    fireEvent.change(screen.getByLabelText(/Prompt/), {
      target: { value: 'A quiet lake at dawn' },
    })
    giveGenerationConsent()

    const generateButton = screen.getByRole('button', {
      name: 'Generate illustration',
    })
    fireEvent.click(generateButton)
    fireEvent.click(generateButton)

    await waitFor(() => expect(attempts).toBe(1))
    expect((generateButton as HTMLButtonElement).disabled).toBe(true)

    resolveGenerate(jsonResponse({ ...GENERATED, id: 52 }, 201))

    expect(await screen.findByText('AI-generated illustration')).toBeTruthy()
    expect(attempts).toBe(1)
  })

  it('rejects an over-limit prompt before calling the generation API', async () => {
    let attempts = 0
    installFetch((url, init) => {
      if (url.endsWith('/api/media/generate/') && init?.method === 'POST') {
        attempts += 1
        return jsonResponse(GENERATED, 201)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')
    fireEvent.change(screen.getByLabelText(/Prompt/), {
      target: { value: 'x'.repeat(MAX_PROMPT_LENGTH + 1) },
    })
    giveGenerationConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Generate illustration' }))

    expect(
      await screen.findByText(
        `Keep the prompt to ${MAX_PROMPT_LENGTH} characters or fewer.`,
      ),
    ).toBeTruthy()
    expect(attempts).toBe(0)
  })

  it('confirms before deleting and removes the card after 204', async () => {
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith('/api/media/11/') && init?.method === 'DELETE') {
        return fakeResponse(204)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('Original photo')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Original photo 11' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete image' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByText('Original photo')).toBeNull()

    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/media/11/') && init?.method === 'DELETE',
    )
    expect(deleteCall).toBeTruthy()
  })

  it('updates only the prompt through PATCH in the detail dialog', async () => {
    const updated: MediaItem = {
      ...GENERATED,
      prompt: 'Updated prompt',
      updated_at: '2026-10-24T13:00:00Z',
    }
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith('/api/media/12/') && init?.method === 'PATCH') {
        return jsonResponse(updated)
      }
      return baseHandler()(url, init)
    })
    renderPage()

    await screen.findByText('AI illustration')

    fireEvent.click(
      screen.getByRole('button', { name: 'View AI illustration 12 details' }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit prompt' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: /prompt/i }), {
      target: { value: 'Updated prompt' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByText('Prompt updated')).toBeTruthy()

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    const body = JSON.parse(String(patchCall?.[1]?.body))
    expect(body).toEqual({ prompt: 'Updated prompt' })
  })

  it('shows the empty gallery state', async () => {
    installFetch(baseHandler({ media: [] }))
    renderPage()

    expect(await screen.findByText('Your gallery is empty')).toBeTruthy()
  })

  it('shows a fallback when an image cannot load', async () => {
    installFetch(baseHandler({ media: [ORIGINAL] }))
    renderPage()

    const image = await screen.findByAltText('Original photo 11')
    fireEvent.error(image)

    expect(screen.getByText('Image unavailable')).toBeTruthy()
  })
})
