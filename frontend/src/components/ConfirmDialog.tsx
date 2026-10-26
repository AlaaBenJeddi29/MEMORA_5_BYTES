/**
 * ConfirmDialog — modal de confirmation générique.
 *
 * Utilisation :
 *   <ConfirmDialog
 *     open={open}
 *     title="Supprimer le mémo ?"
 *     message="Cette action est irréversible."
 *     confirmLabel="Supprimer"
 *     onConfirm={handleConfirm}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { useEffect, useRef } from 'react'

import { Button } from './Button'
import { Icon } from './Icon'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  /** Texte du bouton de confirmation (défaut : "Confirmer") */
  confirmLabel?: string
  /** Texte du bouton d'annulation (défaut : "Annuler") */
  cancelLabel?: string
  /** Variante du bouton de confirmation (défaut : "danger") */
  confirmVariant?: 'primary' | 'danger'
  /** En cours de traitement — désactive les boutons */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Ouvrir / fermer la <dialog> native en synchronisant l'état React.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  // Fermer sur Escape (le navigateur le déclenche nativement sur <dialog>).
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handleClose = () => { if (!busy) onCancel() }
    el.addEventListener('close', handleClose)
    return () => el.removeEventListener('close', handleClose)
  }, [busy, onCancel])

  // Fermer en cliquant sur le backdrop (clic sur l'élément <dialog> lui-même).
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && !busy) onCancel()
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={message ? 'confirm-dialog-message' : undefined}
      onClick={handleBackdropClick}
    >
      <div className="confirm-dialog__panel">
        <span className="confirm-dialog__icon" aria-hidden="true">
          <Icon name="alert" size={22} />
        </span>

        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>

        {message && (
          <p id="confirm-dialog-message" className="confirm-dialog__message">
            {message}
          </p>
        )}

        <div className="confirm-dialog__actions">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
