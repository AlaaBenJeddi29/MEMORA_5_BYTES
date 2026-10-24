import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { PersonForm, type PersonFormValues } from '../components/PersonForm'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { AlbumPhoto, Person } from '../types'

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
    <>
      <p>
        <Link to="/app/people">← Retour aux personnes</Link>
      </p>

      <PageHeader
        title={person ? `Photos avec ${person.name}` : 'Album'}
        description="Les photos où cette personne apparaît."
        actions={
          person ? (
            <Button variant="secondary" onClick={() => setEditing((open) => !open)}>
              {editing ? 'Fermer' : 'Modifier'}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="stack">
          <Alert variant="error" title="Impossible de charger l’album">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Réessayer
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Chargement de l’album…" />}

      {!loading && person && (
        <>
          {person.avatar && (
            <img
              src={person.avatar}
              alt={`Avatar de ${person.name}`}
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                objectFit: 'cover',
                marginBottom: 'var(--space-4)',
              }}
            />
          )}

          {editing && (
            <div className="card">
              <h2>Modifier la personne</h2>
              <PersonForm
                initialName={person.name}
                currentAvatarUrl={person.avatar}
                submitLabel="Enregistrer"
                onSave={handleUpdate}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}

          {photos.length === 0 ? (
            <EmptyState
              title="Aucune photo"
              description={`Aucune photo où ${person.name} apparaît pour le moment.`}
              actions={
                <Link className="btn btn--secondary btn--sm" to="/app/people/photos">
                  Voir mes photos
                </Link>
              }
            />
          ) : (
            <ul className="card-grid">
              {photos.map((photo) => (
                <li className="card" key={photo.id}>
                  <Link to={`/app/people/photos/${photo.id}`}>
                    <img src={photo.photo} alt={`Photo ${photo.id}`} />
                  </Link>

                  {photo.crops.length > 0 && (
                    <div className="cluster">
                      {photo.crops.map((crop) => (
                        <img
                          key={crop}
                          src={crop}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 'var(--radius-sm)',
                            objectFit: 'cover',
                          }}
                        />
                      ))}
                    </div>
                  )}

                  <p className="card__text">{formatDateTime(photo.uploaded_at)}</p>
                  <div className="card__foot">
                    <Link
                      className="btn btn--secondary btn--sm"
                      to={`/app/people/photos/${photo.id}`}
                    >
                      Taguer les visages
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
