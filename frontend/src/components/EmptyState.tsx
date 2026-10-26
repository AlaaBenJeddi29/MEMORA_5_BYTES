import type { ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

export type EmptyStateProps = {
  title: string
  description?: string
  /** Optional actions, e.g. a link or button. */
  actions?: ReactNode
  /** Optional line icon shown above the title. */
  icon?: IconName
}

/** A neutral placeholder for areas with no content yet. */
export function EmptyState({ title, description, actions, icon = 'leaf' }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="empty-state__title">{title}</h2>
      {description && <p className="empty-state__text">{description}</p>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  )
}
