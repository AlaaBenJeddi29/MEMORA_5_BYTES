import { Alert } from '../components/Alert'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { apiBaseUrl } from '../utils/env'

const djangoAdminUrl = `${apiBaseUrl}/admin/`

const futureWork = [
  'Expose an admin role on GET /api/accounts/me/ (e.g. is_staff / is_superuser or a role field) so the SPA could tell who is an administrator.',
  'Add read-only admin REST endpoints (e.g. a paginated user list) if an in-app view is ever wanted, guarded by a server-side permission class such as IsAdminUser.',
  'Only then build a real in-app dashboard here — with data the backend actually returns.',
]

/**
 * Honest entry point for administration. It does NOT manage anything: real
 * user/model administration happens in Django's built-in admin, and this page
 * links there. There are no admin REST endpoints yet, so nothing is simulated.
 */
export function AdminHomePage() {
  useDocumentTitle('Admin · MEMORA')
  const { user } = useAuth()

  return (
    <>
      <PageHeader
        title="Administration"
        description="An entry point to MEMORA administration — not a management dashboard."
        badge={<StatusBadge status="neutral">Entry point</StatusBadge>}
      />

      <div className="stack">
        <Alert variant="info" title="Administration happens in Django admin">
          MEMORA uses Django’s built-in admin site for real user and data management. It runs on the
          backend at <code>{djangoAdminUrl}</code> and requires a <strong>staff</strong> account.
        </Alert>

        <p>
          <a className="btn btn--primary" href={djangoAdminUrl} target="_blank" rel="noreferrer">
            Open Django admin
          </a>
        </p>

        <Alert variant="warning" title="This page can’t verify admin access">
          You are signed in{user ? ` as ${user.username}` : ''}, but being signed in does not mean you
          are an administrator — and this app cannot tell. <code>GET /api/accounts/me/</code> returns
          only <code>id</code>, <code>username</code>, <code>email</code>, <code>first_name</code>,{' '}
          <code>last_name</code>, and <code>date_joined</code>; it does not include{' '}
          <code>is_staff</code> or <code>is_superuser</code>. So the SPA does not pretend to gate
          this page — Django enforces real access at its own admin login.
        </Alert>

        <div className="placeholder">
          <h2 id="future-work-heading">Future work: a custom React admin dashboard</h2>
          <p className="muted">
            There are no admin REST endpoints today, so an in-app dashboard could not show real
            data. Nothing here is simulated. Building one would first require:
          </p>
          <ul className="placeholder__endpoints">
            {futureWork.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="muted">
          For reference: public registration never grants privileges. New accounts are always
          created as regular users (<code>is_staff</code> / <code>is_superuser</code> are forced to{' '}
          <code>False</code>).
        </p>
      </div>
    </>
  )
}
