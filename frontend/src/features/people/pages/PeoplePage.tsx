import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatPeopleDateTime } from '../formatPeopleDate'
import { PeopleNav } from '../components/PeopleNav'
import { PersonForm, type PersonFormValues } from '../components/PersonForm'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { Person } from '../types'
import '../people.css'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function PeoplePage() {
  useDocumentTitle('Personnes · MEMORA')

  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    setActionError(null)
    setDeleting(true)
    try {
      await peopleApi.remove(deleteTarget.id)
      if (editingId === deleteTarget.id) {
        setEditingId(null)
      }
      setDeleteTarget(null)
      await load()
    } catch (error) {
      setActionError(describeApiError(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="people-page">
      <PeopleNav section="people" />

      <PageHeader
        eyebrow="Personnes & visages"
        title="Personnes"
        badge={<StatusBadge status="neutral">Privé</StatusBadge>}
        description="Les personnes qui apparaissent dans vos souvenirs."
      />

      {actionError && (
        <Alert variant="error" title="L’action a échoué">
          {actionError}
        </Alert>
      )}

      <section className="people-add" aria-labelledby="people-add-heading">
        <div className="people-add__intro">
          <span className="people-add__icon" aria-hidden="true">
            <Icon name="users" size={20} />
          </span>
          <div>
            <h2 id="people-add-heading">Ajouter une personne</h2>
            <p>
              Donnez un visage à vos souvenirs. Un nom suffit ; l’avatar reste
              optionnel.
            </p>
          </div>
        </div>
        <PersonForm submitLabel="Ajouter" onSave={handleCreate} />
      </section>

      <section className="people-list" aria-labelledby="people-list-heading">
        <div className="people-list__head">
          <div>
            <p className="eyebrow">Votre cercle</p>
            <h2 id="people-list-heading">Mes personnes</h2>
          </div>
          {!loading && !loadError && people.length > 0 && (
            <p className="people-count">
              {people.length} {people.length > 1 ? 'personnes' : 'personne'}
            </p>
          )}
        </div>

        {loading && <LoadingState label="Chargement des personnes…" />}

        {!loading && loadError && (
          <div className="people-error">
            <Alert variant="error" title="Impossible de charger les personnes">
              {loadError}
            </Alert>
            <Button variant="secondary" onClick={() => void load()}>
              <Icon name="refresh" size={15} />
              Réessayer
            </Button>
          </div>
        )}

        {!loading && !loadError && people.length === 0 && (
          <EmptyState
            icon="users"
            title="Aucune personne"
            description="Ajoutez une première personne avec le formulaire ci-dessus."
          />
        )}

        {!loading && !loadError && people.length > 0 && (
          <ul className="person-grid">
            {people.map((person) => (
              <li className="person-card" key={person.id}>
                <div className="person-card__top">
                  {person.avatar ? (
                    <img
                      className="person-card__avatar"
                      src={person.avatar}
                      alt={`Avatar de ${person.name}`}
                    />
                  ) : (
                    <span className="person-card__avatar person-card__avatar--empty">
                      {initials(person.name)}
                    </span>
                  )}
                  <div className="person-card__identity">
                    <h3 className="person-card__name">
                      <Link to={`/app/people/${person.id}`}>{person.name}</Link>
                    </h3>
                    <p className="person-card__meta">
                      <Icon name="calendar" size={12} />
                      Ajoutée le {formatPeopleDateTime(person.created_at)}
                    </p>
                  </div>
                </div>

                <Link className="person-card__album" to={`/app/people/${person.id}`}>
                  Voir l’album
                  <Icon name="arrowRight" size={14} />
                </Link>

                <div className="person-card__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setEditingId(editingId === person.id ? null : person.id)
                    }
                  >
                    <Icon name={editingId === person.id ? 'close' : 'edit'} size={14} />
                    {editingId === person.id ? 'Fermer' : 'Modifier'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="person-card__delete"
                    onClick={() => setDeleteTarget(person)}
                  >
                    <Icon name="trash" size={14} />
                    Supprimer
                  </Button>
                </div>

                {editingId === person.id && (
                  <div className="person-card__editor">
                    <PersonForm
                      key={person.id}
                      initialName={person.name}
                      currentAvatarUrl={person.avatar}
                      submitLabel="Enregistrer"
                      onSave={(values) => handleUpdate(person, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer cette personne ?"
        message={
          deleteTarget
            ? `« ${deleteTarget.name} » sera retirée de vos personnes. Les photos restent intactes.`
            : undefined
        }
        confirmLabel="Supprimer la personne"
        cancelLabel="Annuler"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}
