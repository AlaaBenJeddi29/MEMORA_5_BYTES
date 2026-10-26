import { useCallback, useEffect, useRef, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { SUMMARY_SEARCH_PAGE_SIZE, summariesApi } from '../../../services/summaries'
import type { BookPreferences } from '../../../types/bookPreferences'
import type { Summary, SummarySearchPage } from '../../../types/summaries'
import { BookCustomizationDialog } from '../components/BookCustomizationDialog'
import { DeleteSummaryDialog } from '../components/DeleteSummaryDialog'
import { GenerateSummaryDialog } from '../components/GenerateSummaryDialog'
import { MemoryBook } from '../components/MemoryBook'
import { SummaryCard } from '../components/SummaryCard'
import { SummaryDetailDialog } from '../components/SummaryDetailDialog'
import { SummaryFormDialog } from '../components/SummaryFormDialog'
import { SummarySearchBar } from '../components/SummarySearchBar'
import { useBookPreferences } from '../useBookPreferences'

type ActiveDialog =
  | { kind: 'detail'; summary: Summary }
  | { kind: 'edit'; summary: Summary }
  | { kind: 'delete'; summary: Summary }
  | { kind: 'create' }
  | { kind: 'generate' }
  | { kind: 'customize' }
  | null

type LoadStatus = 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'
type PageView = 'list' | 'book'

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  return messages.length > 0 ? messages : ['Something went wrong. Please try again.']
}

function searchMessagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [
    ...(errors.detail ? [errors.detail] : []),
    ...errors.formErrors,
    ...(errors.fieldErrors.q ?? []),
  ]
  return [...new Set(messages)]
}

