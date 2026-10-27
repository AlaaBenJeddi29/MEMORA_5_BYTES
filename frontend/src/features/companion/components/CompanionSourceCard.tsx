import { Link } from 'react-router-dom'

import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type { CompanionSource } from '../../../types/companion'
import { formatDateTime } from '../../../utils/format'

export interface CompanionSourceCardProps {
  source: CompanionSource
  onOpen: () => void
}

/** One owner-scoped summary that the answer actually used. */
export function CompanionSourceCard({ source, onOpen }: CompanionSourceCardProps) {
  const { summary } = source

  return (
    <li className="companion-source">
      <div className="companion-source__top">
        <time dateTime={summary.created_at}>{formatDateTime(summary.created_at)}</time>
        {summary.mood && (
          <span className="badge badge--neutral">
            <Icon name="leaf" size={12} />
            {summary.mood}
          </span>
        )}
      </div>

      <p className="companion-source__excerpt">“{source.excerpt}”</p>

      {summary.themes.length > 0 && (
        <ul className="tag-list" aria-label={`Themes for summary ${summary.id}`}>
          {summary.themes.map((theme, index) => (
            <li className="tag" key={`${theme}-${index}`}>
              {theme}
            </li>
          ))}
        </ul>
      )}

      <div className="companion-source__actions">
        <Button variant="secondary" size="sm" onClick={onOpen}>
          <Icon name="eye" size={14} />
          Open summary
        </Button>
        <Link
          className="btn btn--ghost btn--sm"
          to={`/app/summaries?book=1&summary=${summary.id}`}
        >
          <Icon name="book" size={14} />
          Open in memory book
        </Link>
      </div>
    </li>
  )
}
