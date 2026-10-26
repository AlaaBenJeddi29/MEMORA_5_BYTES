import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, TouchEvent } from 'react'

import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import type { BookPreferences } from '../../../types/bookPreferences'
import type { Summary } from '../../../types/summaries'
import {
  DEFAULT_BOOK_PREFERENCES,
  bookThemeClassName,
} from '../bookThemes'
import { MEMORY_BOOK_WIDE_QUERY, sortMemories } from '../memoryBook'
import { MemoryBookCover } from './MemoryBookCover'
import { MemoryBookNavigation } from './MemoryBookNavigation'
import { MemoryBookPage } from './MemoryBookPage'

export interface MemoryBookProps {
  /** Summaries already loaded by the summaries page. */
  summaries: readonly Summary[]
  /** Leave the book and return to the summaries list. */
  onClose: () => void
  /** When set, open directly on the page containing this summary. */
  initialSummaryId?: number | null
  /** Saved cover, page theme, and typography for this user. */
  preferences?: BookPreferences
  /** Opens the customization dialog; the action is hidden when omitted. */
  onCustomize?: () => void
}

type BookPhase = 'cover' | 'pages'

function alignToSpread(index: number, isWide: boolean): number {
  return isWide ? Math.floor(index / 2) * 2 : index
}

function lastSpreadStart(length: number, isWide: boolean): number {
  if (length === 0) {
    return 0
  }
  return isWide
    ? Math.floor((length - 1) / 2) * 2
    : length - 1
}

/**
 * The memory book. It receives the summaries already loaded by the page, so
 * opening it never triggers another API request. Pages turn one at a time on
 * narrow screens and two at a time on wide screens.
 */
export function MemoryBook({
  summaries,
  onClose,
  initialSummaryId = null,
  preferences = DEFAULT_BOOK_PREFERENCES,
  onCustomize,
}: MemoryBookProps) {
  const sorted = useMemo(() => sortMemories(summaries), [summaries])
  const isWide = useMediaQuery(MEMORY_BOOK_WIDE_QUERY)
  const pageStep = isWide ? 2 : 1

  const initialTarget = useMemo(
    () =>
      initialSummaryId === null
        ? -1
        : sorted.findIndex((summary) => summary.id === initialSummaryId),
    [initialSummaryId, sorted],
  )

  const [phase, setPhase] = useState<BookPhase>(() =>
    initialTarget >= 0 ? 'pages' : 'cover',
  )
  const [index, setIndex] = useState(() =>
    initialTarget >= 0 ? alignToSpread(initialTarget, isWide) : 0,
  )

  const rootRef = useRef<HTMLElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const maxStart = lastSpreadStart(sorted.length, isWide)
  const safeIndex = Math.min(Math.max(index, 0), maxStart)
  const visiblePages = sorted.slice(safeIndex, safeIndex + pageStep)
  const canPrevious = safeIndex > 0
  const canNext = safeIndex < maxStart

  useEffect(() => {
    setIndex((previous) => {
      const aligned = alignToSpread(previous, isWide)
      return Math.min(Math.max(aligned, 0), lastSpreadStart(sorted.length, isWide))
    })
  }, [isWide, sorted.length])

  useEffect(() => {
    rootRef.current?.focus()
  }, [phase])

  function goTo(target: number) {
    setIndex(Math.min(Math.max(target, 0), maxStart))
  }

  function showPrevious() {
    if (canPrevious) {
      goTo(safeIndex - pageStep)
    }
  }

  function showNext() {
    if (canNext) {
      goTo(safeIndex + pageStep)
    }
  }

  function openAt(target: number) {
    setIndex(
      Math.min(Math.max(alignToSpread(target, isWide), 0), maxStart),
    )
    setPhase('pages')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      showPrevious()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      showNext()
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) {
      return
    }

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.4) {
      return
    }

    if (deltaX < 0) {
      showNext()
    } else {
      showPrevious()
    }
  }

  const showCover = phase === 'cover' || sorted.length === 0

  return (
    <section
      ref={rootRef}
      className={`memory-book ${bookThemeClassName(preferences)}`}
      aria-label="Memory book"
      tabIndex={-1}
      onKeyDown={showCover ? undefined : handleKeyDown}
    >
      <nav className="memory-book__breadcrumb" aria-label="Breadcrumb">
        <button
          type="button"
          className="memory-book__crumb-link"
          onClick={onClose}
        >
          Reflections
        </button>
        <Icon name="chevronRight" size={12} />
        <span className="memory-book__crumb-current" aria-current="page">
          My Story
        </span>
      </nav>

      {showCover ? (
        <MemoryBookCover
          summaries={sorted}
          onOpen={() => setPhase('pages')}
          onOpenAt={openAt}
          onClose={onClose}
          onCustomize={onCustomize}
        />
      ) : (
        <>
          <header className="memory-book__topbar">
            <div>
              <p className="memory-book__eyebrow">MEMORA</p>
              <h1 className="memory-book__book-title">My Story</h1>
            </div>
            <div className="memory-book__topbar-actions">
              {onCustomize && (
                <Button variant="secondary" size="sm" onClick={onCustomize}>
                  Personnaliser
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPhase('cover')}
              >
                Back to cover
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close book
              </Button>
            </div>
          </header>

          <div className="memory-book__book">
            <div
              className="memory-book__spread"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {visiblePages.map((summary, offset) => (
                <MemoryBookPage
                  key={summary.id}
                  summary={summary}
                  pageNumber={safeIndex + offset + 1}
                />
              ))}
              {isWide && visiblePages.length === 1 && (
                <div
                  className="memory-book__page memory-book__page--blank"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          <MemoryBookNavigation
            currentPage={safeIndex + 1}
            visiblePages={visiblePages.length}
            totalPages={sorted.length}
            canPrevious={canPrevious}
            canNext={canNext}
            onPrevious={showPrevious}
            onNext={showNext}
          />

          <p className="memory-book__hint">
            Use the buttons or the left and right arrow keys to turn the pages.
          </p>
        </>
      )}
    </section>
  )
}
