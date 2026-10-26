import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse } from '../../../test/fakeResponse'
import type { BookPreferences } from '../../../types/bookPreferences'
import {
  BOOK_COVER_STYLES,
  BOOK_FONT_STYLES,
  BOOK_THEMES,
  DEFAULT_BOOK_PREFERENCES,
} from '../bookThemes'
import { BookCustomizationDialog } from './BookCustomizationDialog'

const SAVED_PREFERENCES: BookPreferences = {
  cover_style: 'night',
  theme_id: 'ocean',
  font_style: 'modern',
}

interface FetchCall {
  url: string
  init: RequestInit
}

function installFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
) {
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

interface RenderOptions {
  preferences?: BookPreferences
  onClose?: () => void
  onSaved?: (preferences: BookPreferences) => void
}

function renderDialog({
  preferences = DEFAULT_BOOK_PREFERENCES,
  onClose = vi.fn(),
  onSaved = vi.fn(),
}: RenderOptions = {}) {
  render(
    <BookCustomizationDialog
      preferences={preferences}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  return {
    dialog: screen.getByRole('dialog', { name: 'Personnaliser mon livre' }),
    onClose,
    onSaved,
  }
}

beforeEach(() => {
  // The shared client reads the CSRF cookie before sending unsafe methods.
  document.cookie = 'csrftoken=test-token'
})

describe('BookCustomizationDialog', () => {
  it('shows every cover, theme, and typography with the saved selection', () => {
    renderDialog({ preferences: SAVED_PREFERENCES })

    const covers = screen.getByRole('group', {
      name: 'Choisir ma couverture',
    })
    const themes = screen.getByRole('group', { name: 'Choisir mon thème' })
    const fonts = screen.getByRole('group', {
      name: 'Choisir ma typographie',
    })

    for (const cover of BOOK_COVER_STYLES) {
      expect(within(covers).getByRole('radio', { name: cover.label })).toBeTruthy()
    }
    for (const theme of BOOK_THEMES) {
      expect(within(themes).getByRole('radio', { name: theme.label })).toBeTruthy()
    }
    for (const font of BOOK_FONT_STYLES) {
      expect(within(fonts).getByRole('radio', { name: font.label })).toBeTruthy()
    }

    expect(
      (
        within(covers).getByRole('radio', {
          name: 'Nuit étoilée',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(
      (within(themes).getByRole('radio', { name: 'Océan' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(
      (
        within(fonts).getByRole('radio', {
          name: 'Contemporain',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)

    const preview = screen.getByRole('img', { name: /Aperçu/ })
    expect(preview.classList.contains('book-cover-style--night')).toBe(true)
    expect(preview.classList.contains('book-theme--ocean')).toBe(true)
    expect(preview.classList.contains('book-font--modern')).toBe(true)
  })

  it('updates the preview as soon as a choice changes', () => {
    renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Voyage' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Nuit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Manuscrit' }))

    const preview = screen.getByRole('img', {
      name: /couverture Voyage, thème Nuit, typographie Manuscrit/i,
    })
    expect(preview.classList.contains('book-cover-style--travel')).toBe(true)
    expect(preview.classList.contains('book-theme--night')).toBe(true)
    expect(preview.classList.contains('book-font--handwritten')).toBe(true)
  })

  it('saves the selected identifiers and reports the stored result', async () => {
    const fetchMock = installFetch(({ init }) =>
      jsonResponse(JSON.parse(String(init.body))),
    )
    const { onSaved } = renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Souvenirs' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Rose poudré' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Contemporain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith({
      cover_style: 'memories',
      theme_id: 'blush',
      font_style: 'modern',
    })

    const call = callsOf(fetchMock).find(
      (item) => item.init.method === 'PUT',
    )
    expect(call?.url).toMatch(/\/api\/summaries\/book-preferences\/$/)
    expect(JSON.parse(String(call?.init.body))).toEqual({
      cover_style: 'memories',
      theme_id: 'blush',
      font_style: 'modern',
    })
  })

  it('closes without saving when cancelled', () => {
    const fetchMock = installFetch(() => jsonResponse(SAVED_PREFERENCES))
    const { onClose, onSaved } = renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Nuit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(callsOf(fetchMock).some((call) => call.init.method === 'PUT')).toBe(
      false,
    )
  })

  it('restores the default draft without persisting it', () => {
    const fetchMock = installFetch(() => jsonResponse(SAVED_PREFERENCES))
    renderDialog({ preferences: SAVED_PREFERENCES })

    const covers = screen.getByRole('group', {
      name: 'Choisir ma couverture',
    })
    const themes = screen.getByRole('group', { name: 'Choisir mon thème' })
    const fonts = screen.getByRole('group', {
      name: 'Choisir ma typographie',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Rétablir les valeurs par défaut' }),
    )

    expect(
      (within(covers).getByRole('radio', { name: 'Classique' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(
      (
        within(themes).getByRole('radio', {
          name: 'Papier classique',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(
      (within(fonts).getByRole('radio', { name: 'Éditorial' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(
      screen.getByRole('img', {
        name: /couverture Classique, thème Papier classique, typographie Éditorial/i,
      }),
    ).toBeTruthy()
    expect(callsOf(fetchMock).some((call) => call.init.method === 'PUT')).toBe(
      false,
    )
  })

  it('keeps the draft and reports the API error when saving fails', async () => {
    installFetch(() =>
      jsonResponse(
        { detail: 'La personnalisation est indisponible pour le moment.' },
        503,
      ),
    )
    const { onSaved } = renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Océan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText(
        'La personnalisation est indisponible pour le moment.',
      ),
    ).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(
      (screen.getByRole('radio', { name: 'Océan' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
