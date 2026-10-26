import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      variant="alertdialog"
      onClose={busy ? () => undefined : onCancel}
    >
      <div className="media-confirm">
        <span className="media-confirm__icon" aria-hidden="true">
          <Icon name="trash" size={22} />
        </span>
        <div className="media-confirm__body">
          <p className="media-confirm__message">{message}</p>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="We couldn’t complete that action">
          {error}
        </Alert>
      )}

      <div className="media-modal__actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
