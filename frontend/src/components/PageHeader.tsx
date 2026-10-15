import type { ReactNode } from 'react'

export type PageHeaderProps = {
  /** Rendered as the page's single `<h1>`. */
  title: string
  description?: string
  /** Optional status badge shown next to the title. */
  badge?: ReactNode
  /** Optional actions, e.g. a primary button. */
  actions?: ReactNode
}

/** Consistent page heading block: title, optional badge, description, actions. */
export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <div className="page-header__title-row">
          <h1 className="page-header__title">{title}</h1>
          {badge}
        </div>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
