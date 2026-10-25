/**
 * Base URL of the backend API, without a trailing slash.
 *
 * - Unset `VITE_API_BASE_URL` → same origin. In development the Vite proxy
 *   forwards `/api` and `/media` to Django; in a same-origin deployment the
 *   reverse proxy does the same.
 * - Set it to an absolute URL only when the API is hosted on another origin.
 */
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
