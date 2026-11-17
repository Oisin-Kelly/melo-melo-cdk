import { Avatar } from '@astryxdesign/core/Avatar'
import { Tokenizer } from '@astryxdesign/core/Tokenizer'
import { TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import { useMemo } from 'react'
import { useUsername } from '@/lib/auth/auth-context'
import { cleanUsernameQuery, MIN_PEOPLE_QUERY, searchPeople } from '@/lib/people'
import type { UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'

/** A picked person: their username is the id. */
export type Person = SearchableItem<UserSummary>

// Picking people to share with by username (GET /users/search), as tokens: the Share
// dialog and the upload page. Never offers yourself.
export function PeoplePicker({
  value,
  onChange,
  label = 'Add people',
  describe = (person) => `@${person.id}`,
  hasAutoFocus = false,
}: {
  value: Person[]
  onChange: (people: Person[]) => void
  label?: string
  /** The line under each search result (default: their @username) */
  describe?: (person: Person) => string
  hasAutoFocus?: boolean
}) {
  const me = useUsername()
  const searchSource = useMemo<SearchSource<Person>>(
    () => ({
      bootstrap: () => [],
      search: async (query) => {
        const q = cleanUsernameQuery(query)
        if (q.length < MIN_PEOPLE_QUERY) return []
        const people = await searchPeople(q, { limit: 8 })
        return people
          .filter((user) => user.username !== me)
          .map((user) => ({ id: user.username, label: nameOf(user), auxiliaryData: user }))
      },
    }),
    [me],
  )

  return (
    <Tokenizer
      label={label}
      placeholder="Search by username"
      searchSource={searchSource}
      value={value}
      onChange={onChange}
      minQueryLength={MIN_PEOPLE_QUERY}
      debounceMs={200}
      emptySearchResultsText="No one by that username"
      hasAutoFocus={hasAutoFocus}
      renderItem={(person) => (
        <TypeaheadItem
          item={person}
          icon={
            person.auxiliaryData && (
              <Avatar
                size="xsm"
                src={person.auxiliaryData.imageUrl ?? undefined}
                name={nameOf(person.auxiliaryData)}
                tooltip={false}
              />
            )
          }
          description={describe(person)}
        />
      )}
    />
  )
}
