import { describe, expect, it } from 'vitest'

import { ApiError, normalizeApiError } from './errors'

describe('normalizeApiError', () => {
  it('maps DRF field errors keyed by field name', () => {
    const error = new ApiError(400, { username: ['This field is required.'] })

    expect(normalizeApiError(error)).toEqual({
      fieldErrors: { username: ['This field is required.'] },
      formErrors: [],
    })
  })

  it('maps non_field_errors into form errors', () => {
    const error = new ApiError(400, { non_field_errors: ['Invalid username or password.'] })

    expect(normalizeApiError(error)).toEqual({
      fieldErrors: {},
      formErrors: ['Invalid username or password.'],
    })
  })

  it('keeps a top-level detail message', () => {
    const error = new ApiError(403, { detail: 'CSRF Failed: CSRF token missing.' })

    expect(normalizeApiError(error).detail).toBe('CSRF Failed: CSRF token missing.')
  })

  it('never renders a raw non-JSON 5xx body', () => {
    const error = new ApiError(500, '<html>Traceback: SECRET internal path</html>')

    expect(normalizeApiError(error).formErrors).toEqual([
      'The server ran into a problem. Please try again.',
    ])
  })

  it('keeps a plain-text 4xx message', () => {
    const error = new ApiError(400, 'Choose a JPEG, PNG, or WebP image.')

    expect(normalizeApiError(error).formErrors).toEqual([
      'Choose a JPEG, PNG, or WebP image.',
    ])
  })

  it('falls back to a readable message for an empty body', () => {
    expect(normalizeApiError(new ApiError(403, null)).formErrors).toEqual([
      'You are not signed in, or you do not have access.',
    ])
  })

  it('treats non-ApiError values as a plain message', () => {
    expect(normalizeApiError(new Error('Network down')).formErrors).toEqual(['Network down'])
  })

  it('maps a fetch network failure (TypeError) to a friendly message', () => {
    expect(normalizeApiError(new TypeError('Failed to fetch')).formErrors).toEqual([
      'We couldn’t reach the server. Check your connection and try again.',
    ])
  })
})
