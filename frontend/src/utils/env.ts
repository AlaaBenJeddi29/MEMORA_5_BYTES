/**
 * Base URL of the backend API, without a trailing slash.
 *
 * - Unset `VITE_API_BASE_URL` → safe local default `http://127.0.0.1:8000`.
 * - Explicit `VITE_API_BASE_URL=` (empty) → same origin as the app (proxy setup).
 */
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(
  /\/+$/,
  '',
)
