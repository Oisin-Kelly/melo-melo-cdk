import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'
import { type Suggestion, useHideSuggestion, useSuggestions, useToggleFollow } from '@/lib/people'
import { sileo } from 'sileo'
import { nameOf } from '@/types/user'
import { suggestionReason } from './suggestion-reason'

// One suggestion: an Astryx list row — photo, name and why; the row opens their profile,
// Follow and ✕ sit at its end
function SuggestionItem({ suggestion }: { suggestion: Suggestion }) {
  const { user } = suggestion
  const navigate = useNavigate()
  const follow = useToggleFollow(user.username)
  const hide = useHideSuggestion()
  const name = nameOf(user)
  const isFollowing = follow.isPending || follow.isSuccess

  return (
    <ListItem
      label={name}
      description={suggestionReason(suggestion)}
      startContent={<Avatar size="md" src={user.imageUrl ?? undefined} name={name} tooltip={false} />}
      onClick={() => navigate(profilePath(user.username))}
      endContent={
        // The buttons are the row's own: don't also open the profile
        <HStack gap={1} vAlign="center" onClick={(e) => e.stopPropagation()}>
          <Button
            label={isFollowing ? 'Following' : 'Follow'}
            variant={isFollowing ? 'secondary' : 'primary'}
            size="sm"
            isDisabled={isFollowing}
            onClick={() => follow.mutate(true)}
          />
          <IconButton
            label={`Hide ${name}`}
            variant="ghost"
            size="sm"
            icon={<Icon icon={XMarkIcon} color="secondary" />}
            onClick={() => hide.mutate(user.username)}
          />
        </HStack>
      }
    />
  )
}

// Suggestions only come from around you, so point at the way to bring someone in (on a
// grey card): a link to your profile — opened signed out, it signs them up and lands them
// there to follow you
function InviteCard() {
  const me = useUsername()
  const [copied, setCopied] = useState(false)
  return (
    <Card variant="muted">
      <VStack gap={2}>
        <Text type="body" weight="semibold">
          Can't find someone?
        </Text>
        <Text type="supporting" color="secondary">
          MeloMelo only suggests people around you. Send anyone a link to your profile.
        </Text>
        <Button
          label={copied ? 'Copied' : 'Copy invite link'}
          variant={copied ? 'secondary' : 'primary'}
          size="sm"
          width="100%"
          onClick={() =>
            void navigator.clipboard
              .writeText(`${window.location.origin}${profilePath(me)}`)
              .then(() => setCopied(true))
              .catch(() => sileo.error({ title: "Couldn't copy the link" }))
          }
        />
      </VStack>
    </Card>
  )
}

// The same suggestions as Home's side panel on wide screens (inside an Astryx LayoutPanel):
// a titled list, then the invite card. The list waits for its data and is left out with no
// one to suggest; the invite card always shows.
export function PeopleYouMayKnowPanel() {
  const suggestions = useSuggestions()
  const items = suggestions.data ?? []

  return (
    <VStack gap={4}>
      <Heading level={3}>People you may know</Heading>
      {items.length > 0 && (
        <List>
          {items.map((suggestion) => (
            <SuggestionItem key={suggestion.user.username} suggestion={suggestion} />
          ))}
        </List>
      )}
      <InviteCard />
    </VStack>
  )
}

// "People you may know" as a section (docs/suggestions-design.md): on the Search tab before
// you type and, on screens too narrow for Home's side panel, an empty Home. The same list
// rows as the panel. Nothing at all while loading, on an error or with no one to suggest.
export function PeopleYouMayKnow() {
  const suggestions = useSuggestions()
  if (!suggestions.data?.length) return null

  return (
    <VStack gap={2}>
      <Heading level={3}>People you may know</Heading>
      <List>
        {suggestions.data.map((suggestion) => (
          <SuggestionItem key={suggestion.user.username} suggestion={suggestion} />
        ))}
      </List>
    </VStack>
  )
}
