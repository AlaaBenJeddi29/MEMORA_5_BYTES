import { Link, Outlet } from 'react-router-dom'

import { Brand } from '../components/Brand'
import { SkipLink } from '../components/SkipLink'

export function AdminLayout() {
  return (
    <div className="layout layout--admin">
      <SkipLink />

      <header className="admin-bar">
        <div className="container admin-bar__inner">
          <div className="admin-bar__left">
            <Brand to="/app" />
            <span className="admin-chip">Administration</span>
          </div>
          <nav aria-label="Admin">
            <ul className="nav">
              <li>
                <Link className="nav__link nav__link--on-dark" to="/admin">
                  Overview
                </Link>
              </li>
              <li>
                <Link className="nav__link nav__link--on-dark" to="/admin/users">
                  Users
                </Link>
              </li>
              <li>
                <Link className="nav__link nav__link--on-dark" to="/app">
                  Back to app
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="container layout__main admin-main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">MEMORA — a private, multimodal personal journal.</div>
      </footer>
    </div>
  )
}
