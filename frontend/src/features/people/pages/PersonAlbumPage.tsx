import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatPeopleDateTime } from '../formatPeopleDate'
import { PeopleNav } from '../components/PeopleNav'
import { PersonForm, type PersonFormValues } from '../components/PersonForm'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { AlbumPhoto, Person } from '../types'
import '../people.css'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function PersonAlbumPage() {
  const { id } = useParams()
  const personId = Number(id)

  const [person, setPerson] = useState<Person | null>(null)
  const [photos, setPhotos] = useState<AlbumPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useDocumentTitle(person ? `Photos avec ${person.name} · MEMORA` : 'Album · MEMORA')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [personData, albumData] = await Promise.all([
        peopleApi.get(personId),
        peopleApi.album(personId),
      ])
      setPerson(personData)
      setPhotos(albumData)
    } catch (loadError) {
      setError(describeApiError(loadError))
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleUpdate(values: PersonFormValues) {
    await peopleApi.update(personId, values)
    await load()
    setEditing(false)
  }

  return (
    <div className="people-page">
      <PeopleNav section="people" currentLabel={person?.name} />

      <PageHeader
        eyebrow="Album de personne"
        title={person ? `Photos avec ${person.name}` : 'Album'}
        description="Les photos où cette personne apparaît."
        actions={
          person ? (
            <Button variant="secondary" onClick={() => setEditing((open) => !open)}>
              <Icon name={editing ? 'close' : 'edit'} size={15} />
              {editing ? 'Fermer' : 'Modifier'}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="people-error">
          <Alert variant="error" title="Impossible de charger l’album">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            <Icon name="refresh" size={15} />
            Réessayer
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Chargement de l’album…" />}

      {!loading && person && (
        <>
          <section className="album-hero" aria-labelledby="album-person-heading">
            {person.avatar ? (
              <img
                className="album-hero__avatar"
                src={person.avatar}
                alt={`Avatar de ${person.name}`}
              />
            ) : (
              <span className="album-hero__avatar album-hero__avatar--empty">
                {initials(person.name)}
              </span>
            )}
            <div className="album-hero__body">
              <h2 id="album-person-heading">{person.name}</h2>
              <p className="album-hero__meta">
                <Icon name="image" size={13} />
                {photos.length} photo{photos.length > 1 ? 's' : ''} dans cet album
                <span className="people-count__dot" aria-hidden="true" />
                <Icon name="calendar" size={13} />
                Ajouté le {formatPeopleDateTime(person.created_at)}
              </p>
            </div>
            <Link className="btn btn--secondary btn--sm" to="/app/people">
              <Icon name="arrowLeft" size={14} />
              Toutes les personnes
            </Link>
          </section>

          {editing && (
            <section className="people-add album-editor" aria-labelledby="album-edit-heading">
              <div className="people-add__intro">
                <span className="people-add__icon" aria-hidden="true">
                  <Icon name="edit" size={20} />
                </span>
                <div>
                  <h2 id="album-edit-heading">Modifier la personne</h2>
                  <p>Changez le nom ou choisissez un nouvel avatar.</p>
                </div>
              </div>
              <PersonForm
                initialName={person.name}
                currentAvatarUrl={person.avatar}
                submitLabel="Enregistrer"
                onSave={handleUpdate}
                onCancel={() => setEditing(false)}
              />
            </section>
          )}

          {photos.length === 0 ? (
            <EmptyState
              icon="camera"
              title="Aucune photo"
              description={`Aucune photo où ${person.name} apparaît pour le moment.`}
              actions={
                <Link className="btn btn--secondary btn--sm" to="/app/people/photos">
                  Voir mes photos
                </Link>
              }
            />
          ) : (
            <section className="photos-section" aria-labelledby="album-photos-heading">
              <div className="photos-section__head">
                <div>
                  <p className="eyebrow">Apparitions</p>
                  <h2 id="album-photos-heading">Photos partagées</h2>
                </div>
                <p className="people-count">{photos.length} photo{photos.length > 1 ? 's' : ''}</p>
              </div>

              <ul className="photo-grid">
                {photos.map((photo) => (
                  <li className="photo-card" key={photo.id}>
                    <Link
                      className="photo-card__frame"
                      to={`/app/people/photos/${photo.id}`}
                      aria-label={`Ouvrir la photo ${photo.id}`}
                    >
                      <img src={photo.photo} alt={`Photo ${photo.id}`} loading="lazy" />
                    </Link>

                    <div className="photo-card__body">
                      {photo.crops.length > 0 && (
                        <div className="photo-card__crops" aria-hidden="true">
                          {photo.crops.map((crop) => (
                            <img key={crop} src={crop} alt="" loading="lazy" />
                          ))}
                        </div>
                      )}

                      <p className="photo-card__meta">
                        <Icon name="clock" size={12} />
                        {formatPeopleDateTime(photo.uploaded_at)}
                      </p>

                      <Link
                        className="btn btn--secondary btn--sm photo-card__action"
                        to={`/app/people/photos/${photo.id}`}
                      >
                        <Icon name="tag" size={14} />
                        Taguer les visages
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
