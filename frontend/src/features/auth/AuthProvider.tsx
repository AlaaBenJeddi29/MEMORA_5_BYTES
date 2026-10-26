import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { authApi } from '../../services/auth'
import type { LoginInput, RegisterInput, User } from '../../types/auth'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'

/** True when the backend still reports an authenticated session. */
async function isSessionActive(): Promise<boolean> {
  try {
    return Boolean(await authApi.me())
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const loadCurrentUser = useCallback(async () => {
    try {
      const currentUser = await authApi.me()
      if (!currentUser) {
        // 204 means "no session"; that is a normal signed-out state.
        setUser(null)
        setStatus('unauthenticated')
        return
      }
      setUser(currentUser)
      setStatus('authenticated')
    } catch {
      // A network or server error during bootstrap also leaves the app signed
      // out, but must not crash it.
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    void loadCurrentUser()
  }, [loadCurrentUser])

  // Make sure the `csrftoken` cookie exists for later unsafe requests.
  useEffect(() => {
    void authApi.csrf().catch(() => undefined)
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    const currentUser = await authApi.login(input)
    setUser(currentUser)
    setStatus('authenticated')
    return currentUser
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    // Registration no longer starts a session: the account stays inactive
    // until the emailed verification link is used.
    return authApi.register(input)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // The request failed — check the real session state instead of guessing.
      // If the session is already gone (expired, or a 401/403 with no valid
      // cookie) signing out locally is correct. If the user is still signed in
      // on the server, rethrow so the caller can report the failure honestly
      // rather than silently dropping a live session.
      if (await isSessionActive()) {
        throw error
      }
    }
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, refresh: loadCurrentUser }),
    [user, status, login, register, logout, loadCurrentUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
