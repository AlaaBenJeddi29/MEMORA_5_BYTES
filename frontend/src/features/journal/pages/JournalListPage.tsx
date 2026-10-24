import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { journalApi } from '../../../services/journal'
import { normalizeApiError } from '../../../services/errors'
import type { JournalEntry, JournalPage, JournalSearchParams } from '../../../types/journal'
import { JournalEntryForm } from '../components/JournalEntryForm'
import { JournalEntryList } from '../components/JournalEntryList'
import { JournalSearch } from '../components/JournalSearch'
import '../journal.css'

export function JournalListPage() {
  useDocumentTitle('Journal · MEMORA')

  const [entries, setEntries] = useState<JournalPage | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [searchParams, setSearchParams] = useState<JournalSearchParams>({})

  // Load entries on mount and when filters change
  useEffect(() => {
    const loadEntries = async () => {
      setLoading(true)
      setError(null)
      try {
        let result
        const hasActiveFilters = Object.values(searchParams).some((v) => v !== undefined)
        if (hasActiveFilters) {
          result = await journalApi.search({ ...searchParams, page: currentPage })
        } else {
          result = await journalApi.list(currentPage)
        }
        setEntries(result)
      } catch (err) {
        const normalized = normalizeApiError(err)
        setError(normalized.detail || normalized.formErrors[0] || 'Failed to load entries')
      } finally {
        setLoading(false)
      }
    }

    loadEntries()
  }, [currentPage, searchParams])

  const handleSave = useCallback(() => {
    setShowForm(false)
    setEditingEntry(null)
    // Refresh the list
    setCurrentPage(1)
    setSearchParams({})
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    try {
      await journalApi.remove(id)
      // Refresh the list
      setCurrentPage(1)
      setSearchParams({})
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized.detail || normalized.formErrors[0] || 'Failed to delete entry')
    }
  }, [])

  const handleSearch = useCallback((params: JournalSearchParams) => {
    setSearchParams(params)
    setCurrentPage(1)
  }, [])

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setShowForm(true)
  }

  return (
    <div className="journal-page">
      <PageHeader
        title="Journal"
        description="Write and revisit text entries."
        actions={
          <Button onClick={() => setShowForm(!showForm)} disabled={loading}>
            {showForm ? 'Cancel' : 'New Entry'}
          </Button>
        }
      />

      {error && (
        <Alert variant="error" title="Error">
          {error}
        </Alert>
      )}

      <JournalSearch onSearch={handleSearch} isLoading={loading} />

      {showForm && (
        <div className="form-container">
          <JournalEntryForm
            entry={editingEntry || undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditingEntry(null)
            }}
            onSubmit={async (data) => {
              if (editingEntry) {
                return journalApi.update(editingEntry.id, data)
              }
              return journalApi.create(data)
            }}
          />
        </div>
      )}

      <JournalEntryList
        page={entries}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPageChange={setCurrentPage}
        isLoading={loading}
      />
    </div>
  )
}

