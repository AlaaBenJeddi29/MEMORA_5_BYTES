import { useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { DetectedFace, Person } from '../types'

export interface FaceTaggingCardProps {
  face: DetectedFace
  people: Person[]
  onChanged: () => Promise<void>
}

export function FaceTaggingCard({ face, people, onChanged }: FaceTaggingCardProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const currentPersonId = face.person?.id ?? null
  const suggestionIsCurrent =
    face.suggested_person !== null && face.suggested_person.id === currentPersonId

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (actionError) {
      setError(describeApiError(actionError))
    } finally {
      setBusy(false)
    }
  }

  function handleAssign(value: string) {
    void run(() => peopleApi.setFacePerson(face.id, value ? Number(value) : null))
  }

  function handleConfirmSuggestion() {
    void run(() => peopleApi.confirmFace(face.id))
  }

  function handleRemoveConfirmed() {
    setConfirmRemove(false)
    void run(() => peopleApi.deleteFace(face.id))
  }

  return (
    <article className="face-card">
      <div className="face-card__crop">
        {face.face_crop ? (
          <img src={face.face_crop} alt="Visage détecté" />
        ) : (
          <span className="face-card__crop-empty" aria-hidden="true">
            <Icon name="user" size={28} />
          </span>
        )}
      </div>

      <div className="face-card__body">
        <p className="face-card__status">
          <span className="face-card__status-label">Personne :</span>
          <strong>{face.person?.name ?? 'Aucune'}</strong>
          {face.person && (
            <span className="face-card__verified" title="Visage associé">
              <Icon name="check" size={13} />
            </span>
          )}
        </p>

        <FormField label="Associer à">
          {(field) => (
            <select
              {...field}
              className="input"
              value={currentPersonId ? String(currentPersonId) : ''}
              disabled={busy}
              onChange={(event) => handleAssign(event.target.value)}
            >
              <option value="">-- Aucune --</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {face.suggested_person && !suggestionIsCurrent && (
          <div className="face-card__suggestion">
            <span className="face-card__suggestion-icon" aria-hidden="true">
              <Icon name="sparkles" size={15} />
            </span>
            <span className="face-card__suggestion-text">
              C’est peut-être <strong>{face.suggested_person.name}</strong>
            </span>
            <Button size="sm" disabled={busy} onClick={handleConfirmSuggestion}>
              <Icon name="check" size={14} />
              Confirmer
            </Button>
          </div>
        )}

        <div className="face-card__footer">
          {face.distance !== null && (
            <p className="face-card__distance">
              Distance : <span>{face.distance.toFixed(3)}</span>
            </p>
          )}

          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            <Icon name="trash" size={14} />
            Retirer ce visage
          </Button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Retirer ce visage ?"
        message="Ce visage sera détaché de la photo. Les autres visages restent inchangés."
        confirmLabel="Retirer le visage"
        cancelLabel="Annuler"
        busy={busy}
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setConfirmRemove(false)}
      />
    </article>
  )
}
