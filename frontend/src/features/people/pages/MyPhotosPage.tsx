import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatPeopleDateTime } from '../formatPeopleDate'
import { PeopleNav } from '../components/PeopleNav'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { PhotoSummary } from '../types'
import '../people.css'

export function MyPhotosPage() {
  useDocumentTitle('Mes photos · MEMORA')

  const [photos, setPhotos] = useState<PhotoSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPhotos(await peopleApi.photos())
    } catch (loadError) {
      setError(describeApiError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totalFaces = photos.reduce((sum, photo) => sum + photo.faces_count, 0)

  return (
    <div className="people-page">
      <PeopleNav section="photos" />

      <PageHeader
        eyebrow="Visages"
        title="Mes photos"
        badge={<StatusBadge status="neutral">Lecture seule</StatusBadge>}
        description="Vos photos et le nombre de visages détectés. Lecture seule."
      />

      <section className="photos-section" aria-labelledby="photos-heading">
        <div className="photos-section__head">
          <div>
            <p className="eyebrow">Votre pellicule</p>
            <h2 id="photos-heading">Toutes vos photos</h2>
          </div>
          {!loading && !error && photos.length > 0 && (
            <p className="people-count">
              <Icon name="image" size={13} />
              {photos.length} photo{photos.length > 1 ? 's' : ''}
              <span className="people-count__dot" aria-hidden="true" />
              {totalFaces} visage{totalFaces > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {error && (
          <div className="people-error">
            <Alert variant="error" title="Impossible de charger les photos">
              {error}
            </Alert>
            <Button variant="secondary" onClick={() => void load()}>
              <Icon name="refresh" size={15} />
              Réessayer
            </Button>
          </div>
        )}

        {loading && <LoadingState label="Chargement des photos…" />}

        {!loading && !error && photos.length === 0 && (
          <EmptyState
            icon="camera"
            title="Aucune photo"
            description="Ajoutez une photo depuis la page HTML /people/photos/."
          />
        )}

        {!loading && !error && photos.length > 0 && (
          <ul className="photo-grid">
            {photos.map((photo) => (
              <li className="photo-card" key={photo.id}>
                <Link
                  className="photo-card__frame"
                  to={`/app/people/photos/${photo.id}`}
                  aria-label={`Ouvrir la photo ${photo.id}`}
                >
                  <img src={photo.photo} alt={`Photo ${photo.id}`} loading="lazy" />
                  <span className="photo-card__faces">
                    <Icon name="users" size={13} />
                    {photo.faces_count} visage{photo.faces_count > 1 ? 's' : ''}
                  </span>
                </Link>

                <div className="photo-card__body">
                  <h3 className="photo-card__title">Photo #{photo.id}</h3>
                  <p className="photo-card__meta">
                    <Icon name="clock" size={12} />
                    {formatPeopleDateTime(photo.uploaded_at)}
                  </p>
                  <p className="photo-card__text">
                    {photo.faces_count} visage{photo.faces_count > 1 ? 's' : ''} détecté
                    {photo.faces_count > 1 ? 's' : ''}
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
        )}
      </section>
    </div>
  )
}
