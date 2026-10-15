import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../features/auth/useAuth'

/** Allows access only when a session is active; otherwise redirects to sign in. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <LoadingState centered label="Checking your session…" />
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <Outlet />
}

/** Keeps signed-in users away from the public-only auth pages. */
export function RedirectIfAuthenticated() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <LoadingState centered label="Checking your session…" />
  }

  if (status === 'authenticated') {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}
