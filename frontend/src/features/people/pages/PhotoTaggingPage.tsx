import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatPeopleDateTime } from '../formatPeopleDate'
import { FaceTaggingCard } from '../components/FaceTaggingCard'
import { PeopleNav } from '../components/PeopleNav'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { Person, PhotoDetail } from '../types'
import '../people.css'

export function PhotoTaggingPage() {
  const { id } = useParams()
  const photoId = Number(id)

  const [photo, setPhoto] = useState<PhotoDetail | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useDocumentTitle(photo ? `Photo #${photo.id} · MEMORA` : 'Tagging · MEMORA')

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setLoading(true)
      }
      setError(null)
      try {
        const [photoData, peopleData] = await Promise.all([
          peopleApi.photo(photoId),
          peopleApi.list(),
        ])
        setPhoto(photoData)
        setPeople(peopleData)
      } catch (loadError) {
        setError(describeApiError(loadError))
      } finally {
        if (!quiet) {
          setLoading(false)
        }
      }
    },
    [photoId],
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="people-page">
      <PeopleNav
        section="photos"
        currentLabel={photo ? `Photo #${photo.id}` : undefined}
      />

      <PageHeader
        eyebrow="Étiquetage"
        title={photo ? `Photo #${photo.id}` : 'Tagging'}
        badge={
          photo ? (
            <StatusBadge status="neutral">
              {photo.faces.length} visage{photo.faces.length > 1 ? 's' : ''}
            </StatusBadge>
          ) : undefined
        }
        description={
          photo
            ? `${photo.faces.length} visage${photo.faces.length > 1 ? 's' : ''} détecté${photo.faces.length > 1 ? 's' : ''}. Associez chaque visage à une personne.`
            : 'Associez les visages détectés aux personnes de votre choix.'
        }
      />

      {error && (
        <div className="people-error">
          <Alert variant="error" title="Impossible de charger la photo">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            <Icon name="refresh" size={15} />
            Réessayer
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Chargement de la photo…" />}

      {!loading && photo && (
        <>
          <figure className="tag-photo">
            <img src={photo.photo} alt={`Photo ${photo.id}`} />
            <figcaption>
              <span>
                <Icon name="image" size={13} />
                Photo #{photo.id}
              </span>
              <span>
                <Icon name="clock" size={13} />
                {formatPeopleDateTime(photo.uploaded_at)}
              </span>
            </figcaption>
          </figure>

          <section className="faces-section" aria-labelledby="faces-heading">
            <div className="faces-section__head">
              <div>
                <p className="eyebrow">Visages</p>
                <h2 id="faces-heading">Visages détectés</h2>
              </div>
              {photo.faces.length > 0 && (
                <p className="people-count">
                  {photo.faces.length} visage{photo.faces.length > 1 ? 's' : ''}
                </p>
              )}
            </div>

            {photo.faces.length === 0 ? (
              <EmptyState
                icon="users"
                title="Aucun visage détecté"
                description="Aucun visage n’a été trouvé sur cette photo."
              />
            ) : (
              <div className="face-stack">
                {photo.faces.map((face) => (
                  <FaceTaggingCard
                    key={face.id}
                    face={face}
                    people={people}
                    onChanged={() => load(true)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
