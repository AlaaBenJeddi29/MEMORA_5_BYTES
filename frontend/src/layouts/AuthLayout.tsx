import { Link, Outlet } from 'react-router-dom'

import dawnLake from '../assets/art/dawn-lake.webp'
import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { SkipLink } from '../components/SkipLink'
import '../styles/auth.css'

export function AuthLayout() {
  return (
    <div className="auth-shell">
      <SkipLink />

      <aside className="auth-visual">
        <img
          className="auth-visual__image"
          src={dawnLake}
          alt="Watercolour illustration of a rowing boat on a misty lake at first light."
        />
        <div className="auth-visual__veil" aria-hidden="true" />

        <div className="auth-visual__top">
          <Brand to="/" />
          <Link className="auth-visual__home" to="/">
            <Icon name="arrowLeft" size={15} />
            Back home
          </Link>
        </div>

        <div className="auth-visual__copy">
          <p className="auth-visual__eyebrow">MEMORA · Private by design</p>
          <p className="auth-visual__quote">
            Some days deserve more than a scroll.
          </p>
          <p className="auth-visual__text">
            Keep them as words, voices, photographs and the people who were there.
          </p>
        </div>

        <p className="auth-visual__caption">Illustration · a quiet lake at first light</p>
      </aside>

      <div className="auth-panel">
        <div className="auth-panel__inner">
          <div className="auth-panel__brand">
            <Brand to="/" />
          </div>

          <div className="auth-panel__body">
            <Outlet />
          </div>

          <footer className="auth-panel__foot">
            <p>
              <Icon name="lock" size={14} />
              One account, one audience — you.
            </p>
            <Link to="/#privacy">How privacy works</Link>
          </footer>
        </div>
      </div>
    </div>
  )
}
