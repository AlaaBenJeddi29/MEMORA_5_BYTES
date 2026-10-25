import { useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
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

  function handleConfirm() {
    void run(() => peopleApi.confirmFace(face.id))
  }

  function handleRemove() {
    if (!window.confirm('Retirer ce visage de la photo ?')) {
      return
    }
    void run(() => peopleApi.deleteFace(face.id))
  }

  return (
    <div className="card">
      <div className="cluster" style={{ alignItems: 'flex-start' }}>
        {face.face_crop ? (
          <img
            src={face.face_crop}
            alt="Visage détecté"
            style={{
              width: 120,
              height: 120,
              borderRadius: 'var(--radius-md)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 120,
              height: 120,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
            }}
          />
        )}

        <div style={{ flex: '1 1 16rem' }}>
          <p>
            Personne : <strong>{face.person?.name ?? 'Aucune'}</strong>
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
            <div className="cluster" style={{ marginTop: 'var(--space-3)' }}>
              <span>
                C’est peut-être <strong>{face.suggested_person.name}</strong>
              </span>
              <Button size="sm" disabled={busy} onClick={handleConfirm}>
                Confirmer
              </Button>
            </div>
          )}

          {face.distance !== null && (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
              Distance : {face.distance.toFixed(3)}
            </p>
          )}

          <Button variant="danger" size="sm" disabled={busy} onClick={handleRemove}>
            Retirer ce visage
          </Button>

          {error && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Alert variant="error">{error}</Alert>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
