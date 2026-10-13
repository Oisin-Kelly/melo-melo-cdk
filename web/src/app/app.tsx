import { AppProvider } from './provider'
import { AppRouter } from './router'

// Application root: global providers wrapping the router. The `app/` layer may
// import from features, components, lib, …; nothing may import back into `app/`.
export function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  )
}
