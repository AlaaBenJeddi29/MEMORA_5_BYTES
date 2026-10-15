import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const highlights = [
  { title: 'Text journal', body: 'Capture thoughts as written entries.' },
  { title: 'Voice memos', body: 'Record and keep audio moments.' },
  { title: 'Photos & video', body: 'A private media library.' },
  { title: 'People', body: 'Remember who shares your days.' },
]

export function HomePage() {
  useDocumentTitle('MEMORA')
  const { status } = useAuth()
  const authenticated = status === 'authenticated'

  return (
    <section className="hero" aria-labelledby="home-heading">
      <p className="hero__eyebrow">Private · Personal · Yours</p>
      <h1 id="home-heading">A quiet place for your memories</h1>
      <p className="lead">
        MEMORA is a private, multimodal personal journal — text, voice, photos, and the people in
        your life, kept together and away from everyone else.
      </p>

      <div className="hero__actions">
        {authenticated ? (
          <Link className="btn btn--primary" to="/app">
            Open your journal
          </Link>
        ) : (
          <>
            <Link className="btn btn--primary" to="/register">
              Create an account
            </Link>
            <Link className="btn btn--secondary" to="/login">
              Sign in
            </Link>
          </>
        )}
      </div>

      <ul className="hero__points">
        {highlights.map((item) => (
          <li className="hero__point" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
