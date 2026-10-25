import { useEffect, useMemo, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { FormField } from '../../../components/FormField'
import { PageHeader } from '../../../components/PageHeader'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { mediaApi } from '../../../services/media'
import type { MediaItem, MediaType, MockJournalEntry } from '../../../types/media'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { GenerateImageForm } from '../components/GenerateImageForm'
import { MediaCard } from '../components/MediaCard'
import { MediaDetailDialog } from '../components/MediaDetailDialog'
import { MediaSkeleton } from '../components/MediaSkeleton'
import { UploadForm } from '../components/UploadForm'
import { EMPTY_ERRORS, flattenFormErrors } from '../mediaHelpers'
import '../media-library.css'

type LoadState = 'loading' | 'ready' | 'error'
type TypeFilter = 'all' | MediaType
type SortOrder = 'newest' | 'oldest'

export function MediaLibraryPage() {
  useDocumentTitle('Media library · MEMORA')

  const [items, setItems] = useState<MediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadErrors, setLoadErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [reloadKey, setReloadKey] = useState(0)

  const [memories, setMemories] = useState<MockJournalEntry[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(true)
  const [memoriesError, setMemoriesError] = useState<string | null>(null)
  const [memoryReloadKey, setMemoryReloadKey] = useState(0)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
    setMemoriesLoading(true)
    setMemoriesError(null)

    mediaApi
      .listMockJournalEntries()
      .then((entries) => {
        if (!ignore) {
          setMemories(entries)
          setMemoriesLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          const normalized = normalizeApiError(error)
          setMemoriesError(
            normalized.detail ??
              normalized.formErrors[0] ??
              'Sample memories could not be loaded.',
          )
          setMemoriesLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [memoryReloadKey])

  const originalCount = useMemo(
    () => items.filter((item) => item.media_type === 'original').length,
    [items],
  )
  const aiCount = items.length - originalCount

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (typeFilter !== 'all' && item.media_type !== typeFilter) {
        return false
      }
      if (!needle) {
        return true
      }
      return (
        item.prompt.toLowerCase().includes(needle) ||
        String(item.id).includes(needle) ||
        (item.journal_entry_id !== null && String(item.journal_entry_id).includes(needle))
      )
    })

    return [...filtered].sort((left, right) => {
      const delta =
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      return sortOrder === 'newest' ? -delta : delta
    })
  }, [items, typeFilter, query, sortOrder])

  const loadErrorMessages = flattenFormErrors(loadErrors)

  function addMedia(media: MediaItem) {
    setItems((current) => [media, ...current.filter((item) => item.id !== media.id)])
    setLoadState('ready')
    setLoadErrors(EMPTY_ERRORS)
    setNotice(null)
  }

  function handleUpdated(updated: MediaItem) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
    setSelected((current) => (current && current.id === updated.id ? updated : current))
  }

  function requestDelete(media: MediaItem) {
    setSelected((current) => (current && current.id === media.id ? null : current))
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
      setDeleteTarget(null)
      setNotice(`Image #${target.id} was deleted from your library.`)
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

  function resetFilters() {
    setTypeFilter('all')
    setQuery('')
    setSortOrder('newest')
  }

  return (
    <div className="media-page">
      <div className="media-kicker-row">
        <p className="media-kicker">Your visual journal</p>
        <p className="media-kicker__aside">Private to your account</p>
      </div>

      <PageHeader
        title="Media library"
        description="Photographs you upload and illustrations made with your local ComfyUI model, kept together in one private collection."
        actions={
          <>
            <a className="btn btn--secondary" href="#media-upload">
              Upload a photo
            </a>
            <a className="btn" href="#media-generate">
              Generate an illustration
            </a>
          </>
        }
      />

      {loadState === 'ready' && items.length > 0 && (
        <dl className="media-overview" aria-label="Library summary">
          <div className="media-overview__item">
            <dt>All media</dt>
            <dd>{items.length}</dd>
          </div>
          <div className="media-overview__item">
            <dt>Original photos</dt>
            <dd>{originalCount}</dd>
          </div>
          <div className="media-overview__item">
            <dt>AI illustrations</dt>
            <dd>{aiCount}</dd>
          </div>
        </dl>
      )}

      {notice && (
        <div className="media-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="media-notice__dismiss"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="media-gallery" aria-labelledby="media-gallery-heading">
        <div className="media-gallery-head">
          <div>
            <p className="media-kicker">Collection</p>
            <h2 id="media-gallery-heading">Your gallery</h2>
          </div>
          {items.length > 0 && (
            <p className="media-filter-count" role="status">
              {visibleItems.length} of {items.length} shown
            </p>
          )}
        </div>

        {items.length > 0 && (
          <div className="media-toolbar">
            <FormField label="Search">
              {(field) => (
                <div className="media-search">
                  <svg
                    className="media-search__icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <TextInput
                    {...field}
                    type="search"
                    placeholder="Prompt, image ID, or sample memory"
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
                Try again
              </Button>
            </div>
          </Alert>
        )}

        {loadState === 'ready' && items.length === 0 && (
          <EmptyState
            title="Your gallery is empty"
            description="Upload a photo or generate an illustration to start your collection."
            actions={
              <>
                <a className="btn" href="#media-upload">
                  Upload a photo
                </a>
                <a className="btn btn--secondary" href="#media-generate">
                  Generate an illustration
                </a>
              </>
            }
          />
        )}

        {loadState === 'ready' && items.length > 0 && visibleItems.length === 0 && (
          <EmptyState
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
                onOpen={(item) => setSelected(item)}
                onDelete={requestDelete}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="media-studio" aria-labelledby="media-studio-heading">
        <header className="media-studio__head">
          <p className="media-kicker">Add to your library</p>
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
              <div className="media-panel__heading">
                <h3 id="media-upload-heading">Upload a photo</h3>
                <p>
                  Add an original image from your device. Files are stored
                  unchanged, up to 10 MB.
                </p>
              </div>
            </div>
            <UploadForm onUploaded={addMedia} onView={(media) => setSelected(media)} />
            <aside className="media-privacy-note">
              <span className="media-privacy-note__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
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
              <div className="media-panel__heading">
                <h3 id="media-generate-heading">Generate an illustration</h3>
                <p>
                  Describe a scene and render it with your local ComfyUI model.
                  It can take a few minutes.
                </p>
              </div>
            </div>
            <GenerateImageForm
              memories={memories}
              memoriesLoading={memoriesLoading}
              memoriesError={memoriesError}
              onGenerated={addMedia}
              onView={(media) => setSelected(media)}
            />
            {memoriesError && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMemoryReloadKey((key) => key + 1)}
              >
                Reload sample memories
              </Button>
            )}
          </section>
        </div>
      </section>

      {selected && (
        <MediaDetailDialog
          key={selected.id}
          media={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDelete={requestDelete}
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
    </div>
  )
}
