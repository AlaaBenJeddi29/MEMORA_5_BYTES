import { useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { summariesApi } from '../../../services/summaries'
import type { Summary } from '../../../types/summaries'
import { Dialog } from './Dialog'

export interface DeleteSummaryDialogProps {
  summary: Summary
  onClose: () => void
  onDeleted: () => void
}

export function DeleteSummaryDialog({ summary, onClose, onDeleted }: DeleteSummaryDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)

  const messages = errors
    ? [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
    : []

  async function handleDelete() {
    if (deleting) {
      return
    }
    setDeleting(true)
    setErrors(null)
    try {
      await summariesApi.remove(summary.id)
      onDeleted()
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setDeleting(false)
    }
  }

  const source =
    summary.journal_entry_id === null
      ? `summary #${summary.id}`
      : `the summary for journal entry #${summary.journal_entry_id}`

  return (
    <Dialog
      title="Delete summary"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete summary'}
          </Button>
        </>
      }
    >
      {messages.length > 0 && (
        <Alert variant="error" title="We couldn’t delete the summary">
          <ul className="alert__list">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="reflection-delete">
        <span className="reflection-delete__icon" aria-hidden="true">
          <Icon name="alert" size={22} />
        </span>
        <p>
          Delete {source}? This permanently removes it from your account and cannot be undone.
        </p>
      </div>
    </Dialog>
  )
}
