import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { Alert } from '../components/Alert'
import { Brand } from '../components/Brand'
import { Icon, type IconName } from '../components/Icon'
import { SkipLink } from '../components/SkipLink'
import { useAuth } from '../features/auth/useAuth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { normalizeApiError } from '../services/errors'
import type { User } from '../types/auth'

const NAV_ITEMS: Array<{ to: string; label: string; end: boolean; icon: IconName }> = [
  { to: '/app', label: 'Dashboard', end: true, icon: 'home' },
  { to: '/app/journal', label: 'Journal', end: false, icon: 'book' },
  { to: '/app/audio', label: 'Voice memos', end: false, icon: 'mic' },
  { to: '/app/summaries', label: 'Reflections', end: false, icon: 'sparkles' },
  { to: '/app/media', label: 'Media library', end: false, icon: 'image' },
  { to: '/app/people', label: 'People', end: false, icon: 'users' },
]

const SECTION_LABELS: Record<string, string> = {
  '/app': 'Today',
  '/app/journal': 'Journal',
  '/app/audio': 'Voice memos',
  '/app/summaries': 'Reflections',
  '/app/media': 'Media library',
  '/app/people': 'People',
  '/app/account': 'My account',
}

function sectionLabel(pathname: string): string {
  if (SECTION_LABELS[pathname]) {
    return SECTION_LABELS[pathname]
  }
  if (pathname.startsWith('/app/people/photos')) {
    return 'My photos'
  }
  if (pathname.startsWith('/app/people/')) {
    return 'Album'
  }
  if (pathname.startsWith('/app')) {
    return 'Journal'
  }
  return 'Administration'
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'side-nav__link side-nav__link--active' : 'side-nav__link'
}

function accountLinkClass({ isActive }: { isActive: boolean }): string {
  return ['side-nav__link', isActive ? 'side-nav__link--active' : null].filter(Boolean).join(' ')
}

function initialsOf(username: string): string {
  const cleaned = username.trim()
  return cleaned ? cleaned.slice(0, 2).toUpperCase() : 'M'
}

function SidebarContent({
  user,
  onNavigate,
  onLogout,
}: {
  user: User | null
  onNavigate?: () => void
  onLogout: () => void
}) {
  const username = user?.username ?? 'Your account'

  return (
    <>
      <div className="app-sidebar__brand">
        <Brand to="/app" />
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary">
        <p className="side-nav__section" id="nav-modules-heading">
          Your journal
        </p>
        <ul className="side-nav" aria-labelledby="nav-modules-heading">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
                <Icon name={item.icon} size={17} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="app-sidebar__foot">
        <nav aria-label="Account">
          <p className="side-nav__section" id="nav-account-heading">
            Account
          </p>
          <ul className="side-nav" aria-labelledby="nav-account-heading">
            <li>
              <NavLink to="/app/account" onClick={onNavigate} className={accountLinkClass}>
                <Icon name="user" size={17} />
                My account
              </NavLink>
            </li>
            {user?.is_staff && (
              <li>
                <NavLink to="/admin" onClick={onNavigate} className={accountLinkClass}>
                  <Icon name="shield" size={17} />
                  Admin
                  <span className="side-nav__badge">Staff</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        <Link to="/app/account" className="app-profile" onClick={onNavigate}>
          <span className="avatar" aria-hidden="true">
            {initialsOf(username)}
          </span>
          <span className="app-profile__text">
            <span className="app-profile__name">{username}</span>
            <span className="app-profile__meta">Private journal</span>
          </span>
          <Icon name="chevronRight" size={15} />
        </Link>

        <button type="button" className="app-sidebar__logout" onClick={onLogout}>
          <Icon name="logout" size={16} />
          Sign out
        </button>
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

  const username = user?.username ?? 'Your account'
  const currentSection = sectionLabel(location.pathname)

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
          <SidebarContent user={user} onLogout={() => void handleLogout()} />
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
            <SidebarContent
              user={user}
              onNavigate={() => setMenuOpen(false)}
              onLogout={() => void handleLogout()}
            />
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
                className="icon-btn app-topbar__menu"
                aria-label="Open navigation menu"
                aria-expanded={menuOpen}
                aria-controls="app-sidebar"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Icon name="menu" size={19} />
              </button>
            )}

            {!isDesktop && (
              <div className="app-topbar__brand">
                <Brand to="/app" />
              </div>
            )}

            <p className="app-topbar__crumb">
              <span>MEMORA</span>
              <Icon name="chevronRight" size={13} />
              <strong>{currentSection}</strong>
            </p>

            <div className="app-topbar__spacer" />

            <div className="app-topbar__account">
              {user && (
                <Link to="/app/account" className="app-user" title={`Signed in as ${username}`}>
                  <span className="avatar" aria-hidden="true">
                    {initialsOf(username)}
                  </span>
                  <span className="app-user__name">{username}</span>
                </Link>
              )}
              <button
                type="button"
                className="app-topbar__signout"
                onClick={() => void handleLogout()}
              >
                Sign out
              </button>
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
