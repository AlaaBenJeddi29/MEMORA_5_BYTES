import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeResponse, jsonResponse } from '../../test/fakeResponse'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const USER = {
  id: 1,
  username: 'ada',
  email: 'ada@example.com',
  first_name: '',
  last_name: '',
  date_joined: '2024-01-01T00:00:00Z',
}

function Harness() {
  const { status, user, logout } = useAuth()
  const [error, setError] = useState('')

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="error">{error}</span>
      <button
        type="button"
        onClick={() => {
          setError('')
          void logout().catch(() => setError('failed'))
        }}
      >
        Log out
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  )
}

afterEach(() => {
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('AuthProvider', () => {
  it('loads the current user on startup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/accounts/csrf/')) {
          return jsonResponse({ detail: 'CSRF cookie set.' })
        }
        if (String(url).endsWith('/api/accounts/me/')) {
          return jsonResponse(USER)
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    renderProvider()

    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('user').textContent).toBe('ada')
  })

  it('treats a failing /me/ as signed out without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/accounts/csrf/')) {
          return jsonResponse({ detail: 'CSRF cookie set.' })
        }
        return jsonResponse({ detail: 'Authentication credentials were not provided.' }, 403)
      }),
    )

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('clears state when logout succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.endsWith('/api/accounts/csrf/')) {
          return jsonResponse({ detail: 'CSRF cookie set.' })
        }
        if (target.endsWith('/api/accounts/me/')) {
          return jsonResponse(USER)
        }
        if (target.endsWith('/api/accounts/logout/')) {
          return fakeResponse(204)
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('keeps the session and reports failure when logout cannot complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.endsWith('/api/accounts/csrf/')) {
          return jsonResponse({ detail: 'CSRF cookie set.' })
        }
        if (target.endsWith('/api/accounts/me/')) {
          return jsonResponse(USER)
        }
        if (target.endsWith('/api/accounts/logout/')) {
          return jsonResponse({ detail: 'Server error.' }, 500)
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('failed'))
    expect(screen.getByTestId('status').textContent).toBe('authenticated')
    expect(screen.getByTestId('user').textContent).toBe('ada')
  })

  it('treats logout as done when the session is already gone', async () => {
    let signedIn = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.endsWith('/api/accounts/csrf/')) {
          return jsonResponse({ detail: 'CSRF cookie set.' })
        }
        if (target.endsWith('/api/accounts/me/')) {
          return signedIn
            ? jsonResponse(USER)
            : jsonResponse({ detail: 'Authentication credentials were not provided.' }, 403)
        }
        if (target.endsWith('/api/accounts/logout/')) {
          signedIn = false
          return jsonResponse({ detail: 'Forbidden.' }, 403)
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(screen.getByTestId('error').textContent).toBe('')
  })
})
