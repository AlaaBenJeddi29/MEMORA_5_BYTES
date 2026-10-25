/** Error thrown for any non-2xx API response, carrying the status and body. */
export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export interface NormalizedErrors {
  /** DRF field errors, keyed by field name. */
  fieldErrors: Record<string, string[]>
  /** General (non-field) error messages. */
  formErrors: string[]
  /** A top-level `detail` message, when present. */
  detail?: string
}

/**
 * Turns any thrown value into a predictable shape the forms can render,
 * handling the three DRF error bodies: field-keyed, `non_field_errors`, `detail`.
 */
export function normalizeApiError(error: unknown): NormalizedErrors {
  if (error instanceof ApiError) {
    return fromBody(error.data, error.status)
  }
  if (isNetworkError(error)) {
    return {
      fieldErrors: {},
      formErrors: ['We couldn’t reach the server. Check your connection and try again.'],
    }
  }
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Something went wrong. Please try again.'
  return { fieldErrors: {}, formErrors: [message] }
}

/**
 * `fetch` rejects with a `TypeError` on network/DNS/CORS failure (no response
 * was received), which is distinct from an HTTP error response.
 */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
}

function fromBody(data: unknown, status: number): NormalizedErrors {
  if (typeof data === 'string' && data.trim()) {
    // Proxies and debug pages can return HTML or plain text for 5xx responses.
    // Never render that raw body; it may contain internal implementation details.
    return {
      fieldErrors: {},
      formErrors: [status >= 500 ? defaultMessage(status) : data],
    }
  }

  if (Array.isArray(data)) {
    return { fieldErrors: {}, formErrors: data.map((item) => toMessage(item)) }
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const fieldErrors: Record<string, string[]> = {}
    const formErrors: string[] = []
    let detail: string | undefined

    for (const [key, value] of Object.entries(record)) {
      const messages = toMessages(value)
      if (messages.length === 0) {
        continue
      }
      if (key === 'detail') {
        detail = messages[0]
        continue
      }
      if (key === 'non_field_errors') {
        formErrors.push(...messages)
        continue
      }
      fieldErrors[key] = messages
    }

    if (!detail && formErrors.length === 0 && Object.keys(fieldErrors).length === 0) {
      formErrors.push(defaultMessage(status))
    }

    return { fieldErrors, formErrors, detail }
  }

  return { fieldErrors: {}, formErrors: [defaultMessage(status)] }
}

function toMessages(value: unknown): string[] {
  if (value === null || value === undefined) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map((item) => toMessage(item))
  }
  return [toMessage(value)]
}

function toMessage(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function defaultMessage(status: number): string {
  if (status === 403) {
    return 'You are not signed in, or you do not have access.'
  }
  if (status === 404) {
    return 'That resource could not be found.'
  }
  if (status >= 500) {
    return 'The server ran into a problem. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}
