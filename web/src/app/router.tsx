import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { PageLoader } from '@/components/feedback/page-loader'
import { HomePage } from '@/features/feed/components/home-page'
import { LibraryPage } from '@/features/playlists/components/library-page'
import { SearchPage } from '@/features/search/components/search-page'
import { EditProfilePage } from '@/features/users/components/edit-profile-page'
import { FollowListPage } from '@/features/users/components/follow-list-page'
import { ProfilePage } from '@/features/users/components/profile-page'
import { SettingsPage } from '@/features/users/components/settings-page'
import { ActivityPage } from '@/features/activity/components/activity-page'
import { AppLayout } from './layouts/app-layout'
import { GuestOnly, RequireAuth } from './layouts/guards'
import { RootLayout } from './layouts/root-layout'
import { ComingSoon } from './routes/coming-soon'
import {
  AlbumIdRoute,
  AlbumSlugRoute,
  LikedRoute,
  OldProfileRedirect,
  PlaylistIdRoute,
  PlaylistSlugRoute,
  TrackIdRoute,
  TrackPeopleIdRoute,
  TrackPeopleSlugRoute,
  TrackSlugRoute,
} from './routes/item-routes'
import { LandingRoute } from './routes/landing'
import { NotFoundRoute } from './routes/not-found'
import { RouteError } from './routes/route-error'

// Auth screens are lazy so the signed-in app doesn't ship them (and vice versa).
const authRoute = (path: string, load: () => Promise<React.ComponentType>) => ({
  path,
  lazy: async () => ({ Component: await load() }),
})

const placeholder = (path: string, title: string, hasBack?: boolean) => ({
  path,
  element: <ComingSoon title={title} hasBack={hasBack} />,
})

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Friendly error screen; also self-heals stale lazy chunks (after a deploy, or a
    // Vite dependency re-optimise in dev) with a single reload
    errorElement: <RouteError />,
    // Shown while a lazy route's code loads on a direct visit (e.g. opening /login)
    hydrateFallbackElement: <PageLoader />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          authRoute('/login', async () => (await import('@/features/auth/components/sign-in-form')).SignInForm),
          authRoute('/signup', async () => (await import('@/features/auth/components/sign-up-form')).SignUpForm),
          authRoute('/verify', async () => (await import('@/features/auth/components/verify-form')).VerifyForm),
          authRoute(
            '/forgot-password',
            async () => (await import('@/features/auth/components/forgot-password-form')).ForgotPasswordForm,
          ),
        ],
      },
      // A share link's invite screen: works signed in or out, so it sits outside both guards.
      // Usernames are at least 2 characters, so no profile can be called `s`.
      {
        path: '/s/:token',
        lazy: async () => ({ Component: (await import('@/features/invites/components/invite-page')).InvitePage }),
      },
      {
        // Signed out: `/` is the landing page, any other app URL goes to sign-in
        element: (
          <RequireAuth signedOutHome={<LandingRoute />}>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          // The phone Search tab (desktop searches from the header)
          { path: '/search', element: <SearchPage /> },
          // A first, simple Library (Liked tracks, playlists, liked albums); the full screen gets its own plan
          { path: '/library', element: <LibraryPage /> },
          // Liked tracks: the likes playlist's page
          { path: '/liked', element: <LikedRoute /> },
          { path: '/activity', element: <ActivityPage /> },
          // The phone Settings tab: edit profile, appearance, sign out
          { path: '/settings', element: <SettingsPage /> },
          // Each of these screens gets its own plan
          { path: '/settings/profile', element: <EditProfilePage /> },
          {
            path: '/settings/password',
            lazy: async () => ({
              Component: (await import('@/features/auth/components/change-password-page')).ChangePasswordPage,
            }),
          },
          placeholder('/upload', 'Upload a track', true),
          // The built-in likes playlist is Liked tracks
          { path: '/playlists/likes', element: <Navigate to="/liked" replace /> },
          // Old id URLs (shared links, items without a slug yet) — each page moves the address
          // bar on to the readable URL once it has loaded
          { path: '/playlists/:playlistId', element: <PlaylistIdRoute /> },
          { path: '/tracks/:trackId', element: <TrackIdRoute /> },
          { path: '/tracks/:trackId/shared-with', element: <TrackPeopleIdRoute kind="shared-with" /> },
          { path: '/tracks/:trackId/likes', element: <TrackPeopleIdRoute kind="likes" /> },
          { path: '/albums/:albumId', element: <AlbumIdRoute /> },
          { path: '/u/:username/*', element: <OldProfileRedirect /> },
          // Readable URLs, at the root like SoundCloud. Static paths above always win over
          // these (and sign-up refuses usernames that would clash — ReservedUsernames.cs);
          // track slugs never take a profile sub-route's name (Slugs.ReservedTrackSlugs).
          { path: '/:username', element: <ProfilePage /> },
          { path: '/:username/followers', element: <FollowListPage kind="followers" /> },
          { path: '/:username/following', element: <FollowListPage kind="following" /> },
          { path: '/:username/albums/:slug', element: <AlbumSlugRoute /> },
          { path: '/:username/playlists/:slug', element: <PlaylistSlugRoute /> },
          { path: '/:username/:slug', element: <TrackSlugRoute /> },
          { path: '/:username/:slug/shared-with', element: <TrackPeopleSlugRoute kind="shared-with" /> },
          { path: '/:username/:slug/likes', element: <TrackPeopleSlugRoute kind="likes" /> },
        ],
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
