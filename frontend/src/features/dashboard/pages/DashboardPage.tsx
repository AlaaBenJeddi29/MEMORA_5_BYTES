import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { EmptyState } from '../../../components/EmptyState'
import { Icon, type IconName } from '../../../components/Icon'
import { Button } from '../../../components/Button'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'
import { listAudioEntries } from '../../audio/services/audio'
import { MediaImage } from '../../media-library/components/MediaImage'
import { peopleApi } from '../../people/peopleApi'
import { journalApi } from '../../../services/journal'
import { mediaApi } from '../../../services/media'
import { summariesApi } from '../../../services/summaries'
import type { JournalEntry } from '../../../types/journal'
import type { MediaItem } from '../../../types/media'
import '../dashboard.css'

type StatKey = 'journal' | 'audio' | 'summaries' | 'media' | 'people'

const STAT_DEFS: Array<{ key: StatKey; label: string; icon: IconName; to: string }> = [
  { key: 'journal', label: 'Journal entries', icon: 'book', to: '/app/journal' },
  { key: 'audio', label: 'Voice memos', icon: 'mic', to: '/app/audio' },
  { key: 'summaries', label: 'Reflections', icon: 'sparkles', to: '/app/summaries' },
  { key: 'media', label: 'Images', icon: 'image', to: '/app/media' },
  { key: 'people', label: 'People', icon: 'users', to: '/app/people' },
]

const SHORTCUTS: Array<{ to: string; label: string; icon: IconName; note: string }> = [
  { to: '/app/journal', label: 'Write', icon: 'pen', note: 'A new page' },
  { to: '/app/audio', label: 'Record', icon: 'mic', note: 'A voice memo' },
  { to: '/app/summaries', label: 'Reflect', icon: 'sparkles', note: 'An AI recap' },
  { to: '/app/media', label: 'Keep', icon: 'image', note: 'A photograph' },
  { to: '/app/people', label: 'Remember', icon: 'users', note: 'The people' },
]

const EMPTY_COUNTS: Record<StatKey, number | null> = {
  journal: null,
  audio: null,
  summaries: null,
  media: null,
  people: null,
}

function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function shortExcerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 150 ? `${clean.slice(0, 150).trimEnd()}…` : clean
}

