import { normalizeApiError } from '../../services/errors'

/** Pulls the most useful message out of any DRF error body for an inline alert. */
export function describeApiError(error: unknown): string {
  const { detail, formErrors, fieldErrors } = normalizeApiError(error)
  return (
    detail ??
    formErrors[0] ??
    Object.values(fieldErrors)[0]?.[0] ??
    'Une erreur est survenue. Veuillez réessayer.'
  )
}
