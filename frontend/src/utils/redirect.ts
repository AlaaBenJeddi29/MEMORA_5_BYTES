/**
 * Returns a safe in-app path for post-login redirects.
 *
 * Only same-origin absolute *paths* (starting with a single `/`) are allowed.
 * Absolute URLs (`https://evil.example`), protocol-relative paths
 * (`//evil.example`) and backslash tricks are rejected to prevent open
 * redirects. Falls back to `fallback` when the value is unusable.
 */
export function safeRedirectPath(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }
  if (value[0] !== '/' || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  return value
}
