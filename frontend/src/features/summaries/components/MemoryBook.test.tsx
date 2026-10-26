import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installSpeechMock, resetUtterances } from '../../../test/speechMock'
import type { Summary } from '../../../types/summaries'
import {
  formatMemoryDate,
  formatMemoryDateRange,
  MEMORY_BOOK_WIDE_QUERY,
} from '../memoryBook'
import { stopSpeech } from '../speech'
import { MemoryBook } from './MemoryBook'

afterEach(() => {
  act(() => {
    stopSpeech()
  })
  resetUtterances()
})

function summaryOf(overrides: Partial<Summary>): Summary {
  return {
    id: 1,
    owner: 1,
    journal_entry_id: 1,
    summary_text: 'A default memory.',
    mood: '',
    themes: [],
    illustration_prompt: '',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  }
}

const FIRST = summaryOf({
  id: 1,
  summary_text: 'A calm morning walk through the park.',
  mood: 'calm',
  themes: ['nature', 'rest'],
  created_at: '2026-01-10T08:00:00Z',
})

const SECOND = summaryOf({
  id: 2,
  summary_text: 'A proud evening with family.',
  mood: 'proud',
  themes: ['family'],
  created_at: '2026-02-14T19:30:00Z',
})

const THIRD = summaryOf({
  id: 3,
  summary_text: 'A hopeful start to spring.',
  created_at: '2026-03-02T09:15:00Z',
})

type MediaListener = (event: MediaQueryListEvent) => void

/** Minimal matchMedia stand-in that can broadcast a viewport change. */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<MediaListener>()
  const mediaQueryList = {
    matches: initialMatches,
    media: MEMORY_BOOK_WIDE_QUERY,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: MediaListener) => {
      listeners.delete(listener)
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQueryList))

  return {
    setMatches(next: boolean) {
      mediaQueryList.matches = next
      act(() => {
        listeners.forEach((listener) =>
          listener({ matches: next } as MediaQueryListEvent),
        )
      })
    },
  }
}

function openBook() {
  fireEvent.click(screen.getByRole('button', { name: 'Open my book' }))
}

