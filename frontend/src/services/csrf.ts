/**
 * CSRF helpers.
 *
 * Django keeps `CSRF_COOKIE_HTTPONLY = False` by default, so the `csrftoken`
 * cookie is readable by JavaScript. We must echo it back in the `X-CSRFToken`
 * header on unsafe requests made while authenticated.
 *
 * Note: `document.cookie` only exposes cookies for the app's own origin. When
 * the API lives on a different origin (no proxy), the `csrftoken` cookie set by
 * the backend is not readable here — a same-origin dev proxy is the simple fix.
 */
export function getCookie(name: string): string | null {
  const prefix = `${name}=`
  const parts = document.cookie ? document.cookie.split('; ') : []
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length))
    }
  }
  return null
}

export function getCsrfToken(): string | null {
  return getCookie('csrftoken')
}
