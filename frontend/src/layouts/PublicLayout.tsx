import { Link, Outlet } from 'react-router-dom'

import { Brand } from '../components/Brand'
import { SkipLink } from '../components/SkipLink'
import { useAuth } from '../features/auth/useAuth'

export function PublicLayout() {
  const { status } = useAuth()
  const authenticated = status === 'authenticated'

  return (
    <div className="layout">
      <SkipLink />

      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />
          <nav aria-label="Account">
            <ul className="nav">
              {authenticated ? (
                <li>
                  <Link className="nav__link" to="/app">
                    Open app
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link className="nav__link" to="/login">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link className="nav__link" to="/register">
                      Create account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="container layout__main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">MEMORA — a private, multimodal personal journal.</div>
      </footer>
    </div>
  )
}
