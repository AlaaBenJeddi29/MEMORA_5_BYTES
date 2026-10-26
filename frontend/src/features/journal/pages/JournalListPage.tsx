import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { journalApi } from '../../../services/journal'
import { normalizeApiError } from '../../../services/errors'
import type {
  JournalEntry,
  JournalEntryInput,
  JournalPage,
  JournalSearchParams,
  AdvancedSearchParams,
  AdvancedSearchResult,
} from '../../../types/journal'
import { JournalEntryForm } from '../components/JournalEntryForm'
import { JournalEntryList } from '../components/JournalEntryList'
import { JournalSearch } from '../components/JournalSearch'
import { AdvancedSearchAnalysis } from '../components/AdvancedSearchAnalysis'
import '../journal.css'

interface JournalLocationState {
  prefillText?: string
  prefillTitle?: string
}

export function JournalListPage() {
  useDocumentTitle('Journal · MEMORA')

  const location = useLocation()
  const [urlParams, setUrlParams] = useSearchParams()
  const routeState = (location.state ?? null) as JournalLocationState | null

  const [entries, setEntries] = useState<JournalPage | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [showForm, setShowForm] = useState(() => Boolean(routeState?.prefillText))
  const [prefill, setPrefill] = useState<Partial<JournalEntryInput> | null>(() =>
    routeState?.prefillText
      ? { title: routeState.prefillTitle ?? '', text: routeState.prefillText }
      : null,
  )
  const [filters, setFilters] = useState<JournalSearchParams | AdvancedSearchParams>({})
  const [advancedResult, setAdvancedResult] = useState<AdvancedSearchResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [openingEntry, setOpeningEntry] = useState(false)

  const consumedEditRef = useRef<string | null>(null)

  const wantsNew = urlParams.get('new') === '1'
  const editIdParam = urlParams.get('edit')
  const hasActiveFilters = Object.values(filters).some((value) => value !== undefined && value !== false)

  // Load entries on mount and whenever the page, filters or explicit reload change.
  useEffect(() => {
    let active = true

    const loadEntries = async () => {
      setLoading(true)
      setError(null)
      try {
        let result: JournalPage
        if (!hasActiveFilters) {
          setAdvancedResult(null)
          result = await journalApi.list(currentPage)
        } else if ('isAdvanced' in filters && filters.isAdvanced === true) {
          const advanced = await journalApi.advancedSearch(filters as AdvancedSearchParams)
          setAdvancedResult(advanced)
          result = {
            count: advanced.total,
            next: null,
            previous: null,
            results: advanced.results,
          }
        } else {
          setAdvancedResult(null)
          const params = filters as JournalSearchParams
          result = await journalApi.search({ ...params, page: currentPage })
        }
        if (active) setEntries(result)
      } catch (err) {
        if (!active) return
        const normalized = normalizeApiError(err)
        setError(normalized.detail || normalized.formErrors[0] || 'Failed to load entries')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadEntries()
    return () => {
      active = false
    }
  }, [currentPage, filters, hasActiveFilters, reloadKey])

  // Deep link from the dashboard: ?new=1
  useEffect(() => {
    if (!wantsNew) return
    consumedEditRef.current = null
    setEditingEntry(null)
    setPrefill(null)
    setShowForm(true)
    setError(null)
  }, [wantsNew])

  // Deep link from the dashboard: ?edit=ID. Fetches the entry directly so the
  // link works even when the entry is on another page of the list.
  useEffect(() => {
    if (!editIdParam) return
    if (consumedEditRef.current === editIdParam) return

    const id = Number(editIdParam)
    if (!Number.isInteger(id) || id <= 0) {
      setError('That entry link isn’t valid.')
      return
    }

    consumedEditRef.current = editIdParam
    let active = true
    setPrefill(null)
    setOpeningEntry(true)
    setShowForm(true)
    setError(null)

    journalApi
      .get(id)
      .then((entry) => {
        if (active) setEditingEntry(entry)
      })
      .catch((err) => {
        if (!active) return
        const normalized = normalizeApiError(err)
        setError(normalized.detail || normalized.formErrors[0] || 'We couldn’t open that entry.')
        setShowForm(false)
      })
      .finally(() => {
        if (active) setOpeningEntry(false)
      })

    return () => {
      active = false
    }
  }, [editIdParam])

  const closeComposer = useCallback(() => {
    setShowForm(false)
    setEditingEntry(null)
    setPrefill(null)
    consumedEditRef.current = null
    setUrlParams({}, { replace: true })
  }, [setUrlParams])

  const openComposer = useCallback(() => {
    consumedEditRef.current = null
    setEditingEntry(null)
    setPrefill(null)
    setShowForm(true)
    setUrlParams({ new: '1' }, { replace: true })
  }, [setUrlParams])

  const refresh = useCallback(() => {
    setCurrentPage(1)
    setFilters({})
    setReloadKey((key) => key + 1)
  }, [])

  const handleSave = useCallback(() => {
    closeComposer()
    refresh()
  }, [closeComposer, refresh])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await journalApi.remove(id)
        if (editingEntry?.id === id) {
          closeComposer()
        }
        refresh()
      } catch (err) {
        const normalized = normalizeApiError(err)
        setError(normalized.detail || normalized.formErrors[0] || 'Failed to delete entry')
      }
    },
    [closeComposer, editingEntry, refresh],
  )

  const handleSearch = useCallback((params: JournalSearchParams | AdvancedSearchParams) => {
    setFilters(params)
    setCurrentPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters({})
    setCurrentPage(1)
  }, [])

  const handleEdit = (entry: JournalEntry) => {
    consumedEditRef.current = String(entry.id)
    setPrefill(null)
    setEditingEntry(entry)
    setShowForm(true)
    setUrlParams({ edit: String(entry.id) }, { replace: true })
  }

  const formKey = editingEntry ? `entry-${editingEntry.id}` : prefill ? 'prefilled-entry' : 'new-entry'

  return (
    <div className="journal-page">
      <PageHeader
        eyebrow="Written memories"
        title="Journal"
        description="A quiet page for the days you want to keep — written in your own words, private to your account."
        actions={
          <Button
            onClick={showForm ? closeComposer : openComposer}
            disabled={loading && !showForm}
            aria-expanded={showForm}
            aria-controls="journal-composer"
            variant={showForm ? 'secondary' : 'primary'}
          >
            <Icon name={showForm ? 'close' : 'pen'} size={16} />
            {showForm ? 'Close composer' : 'New entry'}
          </Button>
        }
      />

      {error && (
        <Alert variant="error" title="Something interrupted this page">
          {error}
          <div className="alert__actions">
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              Reload journal
            </Button>
          </div>
        </Alert>
      )}

      <JournalSearch onSearch={handleSearch} isLoading={loading} />

      {advancedResult?.ai_analysis && (
        <AdvancedSearchAnalysis analysis={advancedResult.ai_analysis} />
      )}

      {showForm && (
        <section
          id="journal-composer"
          className="journal-composer"
          aria-label={editingEntry ? 'Edit journal entry' : 'New journal entry'}
        >
          <div className="journal-composer__inner">
            {prefill && !editingEntry && (
              <p className="journal-composer__note">
                <Icon name="mic" size={15} />
                From your latest voice memo — edit it before saving.
              </p>
            )}

            {openingEntry ? (
              <LoadingState label="Opening that entry…" />
            ) : (
              <JournalEntryForm
                key={formKey}
                entry={editingEntry ?? undefined}
                initialValues={prefill ?? undefined}
                onSave={handleSave}
                onCancel={closeComposer}
                onSubmit={async (data) => {
                  if (editingEntry) {
                    return journalApi.update(editingEntry.id, data)
                  }
                  return journalApi.create(data)
                }}
              />
            )}
          </div>
        </section>
      )}

      <JournalEntryList
        page={entries}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={openComposer}
        onClearFilters={handleClearFilters}
        onPageChange={setCurrentPage}
        isLoading={loading}
        hasFilters={hasActiveFilters}
      />
    </div>
  )
}
