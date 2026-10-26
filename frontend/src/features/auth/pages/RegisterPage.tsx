import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { PasswordInput } from '../../../components/PasswordInput'
import { TextInput } from '../../../components/TextInput'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { authApi } from '../../../services/auth'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import type { RegisterResult } from '../../../types/auth'
import { useAuth } from '../useAuth'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

export function RegisterPage() {
  useDocumentTitle('Create account · MEMORA')
  const { register } = useAuth()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<RegisterResult | null>(null)
  const [resending, setResending] = useState(false)
  const [resendNotice, setResendNotice] = useState('')
  const [resendError, setResendError] = useState('')

  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fieldErrors: Record<string, string[]> = {}
    if (!username.trim()) {
      fieldErrors.username = ['Username is required.']
    }
    if (!email.trim()) {
      fieldErrors.email = ['Email is required — we send the verification link there.']
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
      const created = await register({
        username,
        email: email.trim(),
        password,
        password_confirm: passwordConfirm,
      })
      setResult(created)
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (!result) {
      return
    }
    setResending(true)
    setResendNotice('')
    setResendError('')
    try {
      await authApi.resendVerification(result.email)
      setResendNotice('A new verification link is on its way.')
    } catch (error) {
      const normalized = normalizeApiError(error)
      setResendError(normalized.detail ?? normalized.formErrors[0] ?? 'Please try again.')
    } finally {
      setResending(false)
    }
  }

  if (result) {
    return (
      <section className="auth-form" aria-labelledby="register-heading">
        <p className="eyebrow">Almost there</p>
        <h1 id="register-heading">Check your email</h1>
        <p className="auth-form__lede">
          Your account was created, but it stays inactive until you verify your
          address. We sent a link to <strong>{result.email}</strong>.
        </p>

        {!result.email_sent && (
          <Alert variant="error" title="The email could not be sent">
            Use the button below to try again, or contact the administrator.
          </Alert>
        )}

        {resendNotice && (
          <Alert variant="success" title="Verification email sent">
            {resendNotice}
          </Alert>
        )}
        {resendError && (
          <Alert variant="error" title="We couldn’t resend the email">
            {resendError}
          </Alert>
        )}

        <div className="form auth-form__fields">
          <Button type="button" block onClick={handleResend} disabled={resending}>
            {resending ? 'Sending…' : 'Resend verification email'}
          </Button>
        </div>

        <p className="auth-form__switch">
          Already verified? <Link to="/login">Sign in</Link>.
        </p>

        <p className="auth-form__note">
          <Icon name="shield" size={14} />
          The link expires in three days. Until then, no one can sign in to this
          account.
        </p>
      </section>
    )
  }

  return (
    <section className="auth-form" aria-labelledby="register-heading">
      <p className="eyebrow">Begin here</p>
      <h1 id="register-heading">Create your journal</h1>
      <p className="auth-form__lede">
        A private account for one. No feed, no followers — just the memories you choose to keep.
      </p>

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t create your account">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <form className="form auth-form__fields" onSubmit={handleSubmit} noValidate>
        <FormField label="Username" required error={errors.fieldErrors.username?.[0]}>
          {(field) => (
            <TextInput
              {...field}
              name="username"
              autoComplete="username"
              placeholder="Choose a username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Email"
          hint="We send the verification link to this address."
          required
          error={errors.fieldErrors.email?.[0]}
        >
          {(field) => (
            <TextInput
              {...field}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Password"
          hint="At least 10 characters. Avoid common words and your username."
          required
          error={errors.fieldErrors.password?.[0]}
        >
          {(field) => (
            <PasswordInput
              {...field}
              name="password"
              autoComplete="new-password"
              placeholder="Choose something only you know"
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
              placeholder="Type it once more"
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

      <p className="auth-form__switch">
        Already have an account? <Link to="/login">Sign in</Link>.
      </p>

      <p className="auth-form__note">
        <Icon name="shield" size={14} />
        Your journal, people and photos stay scoped to your account.
      </p>
    </section>
  )
}
