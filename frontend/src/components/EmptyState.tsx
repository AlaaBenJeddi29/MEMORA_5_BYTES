import type { ReactNode } from 'react'

export type EmptyStateProps = {
  title: string
  description?: string
  /** Optional actions, e.g. a link or button. */
  actions?: ReactNode
}

/** A neutral placeholder for areas with no content yet. */
export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h2 className="empty-state__title">{title}</h2>
      {description && <p className="empty-state__text">{description}</p>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  )
}
