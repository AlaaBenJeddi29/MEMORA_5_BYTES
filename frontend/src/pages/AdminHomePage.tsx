import { Link } from 'react-router-dom'

import { Alert } from '../components/Alert'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { apiBaseUrl } from '../utils/env'

const djangoAdminUrl = `${apiBaseUrl}/admin/`

/** Staff-only administration entry point. Real permissions are enforced by the API. */
export function AdminHomePage() {
  useDocumentTitle('Admin · MEMORA')
  const { user } = useAuth()

  return (
    <>
      <PageHeader
        title="Administration"
        description="Manage MEMORA accounts here; everything else stays in Django admin."
        badge={<StatusBadge status="processing">Staff only</StatusBadge>}
      />

      <div className="stack">
        <Alert variant="info" title="Staff area">
          You are signed in{user ? ` as ${user.username}` : ''}. Only staff accounts can open this
          page, and the API enforces the same rule.
        </Alert>

        <ul className="admin-tools">
          <li className="admin-tool">
            <div>
              <h2 className="admin-tool__title">Users</h2>
              <p className="admin-tool__text">
                Edit usernames, emails, names, active/staff flags, or delete an account.
              </p>
            </div>
            <div className="admin-tool__action">
              <Link className="btn btn--primary btn--sm" to="/admin/users">
                Manage users
              </Link>
            </div>
          </li>

          <li className="admin-tool">
            <div>
              <h2 className="admin-tool__title">Django admin</h2>
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
              </a>
            </div>
          </li>
        </ul>

        <p className="muted">
          You cannot delete your own account or the last superuser. Deleting a user also removes
          their people, photos and faces.
        </p>
      </div>
    </>
  )
}
