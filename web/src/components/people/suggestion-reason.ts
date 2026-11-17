import type { Suggestion } from '@/lib/people'
import { nameOf } from '@/types/user'

/** Why they're suggested, in words. Never a share that isn't between you and them. */
export function suggestionReason({ reason, mutuals, mutualCount }: Suggestion): string {
  switch (reason) {
    case 'FOLLOWS_YOU':
      return 'Follows you'
    case 'SHARED_WITH_YOU':
      return 'Shared music with you'
    case 'YOU_SHARED':
      return 'You shared with them'
    default: {
      const [first, second] = mutuals.map(nameOf)
      if (!first) return 'People you follow follow them'
      if (mutualCount === 1) return `Followed by ${first}`
      if (mutualCount === 2 && second) return `Followed by ${first} and ${second}`
      const others = mutualCount - 1
      return `Followed by ${first} and ${others} ${others === 1 ? 'other' : 'others'}`
    }
  }
}
