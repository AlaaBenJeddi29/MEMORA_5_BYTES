import { useCallback, useEffect, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { summariesApi } from '../../../services/summaries'
import type { Summary } from '../../../types/summaries'
import { DeleteSummaryDialog } from '../components/DeleteSummaryDialog'
import { GenerateSummaryDialog } from '../components/GenerateSummaryDialog'
import { SummaryCard } from '../components/SummaryCard'
import { SummaryDetailDialog } from '../components/SummaryDetailDialog'
import { SummaryFormDialog } from '../components/SummaryFormDialog'
import '../summaries.css'

type ActiveDialog =
  | { kind: 'detail'; summary: Summary }
  | { kind: 'edit'; summary: Summary }
  | { kind: 'delete'; summary: Summary }
  | { kind: 'create' }
  | { kind: 'generate' }
  | null

type LoadStatus = 'loading' | 'ready' | 'error'

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  return messages.length > 0 ? messages : ['Something went wrong. Please try again.']
}

export function SummariesPage() {
  useDocumentTitle('Reflections · MEMORA')

  const [summaries, setSummaries] = useState<Summary[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [loadErrors, setLoadErrors] = useState<NormalizedErrors | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ActiveDialog>(null)

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

  function openDialog(next: ActiveDialog) {
    setNotice(null)
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
  }

  /** Close the dialog, report success, and re-read the list from Django. */
  function completeMutation(message: string) {
    setDialog(null)
    setNotice(message)
    void loadSummaries('refresh')
  }

  return (
    <div className="reflections-page">
      <PageHeader
        eyebrow="AI reflections"
        title="Reflections"
        description="Short recaps written from your own journal entries. Generation runs on your server; writing, editing and deleting here never contact the model."
        actions={
          <>
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

      <section className="reflections-section" aria-labelledby="summaries-heading">
        <div className="reflections-head">
          <div>
            <p className="eyebrow">Collected</p>
            <h2 id="summaries-heading">Your summaries</h2>
          </div>
          {status === 'ready' && summaries.length > 0 && (
            <p className="reflections-count">
              {summaries.length} {summaries.length === 1 ? 'reflection' : 'reflections'}
            </p>
          )}
        </div>

        {status === 'loading' && <LoadingState label="Loading summaries…" />}

        {status === 'error' && (
          <div className="reflections-error">
            <Alert variant="error" title="We couldn’t load your summaries">
              <ul className="alert__list">
                {messagesOf(loadErrors).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </Alert>
            <div>
              <Button variant="secondary" onClick={() => void loadSummaries('initial')}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <>
            {refreshing && (
              <p className="muted reflections-refreshing" role="status">
                Refreshing summaries…
              </p>
            )}

            {summaries.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="No summaries yet"
                description="Generate a recap from one of your journal entries, or write one by hand."
                actions={
                  <>
                    <Button onClick={() => openDialog({ kind: 'generate' })}>
                      <Icon name="sparkles" size={15} />
                      Generate your first summary
                    </Button>
                    <Button variant="secondary" onClick={() => openDialog({ kind: 'create' })}>
                      Write one manually
                    </Button>
                  </>
                }
              />
            ) : (
              <ul className="reflection-grid" aria-label="Summaries">
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
