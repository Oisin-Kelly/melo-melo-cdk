import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { stageUpload } from '@/lib/dropbox'
import { patchMe } from '@/lib/me'
import type { IncomingShares, User } from '@/types/user'

// POST /profile/update (UpdateUserProfileLambda). Every text field is written as sent —
// null clears it — so the form always sends the whole profile; incomingShares is the
// one field where null means "leave as is".
export type ProfileDraft = {
  displayName: string | null
  firstName: string | null
  lastName: string | null
  city: string | null
  country: string | null
  bio: string | null
  incomingShares: IncomingShares
}

/** `file`: a newly picked photo; `clearImage`: remove the current one. */
export type ProfileUpdate = { draft: ProfileDraft; file: File | null; clearImage: boolean }

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const username = useUsername()

  return useMutation({
    mutationFn: async ({ draft, file, clearImage }: ProfileUpdate) => {
      const imageKey = file ? await stageUpload(file, 'profile') : undefined
      return api<User>('/profile/update', {
        method: 'POST',
        body: { ...draft, imageKey, clearedImage: !file && clearImage },
      })
    },
    onSuccess: (user) => {
      // The response is the fresh profile; merging keeps the private seen markers the
      // cached copy carries
      patchMe(queryClient, username, user)
      // Your name and photo also appear on rows everywhere (feed, search, activity…)
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'users' })
    },
  })
}
