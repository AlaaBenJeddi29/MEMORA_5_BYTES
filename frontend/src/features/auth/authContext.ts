import { createContext } from 'react'

import type { LoginInput, RegisterInput, RegisterResult, User } from '../../types/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (input: LoginInput) => Promise<User>
  /** Creates an inactive account; the user signs in only after verification. */
  register: (input: RegisterInput) => Promise<RegisterResult>
  logout: () => Promise<void>
  /** Re-reads the current user from `GET /api/accounts/me/`. */
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
