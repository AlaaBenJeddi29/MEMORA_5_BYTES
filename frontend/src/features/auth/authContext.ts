import { createContext } from 'react'

import type { LoginInput, RegisterInput, User } from '../../types/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (input: LoginInput) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  /** Re-reads the current user from `GET /api/accounts/me/`. */
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
