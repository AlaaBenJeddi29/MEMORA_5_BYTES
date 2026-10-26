import { Link, NavLink, Outlet } from 'react-router-dom'

import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { SkipLink } from '../components/SkipLink'
import '../features/admin/admin.css'

export function AdminLayout() {
  return (
    <div className="layout layout--admin">
      <SkipLink />

      <header className="admin-bar">
        <div className="container admin-bar__inner">
          <div className="admin-bar__left">
            <Brand to="/app" />
            <span className="admin-chip">
              <Icon name="shield" size={12} />
              Administration
            </span>
          </div>
          <nav aria-label="Admin">
            <ul className="admin-nav">
              <li>
                <NavLink
                  end
                  to="/admin"
                  className={({ isActive }) =>
                    isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
                  }
                >
                  <Icon name="home" size={15} />
                  Overview
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
                  }
                >
                  <Icon name="users" size={15} />
                  Users
                </NavLink>
              </li>
              <li>
                <Link className="admin-nav__link admin-nav__link--back" to="/app">
                  <Icon name="arrowLeft" size={15} />
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
