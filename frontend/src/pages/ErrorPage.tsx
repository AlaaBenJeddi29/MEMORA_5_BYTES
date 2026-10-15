import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { Brand } from '../components/Brand'
import { Button } from '../components/Button'
import { SkipLink } from '../components/SkipLink'
import { StatusBadge } from '../components/StatusBadge'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function getErrorInfo(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    const detail =
      typeof error.data === 'string' && error.data.trim()
        ? error.data
        : 'This page could not be loaded.'
    return { title: `${error.status} ${error.statusText || 'Error'}`, detail }
  }

  const detail =
    import.meta.env.DEV && error instanceof Error
      ? error.message
      : 'An unexpected error occurred. You can try again, or head back home.'

  return { title: 'Something went wrong', detail }
}

/** Top-level error boundary rendered when a route fails to load or render. */
export function ErrorPage() {
  useDocumentTitle('Something went wrong · MEMORA')
  const error = useRouteError()
  const { title, detail } = getErrorInfo(error)

  return (
    <div className="layout layout--error">
      <SkipLink />

      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />
        </div>
      </header>

      <main id="main" className="container layout__main error-main" tabIndex={-1}>
        <div className="state-page">
          <StatusBadge status="failed">Error</StatusBadge>
          <h1>{title}</h1>
          <p className="muted">{detail}</p>
          <div className="state-page__actions">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Link className="btn btn--secondary" to="/">
              Go home
            </Link>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">MEMORA — a private, multimodal personal journal.</div>
      </footer>
    </div>
  )
}
