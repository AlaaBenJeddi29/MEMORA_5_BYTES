import { useState } from 'react'

import type { JournalEntry, JournalPage } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'

export interface JournalEntryListProps {
  page: JournalPage | null
  onEdit: (entry: JournalEntry) => void
  onDelete: (id: number) => Promise<void> | void
  onCreate: () => void
  onClearFilters: () => void
  onPageChange: (page: number) => void
  isLoading?: boolean
  hasFilters?: boolean
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { day: '2-digit' })
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' })
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function getCurrentPage(page: JournalPage | null): number {
  if (!page) return 1

  // Try to extract page number from URL
  const url = page.next || page.previous
  if (!url) return 1

  try {
    const urlObj = new URL(url, window.location.origin)
    const pageParam = urlObj.searchParams.get('page')
    if (pageParam) {
      const currentNum = parseInt(pageParam, 10)
      // If we're getting 'next', actual page is one less; if 'previous', add one
      return page.next ? currentNum - 1 : currentNum + 1
    }
  } catch {
    // Ignore URL parsing errors
  }
  return 1
}

function previewOf(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 300 ? `${clean.slice(0, 300).trimEnd()}…` : clean
}

export function JournalEntryList({
  page,
  onEdit,
  onDelete,
  onCreate,
  onClearFilters,
  onPageChange,
  isLoading = false,
  hasFilters = false,
}: JournalEntryListProps) {
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await onDelete(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  if (isLoading && (!page || page.results.length === 0)) {
    return (
      <div className="journal-loading" role="status" aria-live="polite">
        <span className="sr-only">Loading journal entries…</span>
        <div className="journal-skeleton" aria-hidden="true" />
        <div className="journal-skeleton" aria-hidden="true" />
        <div className="journal-skeleton" aria-hidden="true" />
      </div>
    )
  }

  if (!page || page.results.length === 0) {
    return (
      <EmptyState
        icon={hasFilters ? 'search' : 'book'}
        title={hasFilters ? 'No entries match those filters' : 'No entries yet'}
        description={
          hasFilters
            ? 'Try a shorter title, or widen the dates to see more of your writing.'
            : 'Write your first journal entry to get started. A single sentence counts.'
        }
        actions={
          hasFilters ? (
            <Button variant="secondary" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : (
            <Button onClick={onCreate}>
              <Icon name="pen" size={16} />
              Write your first entry
            </Button>
          )
        }
      />
    )
  }

  const currentPage = getCurrentPage(page)
  const totalPages = Math.max(1, Math.ceil(page.count / 10))

  return (
    <div className="journal-entry-list" aria-busy={isLoading}>
      <div className="journal-list__head">
        <div>
          <p className="eyebrow">{hasFilters ? 'Search results' : 'Lately'}</p>
          <h2>Your entries</h2>
        </div>
        <p className="journal-list__count">
          {page.count} {page.count === 1 ? 'entry' : 'entries'}
          {hasFilters ? ' found' : ''}
        </p>
      </div>

      <div className="journal-entries">
        {page.results.map((entry) => {
          const date = new Date(entry.created_at)
          const valid = !Number.isNaN(date.getTime())
          const headingId = `journal-entry-title-${entry.id}`
          const photos = entry.photos?.length ?? 0

          return (
            <article
              key={entry.id}
              className="journal-entry"
              aria-labelledby={headingId}
            >
              <div className="journal-entry__rail" aria-hidden="true">
                <span className="journal-entry__day">
                  {valid ? dayFormatter.format(date) : '—'}
                </span>
                <span className="journal-entry__month">
                  {valid ? monthFormatter.format(date) : ''}
                </span>
              </div>

              <div className="journal-entry__body">
                <div className="journal-entry__meta">
                  <time dateTime={entry.created_at}>
                    {valid ? fullDateFormatter.format(date) : entry.created_at}
                  </time>
                  {entry.sentiment && (
                    <span className="journal-entry__chip">
                      <Icon name="leaf" size={13} />
                      {entry.sentiment}
                    </span>
                  )}
                  {photos > 0 && (
                    <span className="journal-entry__chip">
                      <Icon name="camera" size={13} />
                      {photos} {photos === 1 ? 'photo' : 'photos'}
                    </span>
                  )}
                </div>

                <h3 id={headingId} className="journal-entry__title">
                  {entry.title || 'Untitled entry'}
                </h3>
                <p className="journal-entry__preview">{previewOf(entry.text)}</p>

                <div className="journal-entry__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(entry)}
                    disabled={isLoading}
                    aria-label={`Edit ${entry.title || 'this entry'}`}
                  >
                    <Icon name="edit" size={14} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="journal-entry__delete"
                    onClick={() => setPendingDelete(entry)}
                    disabled={isLoading}
                    aria-label={`Delete ${entry.title || 'this entry'}`}
                  >
                    <Icon name="trash" size={14} />
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {(page.next || page.previous) && (
        <nav className="pagination" aria-label="Journal pages">
          <Button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!page.previous || isLoading}
            variant="secondary"
            size="sm"
            aria-label="Previous page"
          >
            <Icon name="arrowLeft" size={15} />
            Previous
          </Button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!page.next || isLoading}
            variant="secondary"
            size="sm"
            aria-label="Next page"
          >
            Next
            <Icon name="arrowRight" size={15} />
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this entry?"
        message={
          pendingDelete
            ? `“${pendingDelete.title || 'Untitled entry'}” will be permanently deleted. This can’t be undone.`
            : undefined
        }
        confirmLabel="Delete entry"
        cancelLabel="Cancel"
        confirmVariant="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
