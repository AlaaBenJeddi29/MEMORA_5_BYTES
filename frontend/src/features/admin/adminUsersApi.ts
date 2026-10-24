import { apiRequest } from '../../services/apiClient'
import type { AdminUser, AdminUserUpdate } from './types'

/** Staff-only account management endpoints (403 for non-staff sessions). */
export const adminUsersApi = {
  list: () => apiRequest<AdminUser[]>('/api/accounts/users/'),

  update: (id: number, input: AdminUserUpdate) =>
    apiRequest<AdminUser>(`/api/accounts/users/${id}/`, { method: 'PATCH', body: input }),

  remove: (id: number) =>
    apiRequest<void>(`/api/accounts/users/${id}/`, { method: 'DELETE' }),
}
