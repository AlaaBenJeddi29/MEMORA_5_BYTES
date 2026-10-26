import { useId } from 'react'

import { Alert } from '../../../components/Alert'
import type { MediaCollection, MediaItem } from '../../../types/media'

export interface CollectionMembershipProps {
  media: MediaItem
  collections: MediaCollection[]
  loading: boolean
  collectionsError: string | null
  busyIds: number[]
  error: string | null
  onToggle: (
    collection: MediaCollection,
    media: MediaItem,
    shouldAdd: boolean,
  ) => void
}

export function CollectionMembership({
  media,
  collections,
  loading,
  collectionsError,
  busyIds,
  error,
  onToggle,
}: CollectionMembershipProps) {
  const headingId = useId()

  return (
    <section className="media-membership" aria-labelledby={headingId}>
      <div className="media-detail__section-head">
        <h3 id={headingId}>Collections</h3>
        {!loading && !collectionsError && collections.length > 0 && (
          <span className="media-membership__summary">
            {media.collection_ids.length} of {collections.length}
          </span>
        )}
      </div>
      <p className="media-membership__hint">
        This image can belong to more than one collection.
      </p>

      {loading && (
        <p className="media-membership__status" role="status">
          Loading collections…
        </p>
      )}

      {!loading && collectionsError && (
        <p className="media-membership__status">
          Collections could not be loaded. Close this view and retry from the
          Collections area.
        </p>
      )}

      {!loading && !collectionsError && collections.length === 0 && (
        <p className="media-membership__status">
          No collections yet. Create one from the Collections area, then reopen
          this image to add it.
        </p>
      )}

      {!loading && !collectionsError && collections.length > 0 && (
        <ul className="media-membership__list">
          {collections.map((collection) => {
            const isMember = media.collection_ids.includes(collection.id)
            const isBusy = busyIds.includes(collection.id)
            return (
              <li key={collection.id}>
                <label
                  className={
                    isMember
                      ? 'media-membership__item is-checked'
                      : 'media-membership__item'
                  }
                >
                  <input
                    type="checkbox"
                    checked={isMember}
                    disabled={isBusy}
                    onChange={() =>
                      onToggle(collection, media, !isMember)
                    }
                  />
                  <span className="media-membership__name">
                    {collection.name}
                  </span>
                  <span className="media-membership__count">
                    {isBusy
                      ? 'Updating…'
                      : `${collection.item_count} item${
                          collection.item_count === 1 ? '' : 's'
                        }`}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <Alert variant="error" title="We couldn’t update collections">
          {error}
        </Alert>
      )}
    </section>
  )
}
