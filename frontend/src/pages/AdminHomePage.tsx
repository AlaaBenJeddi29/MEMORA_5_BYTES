import { Link } from 'react-router-dom'

import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { apiBaseUrl } from '../utils/env'
import '../features/admin/admin.css'

const djangoAdminUrl = `${apiBaseUrl}/admin/`

/** Staff-only administration entry point. Real permissions are enforced by the API. */
export function AdminHomePage() {
  useDocumentTitle('Admin · MEMORA')
  const { user } = useAuth()

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Staff console"
        title="Administration"
        description="Manage MEMORA accounts here; everything else stays in Django admin."
        badge={<StatusBadge status="processing">Staff only</StatusBadge>}
        actions={
          <Link className="btn btn--secondary btn--sm" to="/app">
            <Icon name="arrowLeft" size={15} />
            Back to journal
          </Link>
        }
      />

      <Alert variant="info" title="Staff area">
        You are signed in{user ? ` as ${user.username}` : ''}. Only staff accounts can open this
        page, and the API enforces the same rule.
      </Alert>

      <section className="admin-tools-section" aria-labelledby="admin-tools-heading">
        <div className="admin-section-head">
          <div>
            <p className="eyebrow">Console</p>
            <h2 id="admin-tools-heading">Administration tools</h2>
          </div>
          <p className="admin-section-head__note">Staff permissions are checked server-side.</p>
        </div>

        <ul className="admin-tools">
          <li className="admin-tool">
            <span className="admin-tool__icon" aria-hidden="true">
              <Icon name="users" size={22} />
            </span>
            <div className="admin-tool__body">
              <h3 className="admin-tool__title">Users</h3>
              <p className="admin-tool__text">
                Edit usernames, emails, names, active/staff flags, or delete an account.
              </p>
            </div>
            <div className="admin-tool__action">
              <Link className="btn btn--primary btn--sm" to="/admin/users">
                Manage users
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </li>

          <li className="admin-tool">
            <span className="admin-tool__icon" aria-hidden="true">
              <Icon name="external" size={22} />
            </span>
            <div className="admin-tool__body">
              <h3 className="admin-tool__title">Django admin</h3>
              <p className="admin-tool__text">
                Full model administration (users, people, photos, faces) on the backend.
              </p>
            </div>
            <div className="admin-tool__action">
              <a
                className="btn btn--secondary btn--sm"
                href={djangoAdminUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Django admin
                <Icon name="external" size={14} />
              </a>
            </div>
          </li>
        </ul>
      </section>

      <aside className="admin-note" aria-labelledby="admin-note-heading">
        <span className="admin-note__icon" aria-hidden="true">
          <Icon name="shield" size={20} />
        </span>
        <div>
          <h2 id="admin-note-heading">Safety rules</h2>
          <p>
            You cannot delete your own account or the last superuser. Deleting a user also removes
            their people, photos and faces.
          </p>
        </div>
      </aside>
    </div>
  )
}
