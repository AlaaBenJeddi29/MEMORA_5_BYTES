import { Link } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import './state-page.css'

export function NotFoundPage() {
  useDocumentTitle('Page not found · MEMORA')

  return (
    <div className="container">
      <div className="state-page state-page--panel state-page--missing">
        <p className="state-page__code" aria-hidden="true">
          404
        </p>
        <span className="state-page__icon" aria-hidden="true">
          <Icon name="compass" size={26} />
        </span>
        <h1>Page not found</h1>
        <p className="muted state-page__detail">
          The page you were looking for doesn’t exist or has moved.
        </p>
        <div className="state-page__actions">
          <Link className="btn btn--primary" to="/">
            <Icon name="home" size={15} />
            Go home
          </Link>
          <Link className="btn btn--secondary" to="/#journal">
            Explore the journal
            <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}
