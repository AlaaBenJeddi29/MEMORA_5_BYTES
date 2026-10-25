import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { FaceTaggingCard } from '../components/FaceTaggingCard'
import { PeopleNav } from '../components/PeopleNav'
import { describeApiError } from '../describeApiError'
import { peopleApi } from '../peopleApi'
import type { Person, PhotoDetail } from '../types'

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
    <>
      <PeopleNav
        section="photos"
        currentLabel={photo ? `Photo #${photo.id}` : undefined}
      />

      <PageHeader
        title={photo ? `Photo #${photo.id}` : 'Tagging'}
        description={
          photo
            ? `${photo.faces.length} visage${photo.faces.length > 1 ? 's' : ''} détecté${photo.faces.length > 1 ? 's' : ''}. Associez chaque visage à une personne.`
            : 'Associez les visages détectés aux personnes de votre choix.'
        }
      />

      {error && (
        <div className="stack">
          <Alert variant="error" title="Impossible de charger la photo">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Réessayer
          </Button>
        </div>
      )}

      {loading && <LoadingState label="Chargement de la photo…" />}

      {!loading && photo && (
        <>
          <img
            src={photo.photo}
            alt={`Photo ${photo.id}`}
            style={{
              maxWidth: '100%',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              marginBottom: 'var(--space-5)',
            }}
          />

          <h2>Visages détectés</h2>

          {photo.faces.length === 0 ? (
            <EmptyState
              title="Aucun visage détecté"
              description="Aucun visage n’a été trouvé sur cette photo."
            />
          ) : (
            <div className="stack">
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
        </>
      )}
    </>
  )
}
