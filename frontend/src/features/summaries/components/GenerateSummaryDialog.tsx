import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { LoadingState } from '../../../components/LoadingState'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { summariesApi } from '../../../services/summaries'
import type { MockJournalEntryOption } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'
import { Dialog } from './Dialog'

export interface GenerateSummaryDialogProps {
  onClose: () => void
  /** Called after Django confirms generation. */
  onGenerated: () => void
}

type EntryLoadStatus = 'loading' | 'ready' | 'error'

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  return messages.length > 0 ? messages : ['Something went wrong. Please try again.']
}

export function GenerateSummaryDialog({ onClose, onGenerated }: GenerateSummaryDialogProps) {
  const [entries, setEntries] = useState<MockJournalEntryOption[]>([])
  const [entriesStatus, setEntriesStatus] = useState<EntryLoadStatus>('loading')
  const [entriesErrors, setEntriesErrors] = useState<NormalizedErrors | null>(null)
  const [entryId, setEntryId] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)
  const [generating, setGenerating] = useState(false)

  const generationMessages = messagesOf(errors)
  const entryMessages = messagesOf(entriesErrors)

  const loadEntries = useCallback(async () => {
    setEntriesStatus('loading')
    setEntriesErrors(null)
    try {
      const items = await summariesApi.listMockJournalEntries()
      setEntries(items)
      setEntriesStatus('ready')
    } catch (error) {
      setEntriesErrors(normalizeApiError(error))
      setEntriesStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (generating) {
      return
    }

    const parsedId = /^\d+$/.test(entryId) ? Number(entryId) : Number.NaN
    if (!Number.isSafeInteger(parsedId) || parsedId < 1) {
      setErrors({
        fieldErrors: { journal_entry_id: ['Choose a journal entry to summarize.'] },
        formErrors: [],
      })
      return
    }

    setGenerating(true)
    setErrors(null)
    try {
      // Only the ID crosses the wire. Django resolves the entry and calls
      // Gemini server-side; the browser never sends or sees the key.
      await summariesApi.generate({ journal_entry_id: parsedId })
      onGenerated()
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog title="Generate a summary" onClose={onClose}>
      {generationMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t generate a summary">
          <ul className="alert__list">
            {generationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Alert variant="info" title="Temporary Module 3 entries">
        This list comes from <code>GET /api/summaries/mock-journal-entries/</code>. It
        stands in for Module 1 until real journal entries are available. Only the
        selected entry ID is sent back.
      </Alert>

      {entriesStatus === 'loading' && (
        <LoadingState label="Loading journal entries…" />
      )}

      {entriesStatus === 'error' && (
        <Alert variant="error" title="We couldn’t load journal entries">
          <ul className="alert__list">
            {entryMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <div className="alert__actions">
            <Button variant="secondary" size="sm" onClick={() => void loadEntries()}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      {entriesStatus === 'ready' && entries.length === 0 && (
        <Alert variant="warning" title="No mock entries available">
          The server has no development journal entries to summarize right now.
        </Alert>
      )}

      {entriesStatus === 'ready' && entries.length > 0 && (
        <form className="form" onSubmit={handleSubmit} noValidate aria-busy={generating}>
          <FormField
            label="Journal entry"
            required
            hint="Generation runs on the server and can take a few seconds."
            error={errors?.fieldErrors.journal_entry_id?.[0]}
          >
            {(field) => (
              <select
                {...field}
                className="input"
                name="journal_entry_id"
                required
                value={entryId}
                onChange={(event) => setEntryId(event.target.value)}
              >
                <option value="">Choose an entry…</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title} — {formatDateTime(entry.created_at)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {generating && (
            <p className="muted" role="status">
              Generating summary…
            </p>
          )}

          <div className="form-actions">
            <Button variant="secondary" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button type="submit" disabled={generating}>
              {generating ? 'Generating…' : 'Generate summary'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
