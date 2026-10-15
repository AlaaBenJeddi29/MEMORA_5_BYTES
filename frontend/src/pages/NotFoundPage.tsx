import { Link } from 'react-router-dom'

import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found · MEMORA')

  return (
    <div className="state-page">
      <p className="state-page__code" aria-hidden="true">
        404
      </p>
      <h1>Page not found</h1>
      <p className="muted">The page you were looking for doesn’t exist or has moved.</p>
      <div className="state-page__actions">
        <Link className="btn btn--primary" to="/">
          Go home
        </Link>
      </div>
    </div>
  )
}
