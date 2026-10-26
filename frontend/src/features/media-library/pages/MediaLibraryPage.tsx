import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { journalApi } from '../../../services/journal'
import { mediaApi } from '../../../services/media'
import { summariesApi } from '../../../services/summaries'
import type { JournalEntry } from '../../../types/journal'
import type {
  CollectionInput,
  MediaCollection,
  MediaItem,
  MediaType,
} from '../../../types/media'
import type { Summary } from '../../../types/summaries'
import { CollectionFormDialog } from '../components/CollectionFormDialog'
import { CollectionsPanel } from '../components/CollectionsPanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { GenerateImageForm } from '../components/GenerateImageForm'
import { MediaCard } from '../components/MediaCard'
import { MediaDetailDialog } from '../components/MediaDetailDialog'
import { MediaSkeleton } from '../components/MediaSkeleton'
import { UploadForm } from '../components/UploadForm'
import { EMPTY_ERRORS, flattenFormErrors } from '../mediaHelpers'
import '../media-library.css'

function positiveIntParam(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function errorMessage(error: unknown, fallback: string): string {
  const normalized = normalizeApiError(error)
  const fieldMessage = Object.values(normalized.fieldErrors).flat()[0]
  return (
    normalized.detail ?? normalized.formErrors[0] ?? fieldMessage ?? fallback
  )
}

type LoadState = 'loading' | 'ready' | 'error'
type TypeFilter = 'all' | MediaType
type SortOrder = 'newest' | 'oldest'
type Notice = { tone: 'success' | 'error'; message: string }
type CollectionDialogState =
  | { mode: 'create' }
  | { mode: 'rename'; collection: MediaCollection }

export function MediaLibraryPage() {
  useDocumentTitle('Media library · MEMORA')
  const [searchParams] = useSearchParams()

  // Query parameters are selection hints only. The server re-validates every
  // ID against the signed-in owner before generation.
  const initialSummaryId = useMemo(
    () => positiveIntParam(searchParams.get('summary_id')),
    [searchParams],
  )
  const initialJournalEntryId = useMemo(
    () => positiveIntParam(searchParams.get('journal_entry_id')),
    [searchParams],
  )

  const [items, setItems] = useState<MediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadErrors, setLoadErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [reloadKey, setReloadKey] = useState(0)

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalEntriesLoading, setJournalEntriesLoading] = useState(true)
  const [journalEntriesError, setJournalEntriesError] = useState<string | null>(null)
  const [journalReloadKey, setJournalReloadKey] = useState(0)

  const [summaries, setSummaries] = useState<Summary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(true)
  const [summariesError, setSummariesError] = useState<string | null>(null)
  const [summaryReloadKey, setSummaryReloadKey] = useState(0)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const [collections, setCollections] = useState<MediaCollection[]>([])
  const [collectionsState, setCollectionsState] = useState<LoadState>('loading')
  const [collectionsError, setCollectionsError] = useState<string | null>(null)
  const [collectionsReloadKey, setCollectionsReloadKey] = useState(0)
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<number[]>([])
  const [collectionDialog, setCollectionDialog] =
    useState<CollectionDialogState | null>(null)
  const [collectionFormBusy, setCollectionFormBusy] = useState(false)
  const [collectionFormError, setCollectionFormError] = useState<string | null>(null)
  const [collectionDeleteTarget, setCollectionDeleteTarget] =
    useState<MediaCollection | null>(null)
  const [collectionDeleteBusy, setCollectionDeleteBusy] = useState(false)
  const [collectionDeleteError, setCollectionDeleteError] = useState<string | null>(null)
  const [membershipBusyIds, setMembershipBusyIds] = useState<number[]>([])
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const [removingMediaIds, setRemovingMediaIds] = useState<number[]>([])

  useEffect(() => {
    let ignore = false
    setLoadState('loading')
    setLoadErrors(EMPTY_ERRORS)

    mediaApi
      .list()
      .then((media) => {
        if (!ignore) {
          setItems(media)
          setLoadState('ready')
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setLoadErrors(normalizeApiError(error))
          setLoadState('error')
        }
      })

    return () => {
      ignore = true
    }
  }, [reloadKey])

  useEffect(() => {
    let ignore = false
    setJournalEntriesLoading(true)
    setJournalEntriesError(null)

    journalApi
      .listAll()
      .then((entries) => {
        if (!ignore) {
          setJournalEntries(entries)
          setJournalEntriesLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setJournalEntriesError(
            errorMessage(error, 'Your journal entries could not be loaded.'),
          )
          setJournalEntriesLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [journalReloadKey])

  useEffect(() => {
    let ignore = false
    setSummariesLoading(true)
    setSummariesError(null)

    summariesApi
      .list()
      .then((items) => {
        if (!ignore) {
          setSummaries(items)
          setSummariesLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setSummariesError(
            errorMessage(error, 'Your summaries could not be loaded.'),
          )
          setSummariesLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [summaryReloadKey])

  useEffect(() => {
    let ignore = false
    setCollectionsState('loading')
    setCollectionsError(null)

    mediaApi
      .listCollections()
      .then((items) => {
        if (!ignore) {
          setCollections(items)
          setCollectionsState('ready')
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setCollectionsError(
            errorMessage(error, 'Your collections could not be loaded.'),
          )
          setCollectionsState('error')
        }
      })

    return () => {
      ignore = true
    }
  }, [collectionsReloadKey])

  const originalCount = useMemo(
    () => items.filter((item) => item.media_type === 'original').length,
    [items],
  )
  const aiCount = items.length - originalCount
  const favoriteCount = useMemo(
    () => items.filter((item) => item.is_favorite).length,
    [items],
  )
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  )
  const activeCollectionItemsCount = useMemo(
    () =>
      activeCollection
        ? items.filter((item) =>
            item.collection_ids.includes(activeCollection.id),
          ).length
        : 0,
    [activeCollection, items],
  )
  const activeFavoriteCount = useMemo(
    () =>
      activeCollection
        ? items.filter(
            (item) =>
              item.is_favorite &&
              item.collection_ids.includes(activeCollection.id),
          ).length
        : favoriteCount,
    [activeCollection, favoriteCount, items],
  )

  useEffect(() => {
    if (
      activeCollectionId !== null &&
      collectionsState === 'ready' &&
      !collections.some((collection) => collection.id === activeCollectionId)
    ) {
      setActiveCollectionId(null)
    }
  }, [activeCollectionId, collections, collectionsState])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (
        activeCollectionId !== null &&
        !item.collection_ids.includes(activeCollectionId)
      ) {
        return false
      }
      if (favoritesOnly && !item.is_favorite) {
        return false
      }
      if (typeFilter !== 'all' && item.media_type !== typeFilter) {
        return false
      }
      if (!needle) {
        return true
      }
      return (
        item.prompt.toLowerCase().includes(needle) ||
        String(item.id).includes(needle) ||
        (item.summary_id !== null && String(item.summary_id).includes(needle)) ||
        item.journal_entries.some(
          (entry) =>
            String(entry.id).includes(needle) ||
            entry.title.toLowerCase().includes(needle),
        )
      )
    })

    return [...filtered].sort((left, right) => {
      const delta =
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      return sortOrder === 'newest' ? -delta : delta
    })
  }, [
    items,
    activeCollectionId,
    favoritesOnly,
    typeFilter,
    query,
    sortOrder,
  ])

  const loadErrorMessages = flattenFormErrors(loadErrors)
  const collectionDeleteMessage = collectionDeleteTarget
    ? `“${collectionDeleteTarget.name}” will be removed from your collections. ${
        collectionDeleteTarget.item_count === 0
          ? 'No images are deleted.'
          : collectionDeleteTarget.item_count === 1
            ? 'Its image stays in your library and will not be deleted.'
            : `Its ${collectionDeleteTarget.item_count} images stay in your library and will not be deleted.`
      }`
    : ''

  function addMedia(media: MediaItem) {
    setItems((current) => [media, ...current.filter((item) => item.id !== media.id)])
    setLoadState('ready')
    setLoadErrors(EMPTY_ERRORS)
    setFavoritesOnly(false)
    setActiveCollectionId(null)
    setNotice(null)
  }

  function handleUpdated(updated: MediaItem) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
    setSelected((current) => (current && current.id === updated.id ? updated : current))
  }

  function patchMedia(id: number, updater: (media: MediaItem) => MediaItem) {
    setItems((current) =>
      current.map((item) => (item.id === id ? updater(item) : item)),
    )
    setSelected((current) =>
      current && current.id === id ? updater(current) : current,
    )
  }

  function openMedia(media: MediaItem) {
    setMembershipError(null)
    setSelected(media)
  }

  function closeDetail() {
    setSelected(null)
    setMembershipError(null)
  }

  function requestDelete(media: MediaItem) {
    setSelected((current) => (current && current.id === media.id ? null : current))
    setMembershipError(null)
    setDeleteError(null)
    setDeleteTarget(media)
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    const target = deleteTarget
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await mediaApi.remove(target.id)
      setItems((current) => current.filter((item) => item.id !== target.id))
      setCollections((current) =>
        current.map((collection) =>
          target.collection_ids.includes(collection.id)
            ? {
                ...collection,
                item_count: Math.max(0, collection.item_count - 1),
              }
            : collection,
        ),
      )
      setDeleteTarget(null)
      setNotice({
        tone: 'success',
        message: `Image #${target.id} was deleted from your library.`,
      })
    } catch (error) {
      const normalized = normalizeApiError(error)
      setDeleteError(
        normalized.detail ??
          normalized.formErrors[0] ??
          'We couldn’t delete this image. Please try again.',
      )
    } finally {
      setDeleteBusy(false)
    }
  }

  async function toggleFavorite(media: MediaItem) {
    if (favoriteBusyIds.includes(media.id)) {
      return
    }

    const nextValue = !media.is_favorite
    setFavoriteBusyIds((current) => [...current, media.id])
    patchMedia(media.id, (item) => ({ ...item, is_favorite: nextValue }))

    try {
      const updated = await mediaApi.setFavorite(media.id, nextValue)
      handleUpdated(updated)
      setNotice({
        tone: 'success',
        message: nextValue
          ? `Image #${media.id} added to favorites.`
          : `Image #${media.id} removed from favorites.`,
      })
    } catch (error) {
      patchMedia(media.id, (item) => ({
        ...item,
        is_favorite: media.is_favorite,
      }))
      setNotice({
        tone: 'error',
        message: errorMessage(
          error,
          'We couldn’t update this favorite. Please try again.',
        ),
      })
    } finally {
      setFavoriteBusyIds((current) =>
        current.filter((id) => id !== media.id),
      )
    }
  }

  function openCollection(collection: MediaCollection) {
    setActiveCollectionId(collection.id)
    setFavoritesOnly(false)
    setTypeFilter('all')
    setQuery('')
  }

  function requestCreateCollection() {
    setCollectionFormError(null)
    setCollectionDialog({ mode: 'create' })
  }

  function requestRenameCollection(collection: MediaCollection) {
    setCollectionFormError(null)
    setCollectionDialog({ mode: 'rename', collection })
  }

  async function submitCollection(input: CollectionInput) {
    const dialog = collectionDialog
    if (!dialog) {
      return
    }

    setCollectionFormBusy(true)
    setCollectionFormError(null)
    try {
      if (dialog.mode === 'create') {
        const created = await mediaApi.createCollection(input)
        setCollections((current) => [created, ...current])
        setCollectionsState('ready')
        setCollectionsError(null)
        setNotice({
          tone: 'success',
          message: `Collection “${created.name}” created.`,
        })
      } else {
        const updated = await mediaApi.updateCollection(
          dialog.collection.id,
          input,
        )
        setCollections((current) =>
          current.map((collection) =>
            collection.id === updated.id ? updated : collection,
          ),
        )
        setNotice({
          tone: 'success',
          message: `Collection “${updated.name}” updated.`,
        })
      }
      setCollectionDialog(null)
    } catch (error) {
      setCollectionFormError(
        errorMessage(
          error,
          'We couldn’t save this collection. Please try again.',
        ),
      )
    } finally {
      setCollectionFormBusy(false)
    }
  }

  function requestDeleteCollection(collection: MediaCollection) {
    setCollectionDeleteError(null)
    setCollectionDeleteTarget(collection)
  }

  async function confirmDeleteCollection() {
    if (!collectionDeleteTarget) {
      return
    }

    const target = collectionDeleteTarget
    setCollectionDeleteBusy(true)
    setCollectionDeleteError(null)
    try {
      await mediaApi.removeCollection(target.id)
      setCollections((current) =>
        current.filter((collection) => collection.id !== target.id),
      )
      setItems((current) =>
        current.map((item) =>
          item.collection_ids.includes(target.id)
            ? {
                ...item,
                collection_ids: item.collection_ids.filter(
                  (id) => id !== target.id,
                ),
              }
            : item,
        ),
      )
      setSelected((current) =>
        current && current.collection_ids.includes(target.id)
          ? {
              ...current,
              collection_ids: current.collection_ids.filter(
                (id) => id !== target.id,
              ),
            }
          : current,
      )
      if (activeCollectionId === target.id) {
        setActiveCollectionId(null)
      }
      setCollectionDeleteTarget(null)
      setNotice({
        tone: 'success',
        message: `Collection “${target.name}” deleted. Its images are still in your library.`,
      })
    } catch (error) {
      setCollectionDeleteError(
        errorMessage(
          error,
          'We couldn’t delete this collection. Please try again.',
        ),
      )
    } finally {
      setCollectionDeleteBusy(false)
    }
  }

  async function toggleCollectionMembership(
    collection: MediaCollection,
    media: MediaItem,
    shouldAdd: boolean,
  ) {
    if (membershipBusyIds.includes(collection.id)) {
      return
    }

    setMembershipBusyIds((current) => [...current, collection.id])
    setMembershipError(null)
    try {
      if (shouldAdd) {
        const updated = await mediaApi.addToCollection(collection.id, media.id)
        handleUpdated(updated)
        setCollections((current) =>
          current.map((item) =>
            item.id === collection.id
              ? {
                  ...item,
                  item_count:
                    item.item_count +
                    (media.collection_ids.includes(collection.id) ? 0 : 1),
                }
              : item,
          ),
        )
      } else {
        await mediaApi.removeFromCollection(collection.id, media.id)
        handleUpdated({
          ...media,
          collection_ids: media.collection_ids.filter(
            (id) => id !== collection.id,
          ),
        })
        setCollections((current) =>
          current.map((item) =>
            item.id === collection.id
              ? {
                  ...item,
                  item_count: Math.max(0, item.item_count - 1),
                }
              : item,
          ),
        )
      }
    } catch (error) {
      setMembershipError(
        errorMessage(
          error,
          'We couldn’t update this collection. Please try again.',
        ),
      )
    } finally {
      setMembershipBusyIds((current) =>
        current.filter((id) => id !== collection.id),
      )
    }
  }

  async function removeFromActiveCollection(media: MediaItem) {
    if (!activeCollection || removingMediaIds.includes(media.id)) {
      return
    }

    const collection = activeCollection
    setRemovingMediaIds((current) => [...current, media.id])
    try {
      await mediaApi.removeFromCollection(collection.id, media.id)
      handleUpdated({
        ...media,
        collection_ids: media.collection_ids.filter(
          (id) => id !== collection.id,
        ),
      })
      setCollections((current) =>
        current.map((item) =>
          item.id === collection.id
            ? {
                ...item,
                item_count: Math.max(0, item.item_count - 1),
              }
            : item,
        ),
      )
      setNotice({
        tone: 'success',
        message: `Image #${media.id} removed from “${collection.name}”. The image is still in your library.`,
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: errorMessage(
          error,
          'We couldn’t remove this image from the collection. Please try again.',
        ),
      })
    } finally {
      setRemovingMediaIds((current) =>
        current.filter((id) => id !== media.id),
      )
    }
  }

  function resetFilters() {
    setTypeFilter('all')
    setQuery('')
    setSortOrder('newest')
    setFavoritesOnly(false)
  }

  return (
    <div className="media-page">
      <PageHeader
        eyebrow="Visual archive"
        title="Media library"
        badge={<StatusBadge status="neutral">Private collection</StatusBadge>}
        description="Photographs you upload and illustrations made with your local ComfyUI model, kept together in one private collection."
        actions={
          <>
            <a className="btn btn--secondary" href="#media-upload">
              <Icon name="upload" size={16} />
              Upload a photo
            </a>
            <a className="btn" href="#media-generate">
              <Icon name="sparkles" size={16} />
              Generate an illustration
            </a>
          </>
        }
      />

      {loadState === 'ready' && items.length > 0 && (
        <dl className="media-overview" aria-label="Library summary">
          <div className="media-overview__item">
            <span className="media-overview__icon" aria-hidden="true">
              <Icon name="grid" size={16} />
            </span>
            <dt>All media</dt>
            <dd>{items.length}</dd>
          </div>
          <div className="media-overview__item">
            <span className="media-overview__icon" aria-hidden="true">
              <Icon name="camera" size={16} />
            </span>
            <dt>Original photos</dt>
            <dd>{originalCount}</dd>
          </div>
          <div className="media-overview__item">
            <span className="media-overview__icon" aria-hidden="true">
              <Icon name="sparkles" size={16} />
            </span>
            <dt>AI illustrations</dt>
            <dd>{aiCount}</dd>
          </div>
          <div className="media-overview__item">
            <span className="media-overview__icon" aria-hidden="true">
              <Icon name="heart" size={16} />
            </span>
            <dt>Favorites</dt>
            <dd>{favoriteCount}</dd>
          </div>
        </dl>
      )}

      {notice && (
        <div
          className={
            notice.tone === 'error'
              ? 'media-notice media-notice--error'
              : 'media-notice'
          }
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="media-notice__icon" aria-hidden="true">
            <Icon
              name={notice.tone === 'error' ? 'alert' : 'check'}
              size={15}
            />
          </span>
          <span>{notice.message}</span>
          <button
            type="button"
            className="media-notice__dismiss"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <CollectionsPanel
        collections={collections}
        loading={collectionsState === 'loading'}
        error={collectionsState === 'error' ? collectionsError : null}
        activeCollectionId={activeCollectionId}
        onRetry={() => setCollectionsReloadKey((key) => key + 1)}
        onCreate={requestCreateCollection}
        onOpen={openCollection}
        onRename={requestRenameCollection}
        onDelete={requestDeleteCollection}
      />

      <section className="media-gallery" aria-labelledby="media-gallery-heading">
        <div className="media-gallery-head">
          <div>
            {activeCollection ? (
              <>
                <p className="eyebrow">Collection view</p>
                <nav className="media-breadcrumb" aria-label="Gallery scope">
                  <button
                    type="button"
                    className="media-breadcrumb__back"
                    onClick={() => setActiveCollectionId(null)}
                  >
                    <Icon name="arrowLeft" size={14} />
                    All media
                  </button>
                  <Icon
                    name="chevronRight"
                    size={12}
                    className="media-breadcrumb__sep"
                  />
                  <span aria-current="page">{activeCollection.name}</span>
                </nav>
                <h2 id="media-gallery-heading">{activeCollection.name}</h2>
                <p className="media-gallery-desc">
                  {activeCollection.description ||
                    'Images grouped in this collection.'}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">Collection</p>
                <h2 id="media-gallery-heading">Your gallery</h2>
              </>
            )}
          </div>
          {items.length > 0 && (
            <p className="media-filter-count" role="status">
              {visibleItems.length} of{' '}
              {activeCollection ? activeCollectionItemsCount : items.length}{' '}
              shown
            </p>
          )}
        </div>

        {items.length > 0 && (
          <div className="media-toolbar">
            <FormField label="Search">
              {(field) => (
                <div className="media-search">
                  <Icon
                    name="search"
                    size={16}
                    className="media-search__icon"
                  />
                  <TextInput
                    {...field}
                    type="search"
                    placeholder="Prompt, image ID, or journal entry"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              )}
            </FormField>

            <FormField label="Media type">
              {(field) => (
                <select
                  {...field}
                  className="input"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                >
                  <option value="all">All media ({items.length})</option>
                  <option value="original">Original photos ({originalCount})</option>
                  <option value="ai_generated">AI illustrations ({aiCount})</option>
                </select>
              )}
            </FormField>

            <FormField label="Sort by">
              {(field) => (
                <select
                  {...field}
                  className="input"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              )}
            </FormField>

            <div className="media-toolbar__favorites">
              <span className="media-toolbar__label">View</span>
              <button
                type="button"
                className={
                  favoritesOnly
                    ? 'media-favorite-filter is-active'
                    : 'media-favorite-filter'
                }
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((value) => !value)}
              >
                <Icon name="heart" size={15} />
                Favorites only
                <span className="media-favorite-filter__count">
                  {favoriteCount}
                </span>
              </button>
            </div>
          </div>
        )}

        {loadState === 'loading' && <MediaSkeleton />}

        {loadState === 'error' && (
          <Alert variant="error" title="We couldn’t load your media">
            <ul className="alert__list">
              {(loadErrorMessages.length > 0
                ? loadErrorMessages
                : ['Something went wrong. Please try again.']
              ).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <div className="media-form-actions media-alert-actions">
              <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
                <Icon name="refresh" size={15} />
                Try again
              </Button>
            </div>
          </Alert>
        )}

        {loadState === 'ready' && items.length === 0 && (
          <EmptyState
            icon="image"
            title="Your gallery is empty"
            description="Upload a photo or generate an illustration to start your collection."
            actions={
              <>
                <a className="btn" href="#media-upload">
                  <Icon name="upload" size={16} />
                  Upload a photo
                </a>
                <a className="btn btn--secondary" href="#media-generate">
                  <Icon name="sparkles" size={16} />
                  Generate an illustration
                </a>
              </>
            }
          />
        )}

        {loadState === 'ready' &&
          items.length > 0 &&
          activeCollection &&
          activeCollectionItemsCount === 0 && (
            <EmptyState
              icon="folder"
              title="This collection is empty"
              description="Open any image, then use its Collections section to add it here. Deleting a collection never deletes its images."
              actions={
                <Button
                  variant="secondary"
                  onClick={() => setActiveCollectionId(null)}
                >
                  <Icon name="arrowLeft" size={15} />
                  Back to all media
                </Button>
              }
            />
          )}

        {loadState === 'ready' &&
          items.length > 0 &&
          favoritesOnly &&
          !query.trim() &&
          typeFilter === 'all' &&
          activeFavoriteCount === 0 && (
            <EmptyState
              icon="heart"
              title={
                activeCollection
                  ? 'No favorites in this collection'
                  : 'No favorites yet'
              }
              description="Use the heart on any image to keep it in your favorites. Favorites are private to your account."
              actions={
                <Button
                  variant="secondary"
                  onClick={() => setFavoritesOnly(false)}
                >
                  <Icon name="grid" size={15} />
                  Show all images
                </Button>
              }
            />
          )}

        {loadState === 'ready' &&
          items.length > 0 &&
          visibleItems.length === 0 &&
          !(activeCollection && activeCollectionItemsCount === 0) &&
          !(
            favoritesOnly &&
            !query.trim() &&
            typeFilter === 'all' &&
            activeFavoriteCount === 0
          ) && (
            <EmptyState
              icon="search"
              title="No media matches these filters"
              description="Try a different search term, or reset the filters to see everything."
              actions={
                <Button variant="secondary" onClick={resetFilters}>
                  Reset filters
                </Button>
              }
            />
          )}

        {loadState === 'ready' && visibleItems.length > 0 && (
          <ul className="media-grid">
            {visibleItems.map((media) => (
              <MediaCard
                key={media.id}
                media={media}
                favoriteBusy={favoriteBusyIds.includes(media.id)}
                removeBusy={removingMediaIds.includes(media.id)}
                activeCollectionName={activeCollection?.name}
                onOpen={openMedia}
                onDelete={requestDelete}
                onToggleFavorite={(item) => void toggleFavorite(item)}
                onRemoveFromCollection={
                  activeCollection
                    ? (item) => void removeFromActiveCollection(item)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="media-studio" aria-labelledby="media-studio-heading">
        <header className="media-studio__head">
          <p className="eyebrow">Add to your library</p>
          <h2 id="media-studio-heading">Two ways to add an image</h2>
          <p className="media-studio__lede">
            Keep a photograph exactly as it is, or turn a moment into a new
            illustration. Either way, it stays private to your account.
          </p>
        </header>

        <div className="media-workspace">
          <section
            id="media-upload"
            className="media-panel media-panel--upload"
            aria-labelledby="media-upload-heading"
          >
            <div className="media-panel__head">
              <span className="media-panel__index" aria-hidden="true">
                01
              </span>
              <span className="media-panel__icon" aria-hidden="true">
                <Icon name="camera" size={20} />
              </span>
              <div className="media-panel__heading">
                <h3 id="media-upload-heading">Upload a photo</h3>
                <p>
                  Add an original image from your device. Files are stored
                  unchanged, up to 10 MB.
                </p>
              </div>
            </div>
            <UploadForm onUploaded={addMedia} onView={openMedia} />
            <aside className="media-privacy-note">
              <span className="media-privacy-note__icon" aria-hidden="true">
                <Icon name="lock" size={16} />
              </span>
              <p>
                <strong>Private by default.</strong> Only you can see this
                gallery. Original photos stay as uploaded, and AI illustrations
                are always labelled.
              </p>
            </aside>
          </section>

          <section
            id="media-generate"
            className="media-panel media-panel--generate"
            aria-labelledby="media-generate-heading"
          >
            <div className="media-panel__head">
              <span className="media-panel__index" aria-hidden="true">
                02
              </span>
              <span className="media-panel__icon" aria-hidden="true">
                <Icon name="sparkles" size={20} />
              </span>
              <div className="media-panel__heading">
                <h3 id="media-generate-heading">Generate an illustration</h3>
                <p>
                  Describe a scene and render it with your local ComfyUI model.
                  It can take a few minutes.
                </p>
              </div>
            </div>
            <GenerateImageForm
              key={`${initialSummaryId ?? 'none'}:${initialJournalEntryId ?? 'none'}`}
              journalEntries={journalEntries}
              journalEntriesLoading={journalEntriesLoading}
              journalEntriesError={journalEntriesError}
              onReloadJournalEntries={() => setJournalReloadKey((key) => key + 1)}
              summaries={summaries}
              summariesLoading={summariesLoading}
              summariesError={summariesError}
              onReloadSummaries={() => setSummaryReloadKey((key) => key + 1)}
              initialJournalEntryId={initialJournalEntryId}
              initialSummaryId={initialSummaryId}
              onGenerated={addMedia}
              onView={openMedia}
            />
          </section>
        </div>
      </section>

      {selected && (
        <MediaDetailDialog
          key={selected.id}
          media={selected}
          collections={collections}
          collectionsLoading={collectionsState === 'loading'}
          collectionsError={
            collectionsState === 'error' ? collectionsError : null
          }
          favoriteBusy={favoriteBusyIds.includes(selected.id)}
          membershipBusyIds={membershipBusyIds}
          membershipError={membershipError}
          onClose={closeDetail}
          onUpdated={handleUpdated}
          onDelete={requestDelete}
          onToggleFavorite={(item) => void toggleFavorite(item)}
          onToggleCollection={(collection, media, shouldAdd) =>
            void toggleCollectionMembership(collection, media, shouldAdd)
          }
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this image?"
          message={`Image #${deleteTarget.id} will be removed from the database. Its stored file is deleted after the row is gone, unless another record still uses it. This cannot be undone.`}
          confirmLabel="Delete image"
          busyLabel="Deleting…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleteBusy) {
              setDeleteTarget(null)
              setDeleteError(null)
            }
          }}
        />
      )}

      {collectionDialog && (
        <CollectionFormDialog
          key={
            collectionDialog.mode === 'rename'
              ? `rename-${collectionDialog.collection.id}`
              : 'create'
          }
          mode={collectionDialog.mode}
          collection={
            collectionDialog.mode === 'rename'
              ? collectionDialog.collection
              : undefined
          }
          busy={collectionFormBusy}
          error={collectionFormError}
          onSubmit={(input) => void submitCollection(input)}
          onCancel={() => {
            if (!collectionFormBusy) {
              setCollectionDialog(null)
              setCollectionFormError(null)
            }
          }}
        />
      )}

      {collectionDeleteTarget && (
        <ConfirmDialog
          title="Delete this collection?"
          message={collectionDeleteMessage}
          confirmLabel="Delete collection"
          busyLabel="Deleting…"
          busy={collectionDeleteBusy}
          error={collectionDeleteError}
          onConfirm={() => void confirmDeleteCollection()}
          onCancel={() => {
            if (!collectionDeleteBusy) {
              setCollectionDeleteTarget(null)
              setCollectionDeleteError(null)
            }
          }}
        />
      )}
    </div>
  )
}
