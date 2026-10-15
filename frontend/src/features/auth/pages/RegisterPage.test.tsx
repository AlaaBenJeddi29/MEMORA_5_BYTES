import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import { AuthProvider } from '../AuthProvider'
import { RegisterPage } from './RegisterPage'

function renderRegister() {
  return render(
    <MemoryRouter
      initialEntries={['/register']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RegisterPage', () => {
  it('reports a password mismatch without calling the register endpoint', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/accounts/csrf/')) {
        return jsonResponse({ detail: 'CSRF cookie set.' })
      }
      return jsonResponse({ detail: 'Authentication credentials were not provided.' }, 403)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRegister()

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ada' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 's3cret-pass' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/accounts/register/')),
    ).toBe(false)
  })
})
