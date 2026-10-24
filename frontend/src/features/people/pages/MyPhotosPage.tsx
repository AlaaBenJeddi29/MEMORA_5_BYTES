import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { PhotoSummary } from '../types'

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

  return (
    <>
      <p>
        <Link to="/app/people">← Retour aux personnes</Link>
      </p>

      <PageHeader
        title="Mes photos"
        description="Vos photos et le nombre de visages détectés. Lecture seule."
      />

      <Alert variant="info" title="Ajout de photos">
        Cette page ne gère pas l’upload. Ajoutez une photo depuis la page HTML{' '}
        <code>/people/photos/</code>, puis revenez ici pour taguer les visages.
      </Alert>

      {error && (
        <div className="stack">
          <Alert variant="error" title="Impossible de charger les photos">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Réessayer
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Chargement des photos…" />}

      {!loading && !error && photos.length === 0 && (
        <EmptyState
          title="Aucune photo"
          description="Ajoutez une photo depuis la page HTML /people/photos/."
        />
      )}

      {!loading && !error && photos.length > 0 && (
        <ul className="card-grid">
          {photos.map((photo) => (
            <li className="card" key={photo.id}>
              <Link to={`/app/people/photos/${photo.id}`}>
                <img src={photo.photo} alt={`Photo ${photo.id}`} />
              </Link>

              <h3 className="card__title">Photo #{photo.id}</h3>
              <p className="card__text">
                {photo.faces_count} visage{photo.faces_count > 1 ? 's' : ''} détecté
                {photo.faces_count > 1 ? 's' : ''}
              </p>
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
  )
}
