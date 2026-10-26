import { Button } from '../../../components/Button'

export interface MemoryBookNavigationProps {
  currentPage: number
  visiblePages: number
  totalPages: number
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
}

/** Page controls with a live indicator and disabled boundary states. */
export function MemoryBookNavigation({
  currentPage,
  visiblePages,
  totalPages,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: MemoryBookNavigationProps) {
  const label =
    visiblePages > 1
      ? `Pages ${currentPage}–${currentPage + visiblePages - 1} of ${totalPages}`
      : `Page ${currentPage} of ${totalPages}`

  return (
    <nav className="memory-book__nav" aria-label="Book pages">
      <Button
        variant="secondary"
        onClick={onPrevious}
        disabled={!canPrevious}
      >
        Previous page
      </Button>
      <p className="memory-book__page-indicator" role="status" aria-live="polite">
        {label}
      </p>
      <Button variant="secondary" onClick={onNext} disabled={!canNext}>
        Next page
      </Button>
    </nav>
  )
}
