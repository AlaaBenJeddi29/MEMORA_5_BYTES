import { useCallback, useState } from 'react'
import { Alert } from '../../../components/Alert'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { advancedSearchApi } from '../../../services/advancedSearch'
import { normalizeApiError } from '../../../services/errors'
import type { JournalEntry } from '../../../types/journal'
import { AdvancedSearchForm } from '../components/AdvancedSearchForm'
import { AdvancedSearchResults } from '../components/AdvancedSearchResults'
import { JournalEntryForm } from '../components/JournalEntryForm'
import '../journal.css'
import { journalApi } from '../../../services/journal'

export function AdvancedSearchPage() {
  useDocumentTitle('Advanced Search · Journal · MEMORA')

  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [showForm, setShowForm] = useState(false)

  const handleSearch = useCallback(async (params: any) => {
    setLoading(true)
    setError(null)

    try {
      const response = await advancedSearchApi.search(params)
      setResults(response)
    } catch (err) {
      const normalized = normalizeApiError(err)
      setError(normalized.detail || 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setShowForm(true)
  }

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await journalApi.remove(id)
        // Refresh results
        if (results) {
          setResults({
            ...results,
            results: results.results.filter((e: any) => e.id !== id),
            total: results.total - 1,
          })
        }
      } catch (err) {
        const normalized = normalizeApiError(err)
        setError(normalized.detail || 'Failed to delete entry')
      }
    },
    [results]
  )

  const handleSave = useCallback(() => {
    setShowForm(false)
    setEditingEntry(null)
  }, [])

  return (
    <div className="journal-page">
      <PageHeader
        title="Advanced Search"
        description="Find your memories with AI-powered semantic search"
      />

      {error && (
        <Alert variant="error" title="Error">
          {error}
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-6)' }}>
        {/* Search Form */}
        <div style={{ background: 'var(--surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <AdvancedSearchForm onSearch={handleSearch} isLoading={loading} />
        </div>

        {/* Results */}
        <div>
          <AdvancedSearchResults
            results={results}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={loading}
          />
        </div>
      </div>

      {/* Edit Form Modal */}
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
    </div>
  )
}
