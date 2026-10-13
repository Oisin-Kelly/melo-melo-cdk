import { QueryClient, type DefaultOptions } from '@tanstack/react-query'

// App-wide TanStack Query defaults. Features build their own query/mutation
// options on top of this client.
const queryConfig: DefaultOptions = {
  queries: {
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60 * 1000,
  },
}

export const queryClient = new QueryClient({ defaultOptions: queryConfig })
