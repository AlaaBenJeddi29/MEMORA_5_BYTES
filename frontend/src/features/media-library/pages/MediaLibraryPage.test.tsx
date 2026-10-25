import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeResponse, jsonResponse } from '../../../test/fakeResponse'
import type { MediaItem, MockJournalEntry } from '../../../types/media'
import { MAX_PROMPT_LENGTH } from '../mediaHelpers'
import { MediaLibraryPage } from './MediaLibraryPage'

const ORIGINAL: MediaItem = {
  id: 11,
  file: 'http://testserver/media/users/1/2026/10/original.png',
  media_type: 'original',
  prompt: '',
  status: 'succeeded',
  journal_entry_id: null,
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
  created_at: '2026-10-21T11:30:00Z',
  updated_at: '2026-10-21T11:30:00Z',
}

const MOCK_ENTRIES: MockJournalEntry[] = [
  {
    id: 1,
    title: 'Morning by the lake',
    content: 'Woke before sunrise and walked down to the lake.',
    created_at: '2026-09-12T07:15:00Z',
  },
  {
    id: 2,
    title: 'Rainy afternoon',
    content: 'Spent the afternoon reading by the window.',
    created_at: '2026-09-15T15:40:00Z',
  },
]

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

function installFetch(handler: FetchHandler) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => handler(String(input), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function baseHandler(media: MediaItem[] = [ORIGINAL, GENERATED]): FetchHandler {
  return (url, init) => {
    if (url.endsWith('/api/media/') && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(media)
    }
    if (url.endsWith('/api/media/mock-journal-entries/')) {
      return jsonResponse(MOCK_ENTRIES)
    }
    return jsonResponse({ detail: 'Not found' }, 404)
  }
}

function renderPage() {
  return render(<MediaLibraryPage />)
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

  it('sends only the selected sample-memory ID to the generation API', async () => {
    const generated: MediaItem = {
      ...GENERATED,
      id: 31,
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

    const select = (await screen.findByLabelText('Sample memory')) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(screen.getByText(/never sends the body text/i)).toBeTruthy()
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
    expect(body).not.toHaveProperty('content')
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
    installFetch(baseHandler([]))
    renderPage()

    expect(await screen.findByText('Your gallery is empty')).toBeTruthy()
  })

  it('shows a fallback when an image cannot load', async () => {
    installFetch(baseHandler([ORIGINAL]))
    renderPage()

    const image = await screen.findByAltText('Original photo 11')
    fireEvent.error(image)

    expect(screen.getByText('Image unavailable')).toBeTruthy()
  })
})