describe('MemoryBook', () => {
  it('shows a cover with branding, memory count, period, and contents', () => {
    render(<MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />)

    expect(screen.getByText('MEMORA')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'My Story' })).toBeTruthy()
    expect(screen.getByText('A personal book of memories')).toBeTruthy()
    expect(screen.getByText('2 memories')).toBeTruthy()
    const range = formatMemoryDateRange([FIRST, SECOND])
    expect(range).toBeTruthy()
    expect(screen.getByText(range!)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open my book' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to summaries' })).toBeTruthy()
    expect(screen.getByText('Contents')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Page 1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Page 2/ })).toBeTruthy()
  })

  it('keeps the cover and hides the open action when there are no memories', () => {
    render(<MemoryBook summaries={[]} onClose={vi.fn()} />)

    expect(screen.getByText('Your book is waiting.')).toBeTruthy()
    expect(
      screen.getByText(
        'No memories yet. Create or generate a summary to begin your story.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open my book' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to summaries' })).toBeTruthy()
  })

  it('opens the first page with its date, text, mood, and themes', () => {
    const { container } = render(
      <MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />,
    )

    openBook()

    expect(screen.getByRole('heading', { name: 'My Story' })).toBeTruthy()
    expect(screen.getByText(FIRST.summary_text)).toBeTruthy()
    expect(container.querySelector('.memory-book__mood')?.textContent).toContain(
      'calm',
    )
    expect(screen.getByText('nature')).toBeTruthy()
    expect(screen.getByText('rest')).toBeTruthy()
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()

    const time = container.querySelector('time')
    expect(time?.getAttribute('datetime')).toBe(FIRST.created_at)
    expect(time?.textContent).toBe(formatMemoryDate(FIRST.created_at))

    expect(screen.getByRole('button', { name: 'Back to cover' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close book' })).toBeTruthy()
  })

  it('hides mood and themes on pages that do not have them', () => {
    const plain = summaryOf({ id: 10, summary_text: 'A plain memory.' })
    const { container } = render(
      <MemoryBook summaries={[plain, FIRST]} onClose={vi.fn()} />,
    )

    openBook()

    expect(screen.getByText('A plain memory.')).toBeTruthy()
    expect(container.querySelector('.memory-book__mood')).toBeNull()
    expect(container.querySelector('.memory-book__themes')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(container.querySelector('.memory-book__mood')?.textContent).toContain(
      'calm',
    )
    expect(container.querySelectorAll('.memory-book__theme')).toHaveLength(2)
  })

  it('turns pages one at a time with disabled boundaries and a page count', () => {
    render(<MemoryBook summaries={[FIRST, SECOND, THIRD]} onClose={vi.fn()} />)

    openBook()

    const previous = screen.getByRole('button', {
      name: 'Previous page',
    }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement

    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    expect(previous.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    fireEvent.click(next)
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.getByText(SECOND.summary_text)).toBeTruthy()
    expect(previous.disabled).toBe(false)
    expect(next.disabled).toBe(false)

    fireEvent.click(next)
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(screen.getByText(THIRD.summary_text)).toBeTruthy()
    expect(next.disabled).toBe(true)

    fireEvent.click(previous)
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.getByText(SECOND.summary_text)).toBeTruthy()
  })

  it('orders memories chronologically without mutating the shared array', () => {
    const middle = summaryOf({
      id: 5,
      summary_text: 'Middle memory.',
      created_at: '2026-02-01T10:00:00Z',
    })
    const latest = summaryOf({
      id: 9,
      summary_text: 'Latest memory.',
      created_at: '2026-03-01T10:00:00Z',
    })
    const earliest = summaryOf({
      id: 7,
      summary_text: 'Earliest memory.',
      created_at: '2026-01-01T10:00:00Z',
    })
    const shared = [middle, latest, earliest]

    render(<MemoryBook summaries={shared} onClose={vi.fn()} />)
    openBook()

    expect(screen.getByText('Earliest memory.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Middle memory.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Latest memory.')).toBeTruthy()

    expect(shared.map((summary) => summary.id)).toEqual([5, 9, 7])
  })

  it('breaks date ties with the summary ID', () => {
    const sameDateHigherId = summaryOf({
      id: 8,
      summary_text: 'Higher id memory.',
      created_at: '2026-05-01T10:00:00Z',
    })
    const sameDateLowerId = summaryOf({
      id: 4,
      summary_text: 'Lower id memory.',
      created_at: '2026-05-01T10:00:00Z',
    })

    render(
      <MemoryBook summaries={[sameDateHigherId, sameDateLowerId]} onClose={vi.fn()} />,
    )
    openBook()

    expect(screen.getByText('Lower id memory.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Higher id memory.')).toBeTruthy()
  })

  it('jumps directly to a page from the cover contents', () => {
    render(<MemoryBook summaries={[FIRST, SECOND, THIRD]} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Page 3/ }))

    expect(screen.getByText(THIRD.summary_text)).toBeTruthy()
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open my book' })).toBeNull()
  })

  it('opens at a requested memory when given its ID', () => {
    render(
      <MemoryBook
        summaries={[FIRST, SECOND, THIRD]}
        initialSummaryId={SECOND.id}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(SECOND.summary_text)).toBeTruthy()
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open my book' })).toBeNull()
  })

  it('returns to the cover and can reopen the book', () => {
    render(<MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />)

    openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Back to cover' }))

    expect(screen.getByText('2 memories')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open my book' })).toBeTruthy()

    openBook()
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })

  it('closes from the cover and from the pages', () => {
    const onClose = vi.fn()
    const { unmount } = render(<MemoryBook summaries={[FIRST]} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Back to summaries' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()

    render(<MemoryBook summaries={[FIRST]} onClose={onClose} />)
    openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Close book' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a breadcrumb back to reflections on the cover and on the pages', () => {
    const onClose = vi.fn()
    render(<MemoryBook summaries={[FIRST, SECOND]} onClose={onClose} />)

    const coverCrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(coverCrumb).getByText('My Story').getAttribute('aria-current'),
    ).toBe('page')

    fireEvent.click(
      within(coverCrumb).getByRole('button', { name: 'Reflections' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)

    openBook()

    const pageCrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(pageCrumb).getByText('My Story').getAttribute('aria-current')).toBe(
      'page',
    )

    fireEvent.click(
      within(pageCrumb).getByRole('button', { name: 'Reflections' }),
    )
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('stops the current reading when the page changes', () => {
    const speech = installSpeechMock()

    render(<MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />)
    openBook()

    fireEvent.click(screen.getByRole('button', { name: 'Écouter ce souvenir' }))
    expect(
      screen.getByRole('button', { name: 'Mettre en pause' }),
    ).toBeTruthy()
    const cancelCalls = speech.synth.cancel.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(screen.getByText(SECOND.summary_text)).toBeTruthy()
    expect(speech.synth.cancel.mock.calls.length).toBe(cancelCalls + 1)
    expect(
      screen.getByRole('button', { name: 'Écouter ce souvenir' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).toBeNull()
  })

  it('turns pages with the arrow keys', () => {
    render(<MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />)

    openBook()
    const book = screen.getByRole('region', { name: 'Memory book' })

    fireEvent.keyDown(book, { key: 'ArrowRight' })
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()

    fireEvent.keyDown(book, { key: 'ArrowRight' })
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()

    fireEvent.keyDown(book, { key: 'ArrowLeft' })
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })

  it('turns pages with a horizontal swipe', () => {
    const { container } = render(
      <MemoryBook summaries={[FIRST, SECOND]} onClose={vi.fn()} />,
    )

    openBook()
    const spread = container.querySelector('.memory-book__spread')
    expect(spread).toBeTruthy()

    fireEvent.touchStart(spread!, {
      touches: [{ clientX: 280, clientY: 120 }],
    })
    fireEvent.touchEnd(spread!, {
      changedTouches: [{ clientX: 140, clientY: 126 }],
    })

    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
  })

  it('shows a two-page spread on wide screens and adapts on resize', () => {
    const media = installMatchMedia(true)
    const { container } = render(
      <MemoryBook summaries={[FIRST, SECOND, THIRD]} onClose={vi.fn()} />,
    )

    openBook()

    expect(screen.getByText('Pages 1–2 of 3')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText(FIRST.summary_text)).toBeTruthy()
    expect(screen.getByText(SECOND.summary_text)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText(THIRD.summary_text)).toBeTruthy()
    expect(container.querySelectorAll('.memory-book__page')).toHaveLength(2)
    expect(
      (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    media.setMatches(false)

    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('applies the saved customization and exposes the customization action', () => {
    const onCustomize = vi.fn()
    render(
      <MemoryBook
        summaries={[FIRST, SECOND]}
        onClose={vi.fn()}
        preferences={{
          cover_style: 'nature',
          theme_id: 'night',
          font_style: 'handwritten',
        }}
        onCustomize={onCustomize}
      />,
    )

    const book = screen.getByRole('region', { name: 'Memory book' })
    expect(book.classList.contains('book-theme--night')).toBe(true)
    expect(book.classList.contains('book-font--handwritten')).toBe(true)
    expect(book.classList.contains('book-cover-style--nature')).toBe(true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Personnaliser mon livre' }),
    )
    expect(onCustomize).toHaveBeenCalledTimes(1)
  })

  it('keeps the customization action available on an open page', () => {
    const onCustomize = vi.fn()
    render(
      <MemoryBook
        summaries={[FIRST]}
        onClose={vi.fn()}
        onCustomize={onCustomize}
      />,
    )

    openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser' }))

    expect(onCustomize).toHaveBeenCalledTimes(1)
  })

  it('stays on the default theme when no preferences are provided', () => {
    render(<MemoryBook summaries={[FIRST]} onClose={vi.fn()} />)

    const book = screen.getByRole('region', { name: 'Memory book' })
    expect(book.classList.contains('book-theme--paper')).toBe(true)
    expect(book.classList.contains('book-font--editorial')).toBe(true)
    expect(book.classList.contains('book-cover-style--classic')).toBe(true)
    expect(
      screen.queryByRole('button', { name: 'Personnaliser mon livre' }),
    ).toBeNull()
  })
})
