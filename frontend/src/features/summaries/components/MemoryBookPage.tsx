import type { Summary } from '../../../types/summaries'
import { formatMemoryDate } from '../memoryBook'
import { SummaryAudioPlayer } from './SummaryAudioPlayer'

export interface MemoryBookPageProps {
  summary: Summary
  pageNumber: number
}

/** One dated memory rendered as a paper page. Missing fields stay hidden. */
export function MemoryBookPage({ summary, pageNumber }: MemoryBookPageProps) {
  const hasMood = Boolean(summary.mood)
  const hasThemes = summary.themes.length > 0
  const headingId = `memory-book-page-${summary.id}`

  return (
    <article className="memory-book__page" aria-labelledby={headingId}>
      <h2 className="memory-book__page-date" id={headingId}>
        <time dateTime={summary.created_at}>
          {formatMemoryDate(summary.created_at)}
        </time>
      </h2>
      <span className="memory-book__page-rule" aria-hidden="true" />

      <p className="memory-book__page-text">{summary.summary_text}</p>

      <div className="memory-book__page-audio">
        <SummaryAudioPlayer
          summaryId={summary.id}
          text={summary.summary_text}
        />
      </div>

      {(hasMood || hasThemes) && (
        <div className="memory-book__page-meta">
          {hasMood && (
            <span className="memory-book__mood">
              <span className="sr-only">Mood: </span>
              {summary.mood}
            </span>
          )}
          {hasThemes && (
            <ul
              className="memory-book__themes"
              aria-label={`Themes on page ${pageNumber}`}
            >
              {summary.themes.map((theme, index) => (
                <li className="memory-book__theme" key={`${theme}-${index}`}>
                  {theme}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <span className="memory-book__page-number" aria-hidden="true">
        {pageNumber}
      </span>
    </article>
  )
}