export function DashboardPage() {
  useDocumentTitle('Today · MEMORA')
  const { user } = useAuth()

  const [counts, setCounts] = useState<Record<StatKey, number | null>>(EMPTY_COUNTS)
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([])
  const [journalState, setJournalState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [recentMedia, setRecentMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [issues, setIssues] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setJournalState('loading')
    setIssues([])
    setCounts(EMPTY_COUNTS)

    const [journalResult, audioResult, summariesResult, mediaResult, peopleResult] =
      await Promise.allSettled([
        journalApi.list(1),
        listAudioEntries(),
        summariesApi.list(),
        mediaApi.list(),
        peopleApi.list(),
      ])

    const failed: string[] = []
    const nextCounts: Record<StatKey, number | null> = { ...EMPTY_COUNTS }

    if (journalResult.status === 'fulfilled') {
      nextCounts.journal = journalResult.value.count
      setRecentEntries(journalResult.value.results.slice(0, 3))
      setJournalState('ready')
    } else {
      setJournalState('error')
      failed.push('journal entries')
    }

    if (audioResult.status === 'fulfilled') {
      nextCounts.audio = audioResult.value.length
    } else {
      failed.push('voice memos')
    }

    if (summariesResult.status === 'fulfilled') {
      nextCounts.summaries = summariesResult.value.length
    } else {
      failed.push('reflections')
    }

    if (mediaResult.status === 'fulfilled') {
      nextCounts.media = mediaResult.value.length
      setRecentMedia(
        mediaResult.value
          .filter((item) => item.status === 'succeeded')
          .slice(0, 3),
      )
    } else {
      failed.push('images')
    }

    if (peopleResult.status === 'fulfilled') {
      nextCounts.people = peopleResult.value.length
    } else {
      failed.push('people')
    }

    setCounts(nextCounts)
    setIssues(failed)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const now = new Date()
  const firstName = user?.first_name?.trim() || user?.username || 'there'
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)

  return (
    <div className="dashboard">
      {loading && (
        <p className="sr-only" role="status">
          Loading your journal overview…
        </p>
      )}

      <section className="dash-hero" aria-labelledby="dash-heading">
        <div className="dash-hero__copy">
          <p className="eyebrow">{today}</p>
          <h1 id="dash-heading">
            {greetingFor(now)}, <em>{firstName}</em>.
          </h1>
          <p className="dash-hero__lede">
            Your private corner is open. Start with a sentence, a voice, or a photograph — whichever
            brings today back.
          </p>
          <div className="dash-hero__actions">
            <Link className="btn" to="/app/journal?new=1">
              <Icon name="pen" size={16} />
              Write an entry
            </Link>
            <Link className="btn btn--secondary" to="/app/audio">
              <Icon name="mic" size={16} />
              Record a memo
            </Link>
          </div>
        </div>

        <aside className="dash-prompt" aria-label="A writing prompt">
          <Icon name="quote" size={22} />
          <p className="dash-prompt__label">A prompt for today</p>
          <p className="dash-prompt__text">
            What is one small thing you want to remember about today?
          </p>
          <Link to="/app/journal?new=1">
            Start with this prompt
            <Icon name="arrowRight" size={15} />
          </Link>
        </aside>
      </section>

      {issues.length > 0 && (
        <Alert variant="warning" title="Part of your overview couldn’t load">
          <p>
            We couldn’t reach {issues.join(', ')} just now. Anything shown below is still real data
            from your account.
          </p>
          <div className="alert__actions">
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      <section className="dash-stats" aria-label="Your journal at a glance">
        {STAT_DEFS.map((stat) => (
          <Link className="dash-stat" to={stat.to} key={stat.key}>
            <span className="dash-stat__icon" aria-hidden="true">
              <Icon name={stat.icon} size={18} />
            </span>
            <span className="dash-stat__value">
              {loading ? '–' : counts[stat.key] ?? '—'}
            </span>
            <span className="dash-stat__label">{stat.label}</span>
            <Icon className="dash-stat__arrow" name="arrowUpRight" size={14} />
          </Link>
        ))}
      </section>

      <div className="dash-columns">
        <section className="dash-recent" aria-labelledby="recent-heading">
          <header className="dash-section-head">
            <div>
              <p className="eyebrow">Lately</p>
              <h2 id="recent-heading">In your journal</h2>
            </div>
            <Link className="dash-text-link" to="/app/journal">
              Open the journal
              <Icon name="arrowRight" size={15} />
            </Link>
          </header>

          {journalState === 'loading' && (
            <div className="dash-entries dash-entries--loading" aria-hidden="true">
              <div className="dash-skeleton" />
              <div className="dash-skeleton" />
              <div className="dash-skeleton" />
            </div>
          )}

          {journalState === 'error' && (
            <Alert variant="error" title="We couldn’t load your recent entries">
              Your journal is still safe. Try again, or open the journal directly.
              <div className="alert__actions">
                <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              </div>
            </Alert>
          )}

          {journalState === 'ready' && recentEntries.length === 0 && (
            <EmptyState
              icon="pen"
              title="Your first page is waiting"
              description="Write one honest sentence about today. It doesn’t need to be more than that."
              actions={
                <Link className="btn" to="/app/journal?new=1">
                  Write your first entry
                </Link>
              }
            />
          )}

          {journalState === 'ready' && recentEntries.length > 0 && (
            <ul className="dash-entries">
              {recentEntries.map((entry) => (
                <li key={entry.id}>
                  <Link className="dash-entry" to={`/app/journal?edit=${entry.id}`}>
                    <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                    <h3>{entry.title || 'Untitled entry'}</h3>
                    {entry.text && <p>{shortExcerpt(entry.text)}</p>}
                    <span className="dash-entry__open">
                      Open entry
                      <Icon name="arrowRight" size={14} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="dash-side">
          <section className="dash-media" aria-labelledby="dash-media-heading">
            <header className="dash-section-head dash-section-head--compact">
              <h2 id="dash-media-heading">Recently kept</h2>
              <Link className="dash-mini-link" to="/app/media">
                Gallery
                <Icon name="arrowRight" size={13} />
              </Link>
            </header>

            {recentMedia.length > 0 ? (
              <ul className="dash-media__grid">
                {recentMedia.map((item) => (
                  <li key={item.id}>
                    <Link
                      to="/app/media"
                      aria-label={`Open the media library — ${item.prompt || `image ${item.id}`}`}
                    >
                      <MediaImage
                        src={item.file}
                        alt={item.prompt || `Media ${item.id}`}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-media__empty">
                {loading
                  ? 'Looking for recent images…'
                  : 'No images yet. Add a photograph or generate an illustration in the media library.'}
              </p>
            )}
          </section>

          <section className="dash-shortcuts" aria-labelledby="shortcuts-heading">
            <header className="dash-section-head dash-section-head--compact">
              <h2 id="shortcuts-heading">Keep going</h2>
            </header>
            <ul>
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.to}>
                  <Link to={shortcut.to}>
                    <span className="dash-shortcut__icon" aria-hidden="true">
                      <Icon name={shortcut.icon} size={17} />
                    </span>
                    <span>
                      <strong>{shortcut.label}</strong>
                      <small>{shortcut.note}</small>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
