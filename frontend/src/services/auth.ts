import type {
  LoginInput,
  ProfileUpdateInput,
  RegisterInput,
  RegisterResult,
  User,
} from '../types/auth'
import { apiRequest } from './apiClient'

/**
 * Accounts API — session authentication; see docs/API_CONTRACT.md §2.
 */
export const authApi = {
  /** GET /api/accounts/me/ — the user, or 204 (null) when signed out. */
  me: () => apiRequest<User | null>('/api/accounts/me/'),

  /** GET /api/accounts/csrf/ — ensures the `csrftoken` cookie is set. */
  csrf: () => apiRequest<{ detail: string }>('/api/accounts/csrf/'),

  /** POST /api/accounts/login/ — authenticate and start a session. */
  login: (input: LoginInput) =>
    apiRequest<User>('/api/accounts/login/', { method: 'POST', body: input }),

  /**
   * POST /api/accounts/register/ — create an inactive account and email a
   * verification link. No session is started.
   */
  register: (input: RegisterInput) =>
    apiRequest<RegisterResult>('/api/accounts/register/', {
      method: 'POST',
      body: input,
    }),

  /** POST /api/accounts/resend-verification/ — re-send the link. */
  resendVerification: (email: string) =>
    apiRequest<{ detail: string }>('/api/accounts/resend-verification/', {
      method: 'POST',
      body: { email },
    }),

  /** PATCH /api/accounts/me/ — edit your own profile (never someone else's). */
  updateProfile: (input: ProfileUpdateInput) =>
    apiRequest<User>('/api/accounts/me/', { method: 'PATCH', body: input }),

  /** POST /api/accounts/logout/ — end the current session. */
  logout: () => apiRequest<void>('/api/accounts/logout/', { method: 'POST' }),
}
