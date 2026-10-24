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

  // Parse page number from next/previous URLs if available
  const currentPage = new URLSearchParams(page.next ? page.next.split('?')[1] || '' : page.previous ? page.previous.split('?')[1] || '' : '').get('page')
  const pageNum = currentPage ? parseInt(currentPage, 10) : 1

  return (
    <div className="journal-entry-list">
      <div className="entry-cards">
        {page.results.map((entry) => (
          <div key={entry.id} className="entry-card">
            <div className="entry-header">
              <h3 className="entry-title">{entry.title}</h3>
              <time className="entry-date" dateTime={entry.created_at}>
                {new Date(entry.created_at).toLocaleDateString()}
              </time>
            </div>
            <p className="entry-preview">{entry.text.substring(0, 200)}...</p>
            {entry.sentiment && <p className="entry-sentiment">Sentiment: {entry.sentiment}</p>}
            <div className="entry-actions">
              <Button
                onClick={() => onEdit(entry)}
                disabled={isLoading}
                variant="secondary"
                size="sm"
              >
                Edit
              </Button>
              <Button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this entry?')) {
                    onDelete(entry.id)
                  }
                }}
                disabled={isLoading}
                variant="secondary"
                size="sm"
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      <div className="pagination">
        <Button
          onClick={() => onPageChange(pageNum - 1)}
          disabled={!page.previous || isLoading}
          variant="secondary"
        >
          Previous
        </Button>
        <span className="pagination-info">
          Page {pageNum} of {Math.ceil(page.count / 10)}
        </span>
        <Button
          onClick={() => onPageChange(pageNum + 1)}
          disabled={!page.next || isLoading}
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
