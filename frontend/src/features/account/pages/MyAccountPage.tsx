import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Icon } from '../../../components/Icon'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'
import '../account.css'

/** Renders "Not set" for empty string fields rather than a blank row. */
function DetailValue({ value }: { value: string }) {
  return value.trim() ? <>{value}</> : <span className="muted">Not set</span>
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function MyAccountPage() {
  useDocumentTitle('My account · MEMORA')
  const { user } = useAuth()

  // RequireAuth only renders this page for an authenticated session, so `user`
  // is normally present; guard anyway rather than asserting non-null.
  if (!user) {
    return (
      <div className="account-page">
        <Alert variant="error" title="Account unavailable">
          We couldn’t load your account details.
        </Alert>
      </div>
    )
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const displayName = fullName || user.username

  return (
    <div className="account-page">
      <PageHeader
        eyebrow="Your profile"
        title="My account"
        description="The details tied to your MEMORA session."
        badge={<StatusBadge status="neutral">Read-only</StatusBadge>}
        actions={
          <Link className="btn btn--secondary btn--sm" to="/app">
            <Icon name="arrowLeft" size={15} />
            Back to journal
          </Link>
        }
      />

      <section className="account-hero" aria-labelledby="account-identity-heading">
        <span className="account-hero__avatar" aria-hidden="true">
          {initials(displayName)}
        </span>

        <div className="account-hero__body">
          <p className="eyebrow">Signed in</p>
          <h2 id="account-identity-heading">{displayName}</h2>
          <p className="account-hero__handle">@{user.username}</p>
        </div>

        <dl className="account-hero__facts">
          <div>
            <dt>Member since</dt>
            <dd>{formatDateTime(user.date_joined)}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>
              <Icon name={user.is_staff ? 'shield' : 'user'} size={14} />
              {user.is_staff ? 'Staff' : 'Member'}
            </dd>
          </div>
        </dl>
      </section>

      <div className="account-grid">
        <section className="account-panel" aria-labelledby="account-details-heading">
          <div className="account-panel__head">
            <span className="account-panel__icon" aria-hidden="true">
              <Icon name="user" size={18} />
            </span>
            <div>
              <h2 id="account-details-heading">Account details</h2>
              <p>Straight from GET /api/accounts/me/.</p>
            </div>
          </div>

          <dl className="detail-list account-facts">
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

        <aside className="account-panel account-panel--note" aria-labelledby="account-editing-heading">
          <span className="account-panel__icon account-panel__icon--round" aria-hidden="true">
            <Icon name="lock" size={20} />
          </span>
          <h2 id="account-editing-heading">Editing isn’t available yet</h2>
          <p>
            MEMORA has no endpoint to update an account yet, so there is nothing to edit here.
            Profile editing will appear once the backend adds it (see{' '}
            <code>docs/API_CONTRACT.md</code> §3.1).
          </p>

          <ul className="account-note-list">
            <li>
              <Icon name="shield" size={15} />
              <span>Your session stays protected by Django authentication and CSRF checks.</span>
            </li>
            <li>
              <Icon name="lock" size={15} />
              <span>Your journal, media and people stay tied to this account.</span>
            </li>
            <li>
              <Icon name="heart" size={15} />
              <span>Nothing here is shared with other accounts.</span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
