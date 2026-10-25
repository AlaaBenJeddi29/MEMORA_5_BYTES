import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import { FormField } from '../../../components/FormField'
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
  const [deletingId, setDeletingId] = useState<number | null>(null)

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

  async function handleDelete(user: AdminUser) {
    if (
      !window.confirm(
        `Delete “${user.username}”? Their people, photos and faces are deleted too.`,
      )
    ) {
      return
    }

    setDeletingId(user.id)
    setActionError(null)
    try {
      await adminUsersApi.remove(user.id)
      if (editingId === user.id) {
        cancelEdit()
      }
      await load()
    } catch (error) {
      setActionError(messageOf(error))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Edit account details, privileges, or delete an account."
        badge={<StatusBadge status="processing">Staff area</StatusBadge>}
      />

      {actionError && (
        <Alert variant="error" title="The action failed">
          {actionError}
        </Alert>
      )}

      {loading && <LoadingState label="Loading users…" />}

      {!loading && loadError && (
        <div className="stack">
          <Alert variant="error" title="Could not load users">
            {loadError}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !loadError && users.length === 0 && (
        <EmptyState title="No users" description="No account exists yet." />
      )}

      {!loading && !loadError && users.length > 0 && (
        <div className="admin-table-wrap">
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
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr>
                    <td>
                      <strong>{user.username}</strong>
                      {currentUser?.id === user.id && (
                        <span
                          className="badge badge--neutral"
                          style={{ marginInlineStart: 'var(--space-2)' }}
                        >
                          You
                        </span>
                      )}
                    </td>
                    <td>{user.email || <span className="muted">—</span>}</td>
                    <td>{fullName(user) || <span className="muted">—</span>}</td>
                    <td>
                      <span className="cluster">
                        <StatusBadge status={user.is_active ? 'succeeded' : 'failed'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                        {user.is_staff && <StatusBadge status="processing">Staff</StatusBadge>}
                      </span>
                    </td>
                    <td>{formatDateTime(user.date_joined)}</td>
                    <td>
                      <span className="admin-table__actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => startEdit(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deletingId === user.id}
                          onClick={() => void handleDelete(user)}
                        >
                          {deletingId === user.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </span>
                    </td>
                  </tr>

                  {editingId === user.id && (
                    <tr>
                      <td colSpan={6}>
                        <form
                          className="admin-table__form"
                          onSubmit={(event) => void handleSave(event)}
                          noValidate
                        >
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
                                  onChange={(event) => updateDraft({ username: event.target.value })}
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
                                  onChange={(event) => updateDraft({ email: event.target.value })}
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

                          <div className="admin-table__checks">
                            <label className="admin-table__check">
                              <input
                                type="checkbox"
                                name="is_active"
                                checked={draft.is_active}
                                onChange={(event) =>
                                  updateDraft({ is_active: event.target.checked })
                                }
                              />
                              Active
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
                              Staff
                            </label>
                          </div>

                          <div className="cluster">
                            <Button type="submit" disabled={saving}>
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
      )}
    </>
  )
}
