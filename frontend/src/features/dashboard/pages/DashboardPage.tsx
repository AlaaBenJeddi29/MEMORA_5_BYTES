import { Link } from 'react-router-dom'

import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'

const modules = [
  { to: '/app/journal', title: 'Journal', description: 'Write and revisit text entries.' },
  {
    to: '/app/audio',
    title: 'Audio & voice memos',
    description: 'Record and store voice memos.',
  },
  { to: '/app/summaries', title: 'Summaries', description: 'AI-generated recaps of your entries.' },
  {
    to: '/app/media',
    title: 'Media library',
    description: 'Photos and videos attached to your journal.',
  },
  { to: '/app/people', title: 'People', description: 'The people who appear in your entries.' },
]

export function DashboardPage() {
  useDocumentTitle('Dashboard · MEMORA')
  const { user } = useAuth()

  return (
    <>
      <PageHeader
        title={user ? `Hello, ${user.username}` : 'Hello'}
        description="Your private space. Choose a module to begin — each one is a shell until its backend API is implemented."
        badge={<StatusBadge status="neutral">Foundation</StatusBadge>}
        actions={
          <Link className="btn btn--secondary btn--sm" to="/app/account">
            My account
          </Link>
        }
      />

      <section aria-labelledby="modules-heading">
        <h2 id="modules-heading">Modules</h2>
        {user && <p className="muted">Member since {formatDateTime(user.date_joined)}.</p>}

        <ul className="card-grid">
          {modules.map((module) => (
            <li className="card" key={module.to}>
              <h3 className="card__title">
                <Link to={module.to}>{module.title}</Link>
              </h3>
              <p className="card__text">{module.description}</p>
              <div className="card__foot">
                <StatusBadge status="neutral">Not built yet</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
