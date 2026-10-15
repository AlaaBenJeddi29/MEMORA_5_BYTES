import type { LoginInput, RegisterInput, User } from '../types/auth'
import { apiRequest } from './apiClient'

/**
 * Accounts API — session authentication. These are the only endpoints that
 * exist today; see docs/API_CONTRACT.md §2.
 */
export const authApi = {
  /** GET /api/accounts/me/ — the current session's user (403 when signed out). */
  me: () => apiRequest<User>('/api/accounts/me/'),

  /** GET /api/accounts/csrf/ — ensures the `csrftoken` cookie is set. */
  csrf: () => apiRequest<{ detail: string }>('/api/accounts/csrf/'),

  /** POST /api/accounts/login/ — authenticate and start a session. */
  login: (input: LoginInput) =>
    apiRequest<User>('/api/accounts/login/', { method: 'POST', body: input }),

  /** POST /api/accounts/register/ — create a user (never grants privileges). */
  register: (input: RegisterInput) =>
    apiRequest<User>('/api/accounts/register/', { method: 'POST', body: input }),

  /** POST /api/accounts/logout/ — end the current session. */
  logout: () => apiRequest<void>('/api/accounts/logout/', { method: 'POST' }),
}
