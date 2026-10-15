import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { PasswordInput } from '../../../components/PasswordInput'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { safeRedirectPath } from '../../../utils/redirect'
import { useAuth } from '../useAuth'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

type LocationState = { from?: string }

export function LoginPage() {
  useDocumentTitle('Sign in · MEMORA')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = safeRedirectPath((location.state as LocationState | null)?.from)
  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fieldErrors: Record<string, string[]> = {}
    if (!username.trim()) {
      fieldErrors.username = ['Username is required.']
    }
    if (!password) {
      fieldErrors.password = ['Password is required.']
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors({ fieldErrors, formErrors: [] })
      return
    }

    setSubmitting(true)
    setErrors(EMPTY_ERRORS)
    try {
      await login({ username, password })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-heading">
      <h1 id="login-heading">Sign in</h1>
      <p className="muted">Welcome back. Sign in to reach your journal.</p>

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t sign you in">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <FormField label="Username" required error={errors.fieldErrors.username?.[0]}>
          {(field) => (
            <TextInput
              {...field}
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Password" required error={errors.fieldErrors.password?.[0]}>
          {(field) => (
            <PasswordInput
              {...field}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="auth-links muted">
        No account yet? <Link to="/register">Create one</Link>.
      </p>
    </section>
  )
}