export function SummariesPage() {
  const [view, setView] = useState<PageView>('list')
  const [bookStartId, setBookStartId] = useState<number | null>(null)
  const [returnFocusId, setReturnFocusId] = useState<number | null>(null)
  const restoreFocusRef = useRef(false)

  useDocumentTitle(view === 'book' ? 'My Story · MEMORA' : 'Summaries · MEMORA')

  const {
    preferences,
    status: preferencesStatus,
    apply: applyPreferences,
  } = useBookPreferences()

  const [summaries, setSummaries] = useState<Summary[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [loadErrors, setLoadErrors] = useState<NormalizedErrors | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ActiveDialog>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchData, setSearchData] = useState<SummarySearchPage | null>(null)
  const [searchErrors, setSearchErrors] = useState<NormalizedErrors | null>(null)
  const [searchPage, setSearchPage] = useState(1)

  const searchRequestRef = useRef<{
    controller: AbortController
    id: number
  } | null>(null)
  const searchRequestIdRef = useRef(0)

  const loadSummaries = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') {
      setStatus('loading')
    } else {
      setRefreshing(true)
    }
    setLoadErrors(null)

    try {
      const items = await summariesApi.list()
      setSummaries(items)
      setStatus('ready')
    } catch (error) {
      setLoadErrors(normalizeApiError(error))
      setStatus((current) => (current === 'loading' ? 'error' : current))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadSummaries('initial')
  }, [loadSummaries])

  useEffect(() => {
    return () => {
      searchRequestRef.current?.controller.abort()
    }
  }, [])

  const clearSearch = useCallback(() => {
    searchRequestRef.current?.controller.abort()
    searchRequestRef.current = null
    searchRequestIdRef.current += 1
    setSearchQuery('')
    setActiveSearchQuery('')
    setSearchStatus('idle')
    setSearchData(null)
    setSearchErrors(null)
    setSearchPage(1)
  }, [])

  const runSearch = useCallback(
    async (rawQuery: string, page = 1) => {
      const query = rawQuery.trim()
      if (!query) {
        clearSearch()
        return
      }

      searchRequestRef.current?.controller.abort()
      const controller = new AbortController()
      const requestId = searchRequestIdRef.current + 1
      searchRequestIdRef.current = requestId
      searchRequestRef.current = { controller, id: requestId }

      setActiveSearchQuery(query)
      setSearchPage(page)
      setSearchStatus('loading')
      setSearchErrors(null)

      try {
        const data = await summariesApi.search(
          { q: query, page },
          { signal: controller.signal },
        )
        if (requestId !== searchRequestIdRef.current) {
          return
        }
        setSearchData(data)
        setSearchStatus('ready')
      } catch (error) {
        if (requestId !== searchRequestIdRef.current || controller.signal.aborted) {
          return
        }
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        setSearchErrors(normalizeApiError(error))
        setSearchStatus('error')
      }
    },
    [clearSearch],
  )

  function openDialog(next: ActiveDialog) {
    setNotice(null)
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
  }

  /** Close the dialog, report success, and re-read the list and active search. */
  function completeMutation(message: string) {
    setDialog(null)
    setNotice(message)
    void loadSummaries('refresh')
    if (activeSearchQuery) {
      void runSearch(activeSearchQuery, 1)
    }
  }

  function openBook(startId: number | null) {
    setBookStartId(startId)
    setReturnFocusId(startId)
    setView('book')
  }

  function closeBook() {
    restoreFocusRef.current = true
    setView('list')
  }

  function handlePreferencesSaved(next: BookPreferences) {
    applyPreferences(next)
    setDialog(null)
    setNotice('Personnalisation enregistrée.')
  }

  useEffect(() => {
    if (view !== 'list' || !restoreFocusRef.current) {
      return
    }
    restoreFocusRef.current = false
    const trigger =
      returnFocusId === null
        ? null
        : document.querySelector<HTMLElement>(
            `[data-book-trigger="${returnFocusId}"]`,
          )
    const target = trigger ?? document.getElementById('open-memory-book')
    target?.focus()
  }, [view, returnFocusId])

  const searchActive = activeSearchQuery.length > 0
  const searchResults = searchData?.results ?? []
  const searchCount = searchData?.count ?? 0
  const totalSearchPages = Math.max(
    1,
    Math.ceil(searchCount / SUMMARY_SEARCH_PAGE_SIZE),
  )
  const currentSearchPage = Math.min(searchPage, totalSearchPages)
  const searchErrorMessages = searchMessagesOf(searchErrors)

  if (view === 'book') {
    return (
      <>
        <MemoryBook
          summaries={summaries}
          onClose={closeBook}
          initialSummaryId={bookStartId}
          preferences={preferences}
          onCustomize={() => openDialog({ kind: 'customize' })}
        />
        {dialog?.kind === 'customize' && (
          <BookCustomizationDialog
            preferences={preferences}
            onClose={closeDialog}
            onSaved={handlePreferencesSaved}
          />
        )}
      </>
    )
  }

  return (
    <div className="reflections-page">
      <PageHeader
        eyebrow="AI reflections"
        title="Reflections"
        description="Short recaps written from your own journal entries. Generation runs on your server; writing, editing and deleting here never contact the model."
        actions={
          <>
            <Button
              id="open-memory-book"
              variant="secondary"
              disabled={status !== 'ready' || preferencesStatus === 'loading'}
              onClick={() => openBook(null)}
            >
              Open memory book
            </Button>
            <Button variant="secondary" onClick={() => openDialog({ kind: 'create' })}>
              <Icon name="pen" size={15} />
              New summary
            </Button>
            <Button onClick={() => openDialog({ kind: 'generate' })}>
              <Icon name="sparkles" size={16} />
              Generate summary
            </Button>
          </>
        }
      />

      {notice && (
        <Alert variant="success" title="Done">
          {notice}
        </Alert>
      )}

      {loadErrors && status === 'ready' && (
        <Alert variant="error" title="We couldn’t refresh your summaries">
          <ul className="alert__list">
            {messagesOf(loadErrors).map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
          <div className="alert__actions">
            <Button variant="secondary" size="sm" onClick={() => void loadSummaries('refresh')}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      <SummarySearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        onSubmit={() => void runSearch(searchQuery, 1)}
        onClear={clearSearch}
        isLoading={searchStatus === 'loading'}
        hasActiveSearch={searchActive}
      />

      <section aria-labelledby="summaries-heading" aria-busy={searchStatus === 'loading'}>
        {searchActive ? (
          <>
            <div className="summary-search-results__head">
              <h2 id="summaries-heading">Résultats de recherche</h2>
              {searchStatus === 'ready' && (
                <p className="summary-search-results__count" role="status">
                  {searchCount === 0
                    ? 'Aucun résultat'
                    : `${searchCount} résultat${searchCount > 1 ? 's' : ''}`}
                </p>
              )}
            </div>

            {searchStatus === 'loading' && (
              <LoadingState label="Recherche dans vos souvenirs…" />
            )}

            {searchStatus === 'error' && (
              <Alert variant="error" title="La recherche n’a pas pu aboutir.">
                <p>Réessayez.</p>
                {searchErrorMessages.length > 0 && (
                  <ul className="alert__list">
                    {searchErrorMessages.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                )}
                <div className="alert__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void runSearch(activeSearchQuery, searchPage)}
                  >
                    Réessayer
                  </Button>
                </div>
              </Alert>
            )}

            {searchStatus === 'ready' && searchCount === 0 && (
              <EmptyState
                title="Aucun souvenir correspondant à cette recherche."
                description="Essayez une autre formulation."
                actions={
                  <Button variant="secondary" onClick={clearSearch}>
                    Effacer la recherche
                  </Button>
                }
              />
            )}

            {searchStatus === 'ready' && searchCount > 0 && (
              <>
                <ul className="card-grid summary-grid" aria-label="Résultats de recherche">
                  {searchResults.map((hit) => (
                    <SummaryCard
                      key={hit.summary.id}
                      summary={hit.summary}
                      snippet={hit.snippet}
                      onView={(item) => openDialog({ kind: 'detail', summary: item })}
                      onEdit={(item) => openDialog({ kind: 'edit', summary: item })}
                      onDelete={(item) => openDialog({ kind: 'delete', summary: item })}
                      onOpenInBook={(item) => openBook(item.id)}
                    />
                  ))}
                </ul>

                {totalSearchPages > 1 && (
                  <nav
                    className="summary-search__pagination"
                    aria-label="Pagination des résultats"
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!searchData?.previous}
                      onClick={() =>
                        void runSearch(activeSearchQuery, currentSearchPage - 1)
                      }
                    >
                      Précédent
                    </Button>
                    <span className="muted" aria-live="polite">
                      Page {currentSearchPage} sur {totalSearchPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!searchData?.next}
                      onClick={() =>
                        void runSearch(activeSearchQuery, currentSearchPage + 1)
                      }
                    >
                      Suivant
                    </Button>
                  </nav>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <h2 id="summaries-heading">Your summaries</h2>

            {status === 'loading' && <LoadingState label="Loading summaries…" />}

            {status === 'error' && (
              <div className="stack">
                <Alert variant="error" title="We couldn’t load your summaries">
                  <ul className="alert__list">
                    {messagesOf(loadErrors).map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </Alert>
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => void loadSummaries('initial')}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {status === 'ready' && (
              <>
                {refreshing && (
                  <p className="muted" role="status">
                    Refreshing summaries…
                  </p>
                )}

                {summaries.length === 0 ? (
                  <EmptyState
                    title="No summaries yet"
                    description="Generate a recap from one of your journal entries, or write one by hand."
                    actions={
                      <>
                        <Button onClick={() => openDialog({ kind: 'generate' })}>
                          Generate your first summary
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => openDialog({ kind: 'create' })}
                        >
                          Write one manually
                        </Button>
                      </>
                    }
                  />
                ) : (
                  <ul className="card-grid summary-grid" aria-label="Summaries">
                    {summaries.map((summary) => (
                      <SummaryCard
                        key={summary.id}
                        summary={summary}
                        onView={(item) => openDialog({ kind: 'detail', summary: item })}
                        onEdit={(item) => openDialog({ kind: 'edit', summary: item })}
                        onDelete={(item) => openDialog({ kind: 'delete', summary: item })}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </section>

      {dialog?.kind === 'detail' && (
        <SummaryDetailDialog summary={dialog.summary} onClose={closeDialog} />
      )}

      {dialog?.kind === 'create' && (
        <SummaryFormDialog
          mode="create"
          onClose={closeDialog}
          onSaved={() => completeMutation('Summary created.')}
        />
      )}

      {dialog?.kind === 'edit' && (
        <SummaryFormDialog
          mode="edit"
          summary={dialog.summary}
          onClose={closeDialog}
          onSaved={() => completeMutation('Summary updated.')}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteSummaryDialog
          summary={dialog.summary}
          onClose={closeDialog}
          onDeleted={() => completeMutation('Summary deleted.')}
        />
      )}

      {dialog?.kind === 'generate' && (
        <GenerateSummaryDialog
          onClose={closeDialog}
          onGenerated={() => completeMutation('Summary generated.')}
        />
      )}
    </div>
  )
}
