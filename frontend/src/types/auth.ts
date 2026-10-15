/** The user object returned by the accounts API (`register`, `login`, `me`). */
export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  /** ISO-8601 timestamp (UTC). */
  date_joined: string
}

export interface LoginInput {
  username: string
  password: string
}

export interface RegisterInput {
  username: string
  email?: string
  password: string
  password_confirm: string
}
