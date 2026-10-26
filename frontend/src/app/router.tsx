import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { AdminLayout } from '../layouts/AdminLayout'
import { AppLayout } from '../layouts/AppLayout'
import { PublicLayout } from '../layouts/PublicLayout'
import { AdminHomePage } from '../pages/AdminHomePage'
import { ErrorPage } from '../pages/ErrorPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'

import { MyAccountPage } from '../features/account/pages/MyAccountPage'
import { AudioListPage } from '../features/audio/pages/AudioListPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { JournalListPage } from '../features/journal/pages/JournalListPage'
import { AdvancedSearchPage } from '../features/journal/pages/AdvancedSearchPage'
import { MediaLibraryPage } from '../features/media-library/pages/MediaLibraryPage'
import { PeoplePage } from '../features/people/pages/PeoplePage'
import { SummariesPage } from '../features/summaries/pages/SummariesPage'

import { RedirectIfAuthenticated, RequireAuth } from './guards'

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
            {
              element: <RedirectIfAuthenticated />,
              children: [
                { path: 'login', element: <LoginPage /> },
                { path: 'register', element: <RegisterPage /> },
              ],
            },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppLayout />,
              children: [
                { path: 'app', element: <DashboardPage /> },
                { path: 'app/journal', element: <JournalListPage /> },
                { path: 'app/journal/search', element: <AdvancedSearchPage /> },
                { path: 'app/audio', element: <AudioListPage /> },
                { path: 'app/summaries', element: <SummariesPage /> },
                { path: 'app/media', element: <MediaLibraryPage /> },
                { path: 'app/people', element: <PeoplePage /> },
                { path: 'app/account', element: <MyAccountPage /> },
              ],
            },
            {
              element: <AdminLayout />,
              children: [{ path: 'admin', element: <AdminHomePage /> }],
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
