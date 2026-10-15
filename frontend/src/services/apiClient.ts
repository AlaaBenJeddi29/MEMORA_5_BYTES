import { apiBaseUrl } from '../utils/env'
import { getCsrfToken } from './csrf'
import { ApiError } from './errors'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_PATH = '/api/accounts/csrf/'

/** De-duplicates concurrent CSRF fetches while one is in flight. */
let csrfCookieRequest: Promise<unknown> | null = null

/**
 * Ensures a readable `csrftoken` cookie exists before an unsafe request.
 *
 * Django's CSRF endpoint sets the cookie as a side effect and does NOT return
 * the token in its body, so we re-read the cookie afterwards rather than
 * trusting the response payload.
 */
function ensureCsrfCookie(): Promise<unknown> {
  if (getCsrfToken()) {
    return Promise.resolve()
  }
  if (!csrfCookieRequest) {
    csrfCookieRequest = fetch(apiUrl(CSRF_PATH), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
      .catch(() => undefined)
      .finally(() => {
        csrfCookieRequest = null
      })
  }
  return csrfCookieRequest
}

export interface RequestOptions {
  method?: string
  /** Serialized as JSON unless it is already a FormData/BodyInit value. */
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

/** Builds an absolute URL for a path, unless it is already absolute. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalized}`
}

/**
 * Thin wrapper over `fetch` that always sends credentials (so the session
 * cookie travels) and adds the `X-CSRFToken` header on unsafe methods.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }

  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrfCookie()
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? parseJson(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, data)
  }

  return data as T
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
