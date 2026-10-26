import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { StatusBadge } from '../../../components/StatusBadge'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError } from '../../../services/errors'
import { formatDateTime } from '../../../utils/format'
import { useAuth } from '../../auth/useAuth'
import { adminUsersApi } from '../adminUsersApi'
import type { AdminUser, AdminUserUpdate } from '../types'
import '../admin.css'

function messageOf(error: unknown): string {
  const { detail, formErrors, fieldErrors } = normalizeApiError(error)
  return (
    detail ??
    formErrors[0] ??
    Object.values(fieldErrors)[0]?.[0] ??
    'Something went wrong. Please try again.'
  )
}

const EMPTY_DRAFT: AdminUserUpdate = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  is_active: true,
  is_staff: false,
}

function draftFrom(user: AdminUser): AdminUserUpdate {
  return {
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    is_staff: user.is_staff,
  }
}

function fullName(user: AdminUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ')
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AdminUsersPage() {
  useDocumentTitle('Users · MEMORA')
  const { user: currentUser } = useAuth()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<AdminUserUpdate>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setUsers(await adminUsersApi.list())
    } catch (error) {
      setLoadError(messageOf(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(user: AdminUser) {
    setEditingId(user.id)
    setDraft(draftFrom(user))
    setActionError(null)
    setFieldErrors({})
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setFieldErrors({})
  }

  function updateDraft(patch: Partial<AdminUserUpdate>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingId === null) {
      return
    }

    setSaving(true)
    setActionError(null)
    setFieldErrors({})
    try {
      await adminUsersApi.update(editingId, draft)
      await load()
      cancelEdit()
    } catch (error) {
      const normalized = normalizeApiError(error)
      setFieldErrors(normalized.fieldErrors)
      setActionError(normalized.detail ?? normalized.formErrors[0] ?? null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)
    setActionError(null)
    try {
      await adminUsersApi.remove(deleteTarget.id)
      if (editingId === deleteTarget.id) {
        cancelEdit()
      }
      setDeleteTarget(null)
      await load()
    } catch (error) {
      setActionError(messageOf(error))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Staff console"
        title="Users"
        description="Edit account details, privileges, or delete an account."
        badge={<StatusBadge status="processing">Staff area</StatusBadge>}
        actions={
          <Link className="btn btn--secondary btn--sm" to="/admin">
            <Icon name="arrowLeft" size={15} />
            Admin overview
          </Link>
        }
      />

      {actionError && (
        <Alert variant="error" title="The action failed">
          {actionError}
        </Alert>
      )}

      {loading && <LoadingState label="Loading users…" />}

      {!loading && loadError && (
        <div className="admin-error">
          <Alert variant="error" title="Could not load users">
            {loadError}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            <Icon name="refresh" size={15} />
            Try again
          </Button>
        </div>
      )}

      {!loading && !loadError && users.length === 0 && (
        <EmptyState title="No users" description="No account exists yet." icon="users" />
      )}

      {!loading && !loadError && users.length > 0 && (
        <>
          <div className="admin-table-meta">
            <p className="eyebrow">Accounts</p>
            <p className="admin-count">
              <Icon name="users" size={13} />
              {users.length} account{users.length > 1 ? 's' : ''}
            </p>
          </div>

          <div
            className="admin-table-wrap"
            role="region"
            aria-label="User accounts"
            tabIndex={0}
          >
            <table className="admin-table">
              <caption className="sr-only">MEMORA user accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Email</th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <Fragment key={account.id}>
                    <tr className={editingId === account.id ? 'admin-table__row--editing' : undefined}>
                      <td>
                        <div className="admin-user">
                          <span className="admin-user__avatar" aria-hidden="true">
                            {initials(account.username)}
                          </span>
                          <span className="admin-user__id">
                            <strong>{account.username}</strong>
                            {currentUser?.id === account.id && (
                              <span className="admin-you">You</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        {account.email ? (
                          <a className="admin-table__mail" href={`mailto:${account.email}`}>
                            {account.email}
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{fullName(account) || <span className="muted">—</span>}</td>
                      <td>
                        <div className="admin-status">
                          <StatusBadge status={account.is_active ? 'succeeded' : 'failed'}>
                            {account.is_active ? 'Active' : 'Inactive'}
                          </StatusBadge>
                          {account.is_staff && (
                            <StatusBadge status="processing">Staff</StatusBadge>
                          )}
                        </div>
                      </td>
                      <td className="admin-table__date">{formatDateTime(account.date_joined)}</td>
                      <td>
                        <span className="admin-table__actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            aria-label={`Edit ${account.username}`}
                            onClick={() => startEdit(account)}
                          >
                            <Icon name="edit" size={14} />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={deleting}
                            aria-label={`Delete ${account.username}`}
                            onClick={() => setDeleteTarget(account)}
                          >
                            <Icon name="trash" size={14} />
                            Delete
                          </Button>
                        </span>
                      </td>
                    </tr>

                    {editingId === account.id && (
                      <tr className="admin-table__edit-row">
                        <td colSpan={6}>
                          <form
                            className="admin-table__form"
                            onSubmit={(event) => void handleSave(event)}
                            noValidate
                          >
                            <div className="admin-table__form-head">
                              <span className="admin-table__form-icon" aria-hidden="true">
                                <Icon name="edit" size={18} />
                              </span>
                              <div>
                                <h3>Editing {account.username}</h3>
                                <p>Changes apply as soon as you save.</p>
                              </div>
                            </div>

                            <div className="admin-table__form-grid">
                              <FormField
                                label="Username"
                                required
                                error={fieldErrors.username?.[0]}
                              >
                                {(field) => (
                                  <TextInput
                                    {...field}
                                    name="username"
                                    value={draft.username}
                                    onChange={(event) =>
                                      updateDraft({ username: event.target.value })
                                    }
                                    required
                                  />
                                )}
                              </FormField>

                              <FormField label="Email" error={fieldErrors.email?.[0]}>
                                {(field) => (
                                  <TextInput
                                    {...field}
                                    name="email"
                                    type="email"
                                    value={draft.email}
                                    onChange={(event) =>
                                      updateDraft({ email: event.target.value })
                                    }
                                  />
                                )}
                              </FormField>

                              <FormField label="First name" error={fieldErrors.first_name?.[0]}>
                                {(field) => (
                                  <TextInput
                                    {...field}
                                    name="first_name"
                                    value={draft.first_name}
                                    onChange={(event) =>
                                      updateDraft({ first_name: event.target.value })
                                    }
                                  />
                                )}
                              </FormField>

                              <FormField label="Last name" error={fieldErrors.last_name?.[0]}>
                                {(field) => (
                                  <TextInput
                                    {...field}
                                    name="last_name"
                                    value={draft.last_name}
                                    onChange={(event) =>
                                      updateDraft({ last_name: event.target.value })
                                    }
                                  />
                                )}
                              </FormField>
                            </div>

                            <fieldset className="admin-table__flags">
                              <legend>Access</legend>
                              <label className="admin-table__check">
                                <input
                                  type="checkbox"
                                  name="is_active"
                                  checked={draft.is_active}
                                  onChange={(event) =>
                                    updateDraft({ is_active: event.target.checked })
                                  }
                                />
                                <span>Active</span>
                              </label>
                              <label className="admin-table__check">
                                <input
                                  type="checkbox"
                                  name="is_staff"
                                  checked={draft.is_staff}
                                  onChange={(event) =>
                                    updateDraft({ is_staff: event.target.checked })
                                  }
                                />
                                <span>Staff</span>
                              </label>
                            </fieldset>

                            <div className="admin-table__form-actions">
                              <Button type="submit" disabled={saving}>
                                <Icon name="check" size={15} />
                                {saving ? 'Saving…' : 'Save'}
                              </Button>
                              <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete “${deleteTarget.username}”?` : 'Delete account?'}
        message="Their people, photos and faces are deleted too. This cannot be undone."
        confirmLabel="Delete user"
        cancelLabel="Cancel"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}
