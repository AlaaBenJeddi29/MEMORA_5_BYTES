import { useEffect, useState } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { companionApi } from '../../../services/companion'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import type { EmotionalPatterns as EmotionalPatternsData } from '../../../types/companion'

type PatternsStatus = 'loading' | 'ready' | 'error'

const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return value
  }
  return dayFormatter.format(new Date(year, month - 1, day))
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) {
    return value
  }
  return monthFormatter.format(new Date(year, month - 1, 1))
}

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  return messages.length > 0 ? messages : ['Something went wrong. Please try again.']
}

export function EmotionalPatterns() {
  const [status, setStatus] = useState<PatternsStatus>('loading')
  const [data, setData] = useState<EmotionalPatternsData | null>(null)
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setErrors(null)

    companionApi
      .patterns({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          return
        }
        setData(result)
        setStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        setErrors(normalizeApiError(error))
        setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [reloadKey])

  const errorMessages = messagesOf(errors)

  return (
    <aside
      className="companion-card companion-patterns"
      aria-labelledby="companion-patterns-heading"
    >
      <div className="companion-card__head">
        <span className="companion-card__mark companion-card__mark--sage" aria-hidden="true">
          <Icon name="wave" size={19} />
        </span>
        <div>
          <h2 id="companion-patterns-heading">Emotional patterns</h2>
          <p className="muted">
            Counts from the themes, moods, and dates you stored. No AI interpretation.
          </p>
        </div>
      </div>

      {status === 'loading' && <LoadingState label="Reading stored patterns…" />}

      {status === 'error' && (
        <Alert variant="error" title="We couldn’t load your patterns">
          <ul className="alert__list">
            {errorMessages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
          <div className="alert__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <Icon name="refresh" size={14} />
              Try again
            </Button>
          </div>
        </Alert>
      )}

      {status === 'ready' && data && !data.has_data && (
        <div className="companion-patterns__empty">
          <span aria-hidden="true">
            <Icon name="leaf" size={20} />
          </span>
          <p>Save a summary with a theme or a mood to see your stored patterns here.</p>
        </div>
      )}

      {status === 'ready' && data && data.has_data && (
        <>
          <p className="companion-patterns__summary">
            <strong>{data.total_summaries}</strong>{' '}
            {data.total_summaries === 1 ? 'summary' : 'summaries'}
            {data.period && (
              <>
                {' · '}
                {formatDay(data.period.start)} – {formatDay(data.period.end)}
              </>
            )}
          </p>

          {data.themes.length > 0 && (
            <section
              className="companion-patterns__section"
              aria-labelledby="patterns-themes-heading"
            >
              <h3 id="patterns-themes-heading">Frequent themes</h3>
              <ul className="pattern-counts">
                {data.themes.map((theme) => (
                  <li key={theme.name}>
                    <span>{theme.name}</span>
                    <span className="pattern-counts__count">
                      {theme.count}
                      <span className="sr-only">
                        {' '}
                        {theme.count === 1 ? 'summary' : 'summaries'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.moods.length > 0 && (
            <section
              className="companion-patterns__section"
              aria-labelledby="patterns-moods-heading"
            >
              <h3 id="patterns-moods-heading">Recorded moods</h3>
              <ul className="pattern-counts pattern-counts--moods">
                {data.moods.map((mood) => (
                  <li key={mood.name}>
                    <span>{mood.name}</span>
                    <span className="pattern-counts__count">
                      {mood.count}
                      <span className="sr-only">
                        {' '}
                        {mood.count === 1 ? 'summary' : 'summaries'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.months.length > 0 && (
            <section
              className="companion-patterns__section"
              aria-labelledby="patterns-months-heading"
            >
              <h3 id="patterns-months-heading">Month by month</h3>
              <ol className="pattern-months">
                {data.months.map((month) => {
                  const labels = [...month.themes, ...month.moods]
                  return (
                    <li key={month.month}>
                      <div className="pattern-month__top">
                        <span>{formatMonth(month.month)}</span>
                        <span className="pattern-counts__count">{month.count}</span>
                      </div>
                      {labels.length > 0 && <p>{labels.join(' · ')}</p>}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          <div className="companion-patterns__notes">
            <p>
              <Icon name="info" size={13} />
              {data.method}
            </p>
            <p className="muted">{data.limitations}</p>
          </div>
        </>
      )}
    </aside>
  )
}
