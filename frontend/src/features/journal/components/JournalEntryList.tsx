import type { JournalEntry, JournalPage } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'

export interface JournalEntryListProps {
  page: JournalPage | null
  onEdit: (entry: JournalEntry) => void
  onDelete: (id: number) => void
  onPageChange: (page: number) => void
  isLoading?: boolean
}

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

export function JournalEntryList({
  page,
  onEdit,
  onDelete,
  onPageChange,
  isLoading = false,
}: JournalEntryListProps) {
  if (!page || page.results.length === 0) {
    return (
      <EmptyState
        title="No entries yet"
        description="Write your first journal entry to get started."
      />
    )
  }

  const currentPage = getCurrentPage(page)
  const totalPages = Math.ceil(page.count / 10)

  return (
    <div className="journal-entry-list">
      <div className="entry-cards">
        {page.results.map((entry) => (
          <article key={entry.id} className="entry-card">
            <div className="entry-header">
              <h3 className="entry-title">{entry.title}</h3>
              <time className="entry-date" dateTime={entry.created_at}>
                {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>
            <p className="entry-preview">
              {entry.text.substring(0, 250)}
              {entry.text.length > 250 ? '…' : ''}
            </p>
            {entry.sentiment && (
              <span className="entry-sentiment">
                💭 {entry.sentiment.charAt(0).toUpperCase() + entry.sentiment.slice(1)}
              </span>
            )}
            <div className="entry-actions">
              <Button
                onClick={() => onEdit(entry)}
                disabled={isLoading}
                variant="secondary"
              >
                ✏️ Edit
              </Button>
              <Button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this entry?')) {
                    onDelete(entry.id)
                  }
                }}
                disabled={isLoading}
                variant="secondary"
              >
                🗑️ Delete
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Pagination controls */}
      {(page.next || page.previous) && (
        <div className="pagination">
          <Button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!page.previous || isLoading}
            variant="secondary"
          >
            ← Previous
          </Button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!page.next || isLoading}
            variant="secondary"
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  )
}
