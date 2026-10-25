import { describe, expect, it, vi } from 'vitest'

async function loadApiBaseUrl(): Promise<string> {
  vi.resetModules()
  const { apiBaseUrl } = await import('./env')
  return apiBaseUrl
}

describe('apiBaseUrl', () => {
  it('defaults to same-origin when unset', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined)

    expect(await loadApiBaseUrl()).toBe('')
  })

  it('treats an explicit empty value as same-origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    expect(await loadApiBaseUrl()).toBe('')
  })

  it('strips trailing slashes from a configured value', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/')

    expect(await loadApiBaseUrl()).toBe('https://api.example.com')
  })
})
