import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom'

import { AdminLayout } from '../layouts/AdminLayout'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { PublicLayout } from '../layouts/PublicLayout'
import { AdminHomePage } from '../pages/AdminHomePage'
import { ErrorPage } from '../pages/ErrorPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'

import { MyAccountPage } from '../features/account/pages/MyAccountPage'
import { AdminUsersPage } from '../features/admin/pages/AdminUsersPage'
import { AudioListPage } from '../features/audio/pages/AudioListPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { MemoryCompanionPage } from '../features/companion/pages/MemoryCompanionPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { JournalListPage } from '../features/journal/pages/JournalListPage'
import { AdvancedSearchPage } from '../features/journal/pages/AdvancedSearchPage'
import { MediaLibraryPage } from '../features/media-library/pages/MediaLibraryPage'
import { MyPhotosPage } from '../features/people/pages/MyPhotosPage'
import { PeoplePage } from '../features/people/pages/PeoplePage'
import { PersonAlbumPage } from '../features/people/pages/PersonAlbumPage'
import { PhotoTaggingPage } from '../features/people/pages/PhotoTaggingPage'
import { SummariesPage } from '../features/summaries/pages/SummariesPage'

import { RedirectIfAuthenticated, RequireAuth, RequireStaff } from './guards'

/** `/people/*` aliases redirect to the canonical authenticated `/app/people/*`. */
function PeopleAlias() {
  const location = useLocation()
  return <Navigate to={`/app${location.pathname}${location.search}`} replace />
}

const router = createBrowserRouter(
  [
    {
      // Root error boundary: any route error renders the ErrorPage.
      errorElement: <ErrorPage />,
      children: [
        {
          element: <PublicLayout />,
          children: [
            { index: true, element: <HomePage /> },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
        {
          element: <RedirectIfAuthenticated />,
          children: [
            {
              element: <AuthLayout />,
              children: [
                { path: 'login', element: <LoginPage /> },
                { path: 'register', element: <RegisterPage /> },
              ],
            },
          ],
        },
        {
          element: <RequireAuth />,
          children: [
            { path: 'people', element: <PeopleAlias /> },
            { path: 'people/*', element: <PeopleAlias /> },
            {
              element: <AppLayout />,
              children: [
                { path: 'app', element: <DashboardPage /> },
                { path: 'app/journal', element: <JournalListPage /> },
                { path: 'app/journal/search', element: <AdvancedSearchPage /> },
                { path: 'app/audio', element: <AudioListPage /> },
                { path: 'app/summaries', element: <SummariesPage /> },
                { path: 'app/companion', element: <MemoryCompanionPage /> },
                { path: 'app/media', element: <MediaLibraryPage /> },
                { path: 'app/people', element: <PeoplePage /> },
                { path: 'app/people/photos', element: <MyPhotosPage /> },
                { path: 'app/people/photos/:id', element: <PhotoTaggingPage /> },
                { path: 'app/people/:id', element: <PersonAlbumPage /> },
                { path: 'app/account', element: <MyAccountPage /> },
              ],
            },
            {
              element: <RequireStaff />,
              children: [
                {
                  element: <AdminLayout />,
                  children: [
                    { path: 'admin', element: <AdminHomePage /> },
                    { path: 'admin/users', element: <AdminUsersPage /> },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  // Opt into the v7 behaviors early so the app runs without future-flag warnings.
  { future: { v7_relativeSplatPath: true } },
)

export function AppRouter() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />
}
