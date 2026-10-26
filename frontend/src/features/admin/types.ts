/** A user row from the staff-only `/api/accounts/users/` endpoint. */
export interface AdminUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  is_staff: boolean
  date_joined: string
}

/** Editable fields accepted by `PATCH /api/accounts/users/<id>/`. */
export type AdminUserUpdate = Pick<
  AdminUser,
  'username' | 'email' | 'first_name' | 'last_name' | 'is_active' | 'is_staff'
>
