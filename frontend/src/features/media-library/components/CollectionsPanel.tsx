import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import type { MediaCollection } from '../../../types/media'
import { formatDateTime } from '../../../utils/format'

export interface CollectionsPanelProps {
  collections: MediaCollection[]
  loading: boolean
  error: string | null
  activeCollectionId: number | null
  onRetry: () => void
  onCreate: () => void
  onOpen: (collection: MediaCollection) => void
  onRename: (collection: MediaCollection) => void
  onDelete: (collection: MediaCollection) => void
}

export function CollectionsPanel({
  collections,
  loading,
  error,
  activeCollectionId,
  onRetry,
  onCreate,
  onOpen,
  onRename,
  onDelete,
}: CollectionsPanelProps) {
  return (
    <section className="media-collections" aria-labelledby="media-collections-heading">
      <div className="media-collections__head">
        <div>
          <p className="eyebrow">Organize</p>
          <h2 id="media-collections-heading">Collections</h2>
          <p className="media-collections__lede">
            Group photos and illustrations into your own sets. Deleting a
            collection never deletes the images inside it.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Icon name="plus" size={16} />
          New collection
        </Button>
      </div>

      {loading && (
        <p className="media-collections__status" role="status">
          Loading your collections…
        </p>
      )}

      {!loading && error && (
        <div className="media-collections__error">
          <Alert variant="error" title="We couldn’t load your collections">
            {error}
          </Alert>
          <Button variant="secondary" onClick={onRetry}>
            <Icon name="refresh" size={15} />
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && collections.length === 0 && (
        <EmptyState
          icon="folder"
          title="No collections yet"
          description="Create a collection to group related photos and illustrations. Images can belong to more than one collection."
          actions={
            <Button onClick={onCreate}>
              <Icon name="plus" size={16} />
              Create collection
            </Button>
          }
        />
      )}

      {!loading && !error && collections.length > 0 && (
        <ul className="media-collection-grid">
          {collections.map((collection) => {
            const isActive = collection.id === activeCollectionId
            return (
              <li
                className={
                  isActive
                    ? 'media-collection-card is-active'
                    : 'media-collection-card'
                }
                key={collection.id}
              >
                <div className="media-collection-card__head">
                  <span className="media-collection-card__icon" aria-hidden="true">
                    <Icon name="folder" size={18} />
                  </span>
                  <div className="media-collection-card__heading">
                    <h3>{collection.name}</h3>
                    <p className="media-collection-card__meta">
                      {collection.item_count} item
                      {collection.item_count === 1 ? '' : 's'}
                      <span aria-hidden="true"> · </span>
                      Updated {formatDateTime(collection.updated_at)}
                    </p>
                  </div>
                  {isActive && (
                    <span className="media-collection-card__viewing">
                      <Icon name="check" size={12} />
                      Viewing
                    </span>
                  )}
                </div>

                <p className="media-collection-card__description">
                  {collection.description || 'No description.'}
                </p>

                <div className="media-collection-card__actions">
                  {!isActive && (
                    <Button
                      size="sm"
                      onClick={() => onOpen(collection)}
                      aria-label={`Open collection ${collection.name}`}
                    >
                      <Icon name="folder" size={14} />
                      Open
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRename(collection)}
                    aria-label={`Rename collection ${collection.name}`}
                  >
                    <Icon name="pen" size={14} />
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="media-collection-card__delete"
                    onClick={() => onDelete(collection)}
                    aria-label={`Delete collection ${collection.name}`}
                  >
                    <Icon name="trash" size={14} />
                    Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
