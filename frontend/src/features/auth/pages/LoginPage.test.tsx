import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import { AuthProvider } from '../AuthProvider'
import { LoginPage } from './LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter
      initialEntries={['/login']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('shows required-field errors and never calls the login endpoint', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/accounts/csrf/')) {
        return jsonResponse({ detail: 'CSRF cookie set.' })
      }
      return jsonResponse({ detail: 'Authentication credentials were not provided.' }, 403)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Username is required.')).toBeTruthy()
    expect(screen.getByText('Password is required.')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/accounts/login/'))).toBe(
      false,
    )
  })
})
