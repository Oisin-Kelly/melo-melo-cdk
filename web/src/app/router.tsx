import { createBrowserRouter, RouterProvider } from 'react-router'
import { HomeRoute } from './routes/home'
import { NotFoundRoute } from './routes/not-found'

// Route table. As features land, add their routes here — lazy-load heavier
// screens with `lazy: () => import('...')` to keep the initial bundle small.
const router = createBrowserRouter([
  { path: '/', element: <HomeRoute /> },
  { path: '*', element: <NotFoundRoute /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
