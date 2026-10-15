import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiBaseUrl } from '../utils/env'
import { apiRequest } from './apiClient'
import { ApiError } from './errors'
import { fakeResponse, jsonResponse } from '../test/fakeResponse'

function clearCsrfCookie() {
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
}

afterEach(() => {
  clearCsrfCookie()
})

describe('apiRequest', () => {
  it('parses JSON and always sends credentials, with no CSRF header on GET', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    const data = await apiRequest<{ id: number }>('/api/accounts/me/')

    expect(data).toEqual({ id: 7 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${apiBaseUrl}/api/accounts/me/`)
    expect(init?.credentials).toBe('include')
    expect(init?.headers).toMatchObject({ Accept: 'application/json' })
    expect((init?.headers as Record<string, string>)['X-CSRFToken']).toBeUndefined()
  })

  it('echoes an existing csrftoken cookie on unsafe requests without refetching it', async () => {
    document.cookie = 'csrftoken=existing-token'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/accounts/login/', { method: 'POST', body: { username: 'a' } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${apiBaseUrl}/api/accounts/login/`)
    expect((init?.headers as Record<string, string>)['X-CSRFToken']).toBe('existing-token')
  })

  it('fetches the CSRF cookie first when none is readable, then sends the new token', async () => {
    clearCsrfCookie()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/api/accounts/csrf/')) {
        document.cookie = 'csrftoken=handed-out'
        return jsonResponse({ detail: 'CSRF cookie set.' })
      }
      return jsonResponse({ id: 7 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/accounts/logout/', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${apiBaseUrl}/api/accounts/csrf/`)
    const [, logoutInit] = fetchMock.mock.calls[1]
    expect((logoutInit?.headers as Record<string, string>)['X-CSRFToken']).toBe('handed-out')
  })

  it('resolves undefined for 204 responses', async () => {
    document.cookie = 'csrftoken=token'
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(fakeResponse(204)))

    await expect(apiRequest('/api/accounts/logout/', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws an ApiError carrying the status and parsed body', async () => {
    const body = { detail: 'Authentication credentials were not provided.' }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, 403)))

    const error: unknown = await apiRequest('/api/accounts/me/').catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).data).toEqual(body)
  })
})
