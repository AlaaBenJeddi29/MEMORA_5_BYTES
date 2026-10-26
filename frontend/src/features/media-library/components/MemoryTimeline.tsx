import { useEffect, useMemo, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { TextInput } from '../../../components/TextInput'
import type { JournalEntry } from '../../../types/journal'
import type { MediaCollection, MediaItem } from '../../../types/media'
import type { Summary } from '../../../types/summaries'
import {
  buildJournalTimelineEvent,
  buildTimelineEvents,
  groupTimelineEvents,
  isDateRangeInvalid,
  type TimelineKind,
  type TimelineOrder,
} from '../timelineHelpers'
import { TimelineEventCard } from './TimelineEventCard'
import { TimelineMemoryDialog } from './TimelineMemoryDialog'

const PAGE_SIZE = 20

export interface MemoryTimelineProps {
  media: MediaItem[]
  journalEntries: JournalEntry[]
  summaries: Summary[]
  mediaLoading: boolean
  mediaFailed: boolean
  mediaErrorMessages: string[]
  journalLoading: boolean
  journalError: string | null
  summariesError: string | null
  activeCollection: MediaCollection | null
  favoritesOnly: boolean
  favoriteCount: number
  favoriteBusyIds: number[]
  onSetFavoritesOnly: (value: boolean) => void
  onToggleFavorite: (media: MediaItem) => void
  onOpenMedia: (media: MediaItem) => void
  onClearCollection: () => void
  onRetryMedia: () => void
  onRetryJournal: () => void
  onRetrySummaries: () => void
  /** Opens the memory dialog for this journal entry when the page links back. */
  focusJournalEntryId?: number | null
  onFocusHandled?: () => void
}

function TimelineSkeleton() {
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Loading your memory timeline…
      </p>
      <div className="media-timeline-skeleton" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="media-timeline-skeleton__row" key={index}>
            <span className="media-skeleton__block media-timeline-skeleton__marker" />
            <div className="media-timeline-skeleton__card">
              <span className="media-skeleton__block media-timeline-skeleton__line media-timeline-skeleton__line--short" />
              <span className="media-skeleton__block media-timeline-skeleton__line" />
              <span className="media-skeleton__block media-timeline-skeleton__line media-timeline-skeleton__line--mid" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * A chronological merge of the owner's journal memories and media. Everything
 * is derived from the APIs already loaded by the media page, so this view adds
 * no requests and never links to records outside the caller's account.
 */
export function MemoryTimeline({
  media,
  journalEntries,
  summaries,
  mediaLoading,
  mediaFailed,
  mediaErrorMessages,
  journalLoading,
  journalError,
  summariesError,
  activeCollection,
  favoritesOnly,
  favoriteCount,
  favoriteBusyIds,
  onSetFavoritesOnly,
  onToggleFavorite,
  onOpenMedia,
  onClearCollection,
  onRetryMedia,
  onRetryJournal,
  onRetrySummaries,
  focusJournalEntryId = null,
  onFocusHandled,
}: MemoryTimelineProps) {
  const [kind, setKind] = useState<TimelineKind>('all')
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [order, setOrder] = useState<TimelineOrder>('newest')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [memoryEntryId, setMemoryEntryId] = useState<number | null>(null)

  useEffect(() => {
    if (focusJournalEntryId === null) {
      return
    }
    if (journalEntries.some((entry) => entry.id === focusJournalEntryId)) {
      setMemoryEntryId(focusJournalEntryId)
    }
    onFocusHandled?.()
  }, [focusJournalEntryId, journalEntries, onFocusHandled])

  const activeCollectionId = activeCollection?.id ?? null
  const isLoading = journalLoading || (mediaLoading && media.length === 0)
  const hasSources = media.length > 0 || journalEntries.length > 0
  const invalidRange = isDateRangeInvalid(dateFrom, dateTo)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [kind, query, dateFrom, dateTo, order, activeCollectionId, favoritesOnly])

  const events = useMemo(
    () =>
      buildTimelineEvents(media, journalEntries, summaries, {
        activeCollectionId,
        favoritesOnly,
        kind,
        query,
        dateFrom,
        dateTo,
        order,
      }),
    [
      media,
      journalEntries,
      summaries,
      activeCollectionId,
      favoritesOnly,
      kind,
      query,
      dateFrom,
      dateTo,
      order,
    ],
  )

  const visibleEvents = useMemo(
    () => events.slice(0, visibleCount),
    [events, visibleCount],
  )
  const groups = useMemo(
    () => groupTimelineEvents(visibleEvents),
    [visibleEvents],
  )

  const memoryEvent = useMemo(() => {
    if (memoryEntryId === null) {
      return null
    }
    const entry = journalEntries.find((item) => item.id === memoryEntryId)
    return entry ? buildJournalTimelineEvent(entry, media, summaries) : null
  }, [journalEntries, media, memoryEntryId, summaries])

  const collectionHasContent = useMemo(() => {
    if (activeCollectionId === null) {
      return true
    }
    return media.some((item) => item.collection_ids.includes(activeCollectionId))
  }, [activeCollectionId, media])

  const unfilteredFavoritesEmpty =
    favoritesOnly &&
    favoriteCount === 0 &&
    !query.trim() &&
    kind === 'all' &&
    !dateFrom &&
    !dateTo
  const filtersActive =
    favoritesOnly ||
    kind !== 'all' ||
    Boolean(query.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo)

  function resetFilters() {
    setKind('all')
    setQuery('')
    setDateFrom('')
    setDateTo('')
    onSetFavoritesOnly(false)
  }

  function clearDates() {
    setDateFrom('')
    setDateTo('')
  }

  function retryEverything() {
    if (mediaFailed) {
      onRetryMedia()
    }
    if (journalError) {
      onRetryJournal()
    }
    if (summariesError) {
      onRetrySummaries()
    }
  }

  const blockingError = !isLoading && !hasSources && (mediaFailed || Boolean(journalError))
  const showToolbar = !isLoading && hasSources
  const showList = !isLoading && events.length > 0

  return (
    <section className="media-timeline" aria-labelledby="media-timeline-heading">
      <div className="media-timeline__head">
        <div>
          <p className="eyebrow">Chronology</p>
          {activeCollection && (
            <nav className="media-breadcrumb" aria-label="Timeline scope">
              <button
                type="button"
                className="media-breadcrumb__back"
                onClick={onClearCollection}
              >
                <Icon name="arrowLeft" size={14} />
                All memories
              </button>
              <Icon
                name="chevronRight"
                size={12}
                className="media-breadcrumb__sep"
              />
              <span aria-current="page">{activeCollection.name}</span>
            </nav>
          )}
          <h2 id="media-timeline-heading">Memory timeline</h2>
          <p className="media-timeline__lede">
            {activeCollection
              ? `Journal memories and media in “${activeCollection.name}”, newest first.`
              : 'Journal memories, original photos, and AI illustrations woven into one private chronology.'}
          </p>
        </div>
        {showToolbar && (
          <p className="media-filter-count" role="status">
            {events.length} {events.length === 1 ? 'memory' : 'memories'} shown
          </p>
        )}
      </div>

      {isLoading && <TimelineSkeleton />}

      {blockingError && (
        <Alert variant="error" title="We couldn’t load your timeline">
          <ul className="alert__list">
            {(mediaErrorMessages.length > 0
              ? mediaErrorMessages
              : [journalError ?? 'Something went wrong. Please try again.']
            ).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <div className="media-form-actions media-alert-actions">
            <Button variant="secondary" onClick={retryEverything}>
              <Icon name="refresh" size={15} />
              Try again
            </Button>
          </div>
        </Alert>
      )}

      {!isLoading && hasSources && mediaFailed && (
        <Alert variant="warning" title="Some media couldn’t be loaded">
          <p>
            Journal memories still appear below, but their photos and
            illustrations may be missing.
          </p>
          {mediaErrorMessages.length > 0 && (
            <ul className="alert__list">
              {mediaErrorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <div className="media-form-actions media-alert-actions">
            <Button variant="secondary" size="sm" onClick={onRetryMedia}>
              <Icon name="refresh" size={14} />
              Reload media
            </Button>
          </div>
        </Alert>
      )}

      {!isLoading && hasSources && journalError && (
        <Alert variant="warning" title="Journal memories couldn’t be loaded">
          <p>
            Media still appears below, but journal entries are missing from this
            timeline.
          </p>
          <p>{journalError}</p>
          <div className="media-form-actions media-alert-actions">
            <Button variant="secondary" size="sm" onClick={onRetryJournal}>
              <Icon name="refresh" size={14} />
              Reload journal memories
            </Button>
          </div>
        </Alert>
      )}

      {!isLoading && hasSources && summariesError && (
        <Alert variant="warning" title="Summaries couldn’t be loaded">
          <p>
            Timeline entries still appear, but summary links and excerpts may be
            incomplete.
          </p>
          <div className="media-form-actions media-alert-actions">
            <Button variant="secondary" size="sm" onClick={onRetrySummaries}>
              <Icon name="refresh" size={14} />
              Reload summaries
            </Button>
          </div>
        </Alert>
      )}

      {showToolbar && (
        <div className="media-timeline__toolbar">
          <FormField label="Search memories">
            {(field) => (
              <div className="media-search">
                <Icon name="search" size={16} className="media-search__icon" />
                <TextInput
                  {...field}
                  type="search"
                  placeholder="Title, text, prompt, or summary"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}
          </FormField>

          <FormField label="Memory type">
            {(field) => (
              <select
                {...field}
                className="input"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as TimelineKind)
                }
              >
                <option value="all">All memories</option>
                <option value="journal">Journal memories</option>
                <option value="original">Original photos</option>
                <option value="ai_generated">AI illustrations</option>
              </select>
            )}
          </FormField>

          <FormField label="From date">
            {(field) => (
              <input
                {...field}
                className="input"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            )}
          </FormField>

          <FormField label="To date">
            {(field) => (
              <input
                {...field}
                className="input"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            )}
          </FormField>

          <FormField label="Order">
            {(field) => (
              <select
                {...field}
                className="input"
                value={order}
                onChange={(event) =>
                  setOrder(event.target.value as TimelineOrder)
                }
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
              onClick={() => onSetFavoritesOnly(!favoritesOnly)}
            >
              <Icon name="heart" size={15} />
              Favorites only
              <span className="media-favorite-filter__count">
                {favoriteCount}
              </span>
            </button>
          </div>

          {filtersActive && (
            <div className="media-timeline__clear">
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                <Icon name="refresh" size={14} />
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}

      {showToolbar && invalidRange && (
        <Alert variant="warning" title="Check the date range">
          <p>The start date is after the end date. Choose a valid range to see memories.</p>
          <div className="media-form-actions media-alert-actions">
            <Button variant="secondary" size="sm" onClick={clearDates}>
              <Icon name="calendar" size={14} />
              Clear dates
            </Button>
          </div>
        </Alert>
      )}

      {!isLoading && !hasSources && !blockingError && (
        <EmptyState
          icon="list"
          title="Your timeline is empty"
          description="Journal memories, uploaded photos, and AI illustrations will appear here in chronological order once you add them."
          actions={
            <a className="btn btn--secondary" href="#media-upload">
              <Icon name="upload" size={16} />
              Add your first photo
            </a>
          }
        />
      )}

      {!isLoading &&
        hasSources &&
        !collectionHasContent &&
        !invalidRange && (
          <EmptyState
            icon="folder"
            title="No memories in this collection"
            description="This collection does not contain any media yet. Open an image and add it to the collection, or return to the full timeline."
            actions={
              <Button variant="secondary" onClick={onClearCollection}>
                <Icon name="arrowLeft" size={15} />
                Back to all memories
              </Button>
            }
          />
        )}

      {!isLoading &&
        hasSources &&
        collectionHasContent &&
        events.length === 0 &&
        unfilteredFavoritesEmpty &&
        !invalidRange && (
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
                onClick={() => onSetFavoritesOnly(false)}
              >
                <Icon name="list" size={15} />
                Show all memories
              </Button>
            }
          />
        )}

      {!isLoading &&
        hasSources &&
        collectionHasContent &&
        events.length === 0 &&
        !unfilteredFavoritesEmpty &&
        !invalidRange && (
          <EmptyState
            icon="search"
            title="No memories match these filters"
            description="Try a different search term or date range, or clear the filters to see everything."
            actions={
              <Button variant="secondary" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        )}

      {showList && (
        <>
          <div className="media-timeline__groups">
            {groups.map((group) => {
              const groupId = `timeline-day-${group.dateKey || 'undated'}`
              return (
                <section
                  className="media-timeline-group"
                  key={group.dateKey || group.label}
                  aria-labelledby={groupId}
                >
                  <header className="media-timeline-group__head">
                    <h3 id={groupId}>{group.label}</h3>
                    <span>
                      {group.events.length}{' '}
                      {group.events.length === 1 ? 'memory' : 'memories'}
                    </span>
                  </header>
                  <ol className="media-timeline__list">
                    {group.events.map((event) => (
                      <TimelineEventCard
                        key={event.key}
                        event={event}
                        favoriteBusy={
                          event.kind === 'media' &&
                          favoriteBusyIds.includes(event.media.id)
                        }
                        onOpenMedia={onOpenMedia}
                        onOpenJournal={setMemoryEntryId}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </ol>
                </section>
              )
            })}
          </div>

          {events.length > visibleCount && (
            <div className="media-timeline__more">
              <Button
                variant="secondary"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                <Icon name="chevronDown" size={15} />
                Show more memories
              </Button>
              <p className="media-timeline__more-note">
                {Math.min(visibleCount, events.length)} of {events.length} shown
              </p>
            </div>
          )}
        </>
      )}

      {memoryEvent && (
        <TimelineMemoryDialog
          entry={memoryEvent.entry}
          linkedMedia={memoryEvent.linkedMedia}
          summaries={memoryEvent.summaries}
          onClose={() => setMemoryEntryId(null)}
          onOpenMedia={(item) => {
            setMemoryEntryId(null)
            onOpenMedia(item)
          }}
        />
      )}
    </section>
  )
}
