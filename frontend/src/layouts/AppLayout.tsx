import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { Alert } from '../components/Alert'
import { Brand } from '../components/Brand'
import { Button } from '../components/Button'
import { SkipLink } from '../components/SkipLink'
import { useAuth } from '../features/auth/useAuth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { normalizeApiError } from '../services/errors'

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/journal', label: 'Journal', end: false },
  { to: '/app/audio', label: 'Audio', end: false },
  { to: '/app/summaries', label: 'Summaries', end: false },
  { to: '/app/media', label: 'Media', end: false },
  { to: '/app/people', label: 'People', end: false },
]

const ACCOUNT_ITEMS = [
  { to: '/app/account', label: 'My Account', muted: false },
  { to: '/admin', label: 'Admin', muted: true },
]

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'side-nav__link side-nav__link--active' : 'side-nav__link'
}

function accountLinkClass({ isActive }: { isActive: boolean }): string {
  return ['side-nav__link', 'side-nav__link--muted', isActive ? 'side-nav__link--active' : null]
    .filter(Boolean)
    .join(' ')
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="app-sidebar__brand">
        <Brand to="/app" />
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary">
        <p className="side-nav__section" id="nav-modules-heading">
          Modules
        </p>
        <ul className="side-nav" aria-labelledby="nav-modules-heading">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="app-sidebar__foot">
        <p className="side-nav__section" id="nav-account-heading">
          Account
        </p>
        <ul className="side-nav" aria-labelledby="nav-account-heading">
          {ACCOUNT_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={item.muted ? accountLinkClass : navLinkClass}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 900px)')
  const location = useLocation()

  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  async function handleLogout() {
    setLogoutError(null)
    try {
      await logout()
    } catch (error) {
      const { detail, formErrors } = normalizeApiError(error)
      setLogoutError(detail ?? formErrors[0] ?? 'We couldn’t sign you out. Please try again.')
    }
  }

  // Close the drawer on navigation or when the viewport becomes desktop-sized.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, isDesktop])

  // Move focus into the drawer on open; Escape closes it and restores focus.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    drawerRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <div className="layout-app">
      <SkipLink />

      {isDesktop && (
        <aside className="app-sidebar" aria-label="Sidebar">
          <SidebarContent />
        </aside>
      )}

      {!isDesktop && menuOpen && (
        <>
          <button
            type="button"
            className="app-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="app-sidebar"
            ref={drawerRef}
            tabIndex={-1}
            className="app-sidebar app-sidebar--drawer"
            aria-label="Sidebar"
          >
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </aside>
        </>
      )}

      <div className="app-column">
        <header className="app-topbar">
          <div className="container app-topbar__inner">
            {!isDesktop && (
              <button
                type="button"
                ref={menuButtonRef}
                className="btn btn--secondary btn--sm app-topbar__menu"
                aria-expanded={menuOpen}
                aria-controls="app-sidebar"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                Menu
              </button>
            )}

            {!isDesktop && (
              <div className="app-topbar__brand">
                <Brand to="/app" />
              </div>
            )}

            <div className="app-topbar__spacer" />

            <div className="app-topbar__account">
              {user && (
                <Link to="/app/account" className="app-user__name app-user__link">
                  {user.username}
                </Link>
              )}
              <Button variant="secondary" size="sm" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </div>
          </div>
        </header>

        {logoutError && (
          <div className="container app-notice">
            <Alert variant="error" title="We couldn’t sign you out">
              {logoutError}
            </Alert>
          </div>
        )}

        <main id="main" className="app-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
