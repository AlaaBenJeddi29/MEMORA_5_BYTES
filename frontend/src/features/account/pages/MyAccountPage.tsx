import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { authApi } from '../../../services/auth'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'
import '../account.css'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

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
  const { user, refresh } = useAuth()

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)

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
  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fieldErrors: Record<string, string[]> = {}
    if (!email.trim()) {
      fieldErrors.email = ['Email is required.']
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors({ fieldErrors, formErrors: [] })
      return
    }

    setSaving(true)
    setErrors(EMPTY_ERRORS)
    setNotice('')
    try {
      await authApi.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      })
      await refresh()
      setNotice('Profile updated.')
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="account-page">
      <PageHeader
        eyebrow="Your profile"
        title="My account"
        description="The details tied to your MEMORA session."
        badge={<StatusBadge status="neutral">{user.role_display}</StatusBadge>}
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
              {user.role_display}
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
              <dt>Email status</dt>
              <dd>{user.email_verified ? 'Verified' : 'Not verified'}</dd>
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
              <dt>Role</dt>
              <dd>{user.role_display}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Member since</dt>
              <dd>{formatDateTime(user.date_joined)}</dd>
            </div>
          </dl>

          <a className="btn btn--secondary btn--sm" href="/accounts/password/change/">
            <Icon name="lock" size={15} />
            Change password
          </a>
        </section>

        <section className="account-panel" aria-labelledby="account-edit-heading">
          <div className="account-panel__head">
            <span className="account-panel__icon account-panel__icon--round" aria-hidden="true">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h2 id="account-edit-heading">Edit profile</h2>
              <p>These changes apply only to your own account.</p>
            </div>
          </div>

          {notice && (
            <Alert variant="success" title="Saved">
              {notice}
            </Alert>
          )}

          {formMessages.length > 0 && (
            <Alert variant="error" title="We couldn’t save your profile">
              <ul className="alert__list">
                {formMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Alert>
          )}

          <form className="form" onSubmit={handleSave} noValidate>
            <FormField label="First name" error={errors.fieldErrors.first_name?.[0]}>
              {(field) => (
                <TextInput
                  {...field}
                  name="first_name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              )}
            </FormField>

            <FormField label="Last name" error={errors.fieldErrors.last_name?.[0]}>
              {(field) => (
                <TextInput
                  {...field}
                  name="last_name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="Email"
              hint="Changing it keeps the account verified."
              required
              error={errors.fieldErrors.email?.[0]}
            >
              {(field) => (
                <TextInput
                  {...field}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FormField>

            <Button type="submit" block disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </form>

          <ul className="account-note-list">
            <li>
              <Icon name="shield" size={15} />
              <span>Your session stays protected by Django authentication and CSRF checks.</span>
            </li>
            <li>
              <Icon name="lock" size={15} />
              <span>Your journal, media and people stay tied to this account.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
