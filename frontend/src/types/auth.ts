/** The user object returned by the accounts API (`register`, `login`, `me`). */
export type UserRole = 'ADMIN' | 'MANAGER' | 'MEMBER'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  /** Application role; the matching Django group carries the permissions. */
  role: UserRole
  role_display: string
  /** False until the emailed verification link has been used. */
  email_verified: boolean
  /** True for staff accounts, which alone may enter the admin area. */
  is_staff: boolean
  /** ISO-8601 timestamp (UTC). */
  date_joined: string
}

export interface LoginInput {
  username: string
  password: string
}

export interface RegisterInput {
  username: string
  email: string
  password: string
  password_confirm: string
}

/** 201 response: the account exists but is inactive until the link is used. */
export interface RegisterResult {
  detail: string
  email: string
  email_sent: boolean
}

export interface ProfileUpdateInput {
  email: string
  first_name: string
  last_name: string
}
