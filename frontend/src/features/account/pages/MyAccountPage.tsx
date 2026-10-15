import { Alert } from '../../../components/Alert'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'

/** Renders "Not set" for empty string fields rather than a blank row. */
function DetailValue({ value }: { value: string }) {
  return value.trim() ? <>{value}</> : <span className="muted">Not set</span>
}

export function MyAccountPage() {
  useDocumentTitle('My account · MEMORA')
  const { user } = useAuth()

  // RequireAuth only renders this page for an authenticated session, so `user`
  // is normally present; guard anyway rather than asserting non-null.
  if (!user) {
    return <p className="muted">We couldn’t load your account details.</p>
  }

  return (
    <>
      <PageHeader
        title="My account"
        description="The details tied to your MEMORA session."
        badge={<StatusBadge status="neutral">Read-only</StatusBadge>}
      />

      <div className="stack">
        <Alert variant="info" title="Editing isn’t available yet">
          These details come straight from <code>GET /api/accounts/me/</code>. MEMORA has no
          endpoint to update an account yet, so there is nothing to edit here — profile editing
          will appear once the backend adds it (see <code>docs/API_CONTRACT.md</code> §3.1).
        </Alert>

        <section aria-labelledby="account-details-heading">
          <h2 id="account-details-heading">Account details</h2>

          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>Username</dt>
              <dd>{user.username}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Email</dt>
              <dd>
                <DetailValue value={user.email} />
              </dd>
            </div>
            <div className="detail-list__row">
              <dt>First name</dt>
              <dd>
                <DetailValue value={user.first_name} />
              </dd>
            </div>
            <div className="detail-list__row">
              <dt>Last name</dt>
              <dd>
                <DetailValue value={user.last_name} />
              </dd>
            </div>
            <div className="detail-list__row">
              <dt>Member since</dt>
              <dd>{formatDateTime(user.date_joined)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
