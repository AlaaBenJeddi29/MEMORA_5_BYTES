import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { PasswordInput } from '../../../components/PasswordInput'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { useAuth } from '../useAuth'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

export function RegisterPage() {
  useDocumentTitle('Create account · MEMORA')
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [submitting, setSubmitting] = useState(false)

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
    if (!passwordConfirm) {
      fieldErrors.password_confirm = ['Please confirm your password.']
    } else if (password !== passwordConfirm) {
      fieldErrors.password_confirm = ['Passwords do not match.']
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors({ fieldErrors, formErrors: [] })
      return
    }

    setSubmitting(true)
    setErrors(EMPTY_ERRORS)
    try {
      await register({
        username,
        email: email || undefined,
        password,
        password_confirm: passwordConfirm,
      })
      navigate('/app', { replace: true })
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-card" aria-labelledby="register-heading">
      <h1 id="register-heading">Create your account</h1>
      <p className="muted">Your journal is private to you.</p>

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t create your account">
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

        <FormField label="Email" hint="Optional." error={errors.fieldErrors.email?.[0]}>
          {(field) => (
            <TextInput
              {...field}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Password" required error={errors.fieldErrors.password?.[0]}>
          {(field) => (
            <PasswordInput
              {...field}
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Confirm password" required error={errors.fieldErrors.password_confirm?.[0]}>
          {(field) => (
            <PasswordInput
              {...field}
              name="password_confirm"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          )}
        </FormField>

        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="auth-links muted">
        Already have an account? <Link to="/login">Sign in</Link>.
      </p>
    </section>
  )
}
