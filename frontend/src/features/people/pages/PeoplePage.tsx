import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { PeopleNav } from '../components/PeopleNav'
import { PersonForm, type PersonFormValues } from '../components/PersonForm'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { Person } from '../types'

export function PeoplePage() {
  useDocumentTitle('Personnes · MEMORA')

  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setPeople(await peopleApi.list())
    } catch (error) {
      setLoadError(describeApiError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(values: PersonFormValues) {
    setActionError(null)
    await peopleApi.create(values)
    await load()
  }

  async function handleUpdate(person: Person, values: PersonFormValues) {
    setActionError(null)
    await peopleApi.update(person.id, values)
    await load()
    setEditingId(null)
  }

  async function handleDelete(person: Person) {
    if (!window.confirm(`Supprimer « ${person.name} » ?`)) {
      return
    }

    setActionError(null)
    setDeletingId(person.id)
    try {
      await peopleApi.remove(person.id)
      if (editingId === person.id) {
        setEditingId(null)
      }
      await load()
    } catch (error) {
      setActionError(describeApiError(error))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PeopleNav section="people" />

      <PageHeader
        title="Personnes"
        description="Les personnes qui apparaissent dans vos souvenirs."
      />

      {actionError && (
        <Alert variant="error" title="L’action a échoué">
          {actionError}
        </Alert>
      )}

      <div className="card">
        <h2>Ajouter une personne</h2>
        <PersonForm submitLabel="Ajouter" onSave={handleCreate} />
      </div>

      <h2>Mes personnes</h2>

      {loading && <LoadingState label="Chargement des personnes…" />}

      {!loading && loadError && (
        <div className="stack">
          <Alert variant="error" title="Impossible de charger les personnes">
            {loadError}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && !loadError && people.length === 0 && (
        <EmptyState
          title="Aucune personne"
          description="Ajoutez une première personne avec le formulaire ci-dessus."
        />
      )}

      {!loading && !loadError && people.length > 0 && (
        <ul className="card-grid">
          {people.map((person) => (
            <li className="card" key={person.id}>
              {person.avatar ? (
                <img
                  src={person.avatar}
                  alt={`Avatar de ${person.name}`}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                  }}
                />
              )}

              <h3 className="card__title">
                <Link to={`/app/people/${person.id}`}>{person.name}</Link>
              </h3>

              <div className="card__foot cluster">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingId(editingId === person.id ? null : person.id)}
                >
                  {editingId === person.id ? 'Fermer' : 'Modifier'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deletingId === person.id}
                  onClick={() => void handleDelete(person)}
                >
                  {deletingId === person.id ? 'Suppression…' : 'Supprimer'}
                </Button>
              </div>

              {editingId === person.id && (
                <PersonForm
                  key={person.id}
                  initialName={person.name}
                  currentAvatarUrl={person.avatar}
                  submitLabel="Enregistrer"
                  onSave={(values) => handleUpdate(person, values)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
