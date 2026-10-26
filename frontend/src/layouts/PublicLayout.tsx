import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { SkipLink } from '../components/SkipLink'
import { useAuth } from '../features/auth/useAuth'
import '../styles/landing.css'

const NAV_LINKS = [
  { href: '/#journal', label: 'Journal' },
  { href: '/#voice', label: 'Voice' },
  { href: '/#reflections', label: 'Reflections' },
  { href: '/#gallery', label: 'Gallery' },
  { href: '/#privacy', label: 'Privacy' },
]

export function PublicLayout() {
  const { status } = useAuth()
  const authenticated = status === 'authenticated'
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <div className="layout">
      <SkipLink />

      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />

          <nav className="site-header__links" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link className="site-header__link" to={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="site-header__nav">
            {authenticated ? (
              <Link className="btn btn--primary btn--sm" to="/app">
                Open your journal
                <Icon name="arrowRight" size={15} />
              </Link>
            ) : (
              <>
                <Link className="site-header__signin" to="/login">
                  Sign in
                </Link>
                <Link className="btn btn--primary btn--sm" to="/register">
                  Begin your journal
                </Link>
              </>
            )}
            <button
              type="button"
              className="site-header__toggle"
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="site-menu" id="site-menu">
            <nav className="container site-menu__inner" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <Link className="site-menu__link" to={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
              <div className="site-menu__auth">
                {authenticated ? (
                  <Link className="btn btn--primary btn--block" to="/app">
                    Open your journal
                  </Link>
                ) : (
                  <>
                    <Link className="btn btn--secondary btn--block" to="/login">
                      Sign in
                    </Link>
                    <Link className="btn btn--primary btn--block" to="/register">
                      Begin your journal
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer site-footer--rich">
        <div className="container">
          <div className="site-footer__grid">
            <div className="site-footer__brand">
              <Brand />
              <p>
                A private, multimodal journal for the words, voices, faces and images that make a
                life. One account, one audience — you.
              </p>
            </div>

            <nav className="site-footer__col" aria-label="Journal modules">
              <h2>Your pages</h2>
              <ul>
                <li>
                  <Link to="/#journal">Written journal</Link>
                </li>
                <li>
                  <Link to="/#voice">Voice memos</Link>
                </li>
                <li>
                  <Link to="/#reflections">AI reflections</Link>
                </li>
                <li>
                  <Link to="/#gallery">Media library</Link>
                </li>
                <li>
                  <Link to="/#people">People</Link>
                </li>
              </ul>
            </nav>

            <nav className="site-footer__col" aria-label="Account">
              <h2>Account</h2>
              <ul>
                {authenticated ? (
                  <li>
                    <Link to="/app">Open your journal</Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link to="/login">Sign in</Link>
                    </li>
                    <li>
                      <Link to="/register">Create an account</Link>
                    </li>
                  </>
                )}
                <li>
                  <Link to="/#privacy">How privacy works</Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="site-footer__bottom">
            <p>© {new Date().getFullYear()} MEMORA. A quiet place for your memories.</p>
            <p className="site-footer__note">
              Django · React · Local illustrations via your own ComfyUI
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
