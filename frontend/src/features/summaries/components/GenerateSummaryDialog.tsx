import { useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { summariesApi } from '../../../services/summaries'
import { MOCK_JOURNAL_ENTRY_OPTIONS } from '../mockJournalEntries'
import { Dialog } from './Dialog'

export interface GenerateSummaryDialogProps {
  onClose: () => void
  /** Called after Django confirms generation. */
  onGenerated: () => void
}

export function GenerateSummaryDialog({ onClose, onGenerated }: GenerateSummaryDialogProps) {
  const [entryId, setEntryId] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)
  const [generating, setGenerating] = useState(false)

  const messages = errors
    ? [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
    : []

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
      // Only the ID crosses the wire. Django resolves the mock entry and
      // calls Gemini server-side; the browser never sends or sees the key.
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
      {messages.length > 0 && (
        <Alert variant="error" title="We couldn’t generate a summary">
          <ul className="alert__list">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Alert variant="info" title="Temporary mock entries">
        Module 1 does not expose journal entries yet, so this list mirrors the server’s
        development fixtures. Only the selected entry ID is sent to Django.
      </Alert>

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
              {MOCK_JOURNAL_ENTRY_OPTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} (#{entry.id})
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
    </Dialog>
  )
}
