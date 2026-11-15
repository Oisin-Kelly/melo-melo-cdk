import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { CameraIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { sileo } from 'sileo'
import { PageLoader } from '@/components/feedback/page-loader'
import { CountedTextInput } from '@/components/forms/counted-text-input'
import { FormSection } from '@/components/forms/form-section'
import { lengthError } from '@/components/forms/saved-text'
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes'
import { BackButton } from '@/components/navigation/back-button'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from '@/lib/dropbox'
import { useMe } from '@/lib/me'
import { nameOf, type IncomingShares, type User } from '@/types/user'
import { useUpdateProfile, type ProfileDraft } from '../api/update-profile'
import './edit-profile.css'

// /settings/profile: everything POST /profile/update takes — photo (change / remove),
// display name, name, bio, location, privacy and who can share with you. Laid out like
// Astryx's `settings` template: one scrolling form, each section's title beside its
// fields (stacked on narrow screens), and one Save at the end since it's one request.
export function EditProfilePage() {
  const me = useMe()
  const navigate = useNavigate()
  // Back to wherever you came from (Settings, the avatar menu…), else Settings
  const leave = () =>
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate('/settings')

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <BackButton fallback="/settings" className="mm-page-back" />
        <Heading level={1}>Edit profile</Heading>
      </VStack>
      {me.data ? <ProfileForm user={me.data} leave={leave} /> : <PageLoader what="settings" />}
    </VStack>
  )
}

// The server's limits (UserValidationService), checked here so mistakes show inline
const FIELD_LIMITS = {
  displayName: LIMITS.displayName,
  firstName: LIMITS.profileField,
  lastName: LIMITS.profileField,
  city: LIMITS.profileField,
  country: LIMITS.profileField,
  bio: LIMITS.bio,
} as const
type TextField = keyof typeof FIELD_LIMITS

// First/last name and city/country sit side by side only where each gets this much width —
// so they stack on every phone, where two columns left labels and counters crammed together
const PAIRED_FIELD_MIN = 220

const toDraft = (user: User): Record<TextField, string> => ({
  displayName: user.displayName ?? '',
  firstName: user.firstName ?? '',
  lastName: user.lastName ?? '',
  city: user.city ?? '',
  country: user.country ?? '',
  bio: user.bio ?? '',
})

function ProfileForm({ user, leave }: { user: User; leave: () => void }) {
  const update = useUpdateProfile()
  const initial = useMemo(() => toDraft(user), [user])
  const [text, setText] = useState(initial)
  const [incomingShares, setIncomingShares] = useState<IncomingShares>(user.incomingShares ?? 'EVERYONE')
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [isPhotoCleared, setIsPhotoCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Free the picked photo's preview URL when it's replaced or the form closes
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo])

  const tooLong = (field: TextField) => lengthError(text[field], FIELD_LIMITS[field], field === 'bio' ? 'multi' : 'single') !== null
  const hasErrors = (Object.keys(FIELD_LIMITS) as TextField[]).some(tooLong)
  const isDirty =
    (Object.keys(FIELD_LIMITS) as TextField[]).some((field) => text[field] !== initial[field]) ||
    incomingShares !== (user.incomingShares ?? 'EVERYONE') ||
    photo !== null ||
    isPhotoCleared

  const unsaved = useUnsavedChanges(
    isDirty,
    "You have unsaved changes to your profile. If you leave now, they won't be saved.",
  )

  const previewUrl = photo?.url ?? (isPhotoCleared ? undefined : (user.imageUrl ?? undefined))
  const field = (name: TextField) => ({
    maxLength: FIELD_LIMITS[name],
    value: text[name],
    onChange: (value: string) => {
      setText((current) => ({ ...current, [name]: value }))
      setError(null)
    },
    status: tooLong(name)
      ? ({ type: 'error', message: `Keep it to ${FIELD_LIMITS[name]} characters.` } as const)
      : undefined,
  })

  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      setError('Choose a JPEG, PNG, WebP or GIF image.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That photo is over 20 MB. Choose a smaller one.')
      return
    }
    setPhoto({ file, url: URL.createObjectURL(file) })
    setIsPhotoCleared(false)
    setError(null)
  }

  const save = async () => {
    if (!isDirty || hasErrors) return
    const blankToNull = (value: string) => value.trim() || null
    const draft: ProfileDraft = {
      displayName: blankToNull(text.displayName),
      firstName: blankToNull(text.firstName),
      lastName: blankToNull(text.lastName),
      city: blankToNull(text.city),
      country: blankToNull(text.country),
      bio: blankToNull(text.bio),
      incomingShares,
    }
    try {
      await update.mutateAsync({ draft, file: photo?.file ?? null, clearImage: isPhotoCleared })
      unsaved.markSaved()
      sileo.success({ title: 'Profile saved' })
      leave()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError(err.message)
      else sileo.error({ title: "Couldn't save your profile", description: 'Please try again.' })
    }
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title={error} />}

      <FormSection title="Photo" description="Shown on your profile and next to everything you share.">
        <HStack gap={4} vAlign="center" wrap="wrap">
          <button
            type="button"
            className="mm-edit-profile-photo"
            aria-label={previewUrl ? 'Change photo' : 'Add photo'}
            onClick={() => fileInput.current?.click()}
          >
            <Avatar src={previewUrl} name={nameOf(user)} size={96} tooltip={false} alt="" />
            <span className="mm-edit-profile-photo-badge" aria-hidden="true">
              <Icon icon={CameraIcon} size="sm" color="inherit" />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              pickPhoto(e.target.files?.[0])
              e.target.value = '' // so picking the same file again still fires
            }}
          />
          <VStack gap={1}>
            <HStack gap={2}>
              <Button
                label={previewUrl ? 'Change photo' : 'Add photo'}
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
              />
              {previewUrl && (
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoto(null)
                    setIsPhotoCleared(Boolean(user.imageUrl))
                  }}
                />
              )}
            </HStack>
            <Text type="supporting" color="secondary">
              JPEG, PNG, WebP or GIF, up to 20 MB.
            </Text>
          </VStack>
        </HStack>
      </FormSection>

      <Divider />

      <FormSection title="Basic information" description="How you appear to the people you share with.">
        <CountedTextInput
          label="Display name"
          placeholder={user.username}
          description="Leave empty to show your username."
          {...field('displayName')}
        />
        <Grid columns={{ minWidth: PAIRED_FIELD_MIN }} gap={4}>
          <CountedTextInput label="First name" isOptional autoComplete="given-name" {...field('firstName')} />
          <CountedTextInput label="Last name" isOptional autoComplete="family-name" {...field('lastName')} />
        </Grid>
        <TextArea label="Bio" isOptional rows={4} {...field('bio')} />
      </FormSection>

      <Divider />

      <FormSection title="Location" description="Optional, shown on your profile.">
        <Grid columns={{ minWidth: PAIRED_FIELD_MIN }} gap={4}>
          <CountedTextInput label="City" isOptional autoComplete="address-level2" {...field('city')} />
          <CountedTextInput label="Country" isOptional autoComplete="country-name" {...field('country')} />
        </Grid>
      </FormSection>

      <Divider />

      <FormSection title="Privacy" description="Who can send you music.">
        <RadioList
          label="Who can share music with you"
          value={incomingShares}
          onChange={(value) => setIncomingShares(value as IncomingShares)}
        >
          <RadioListItem value="EVERYONE" label="Everyone" />
          <RadioListItem value="FOLLOWING" label="People you follow" />
          <RadioListItem value="NONE" label="No one" description="Things already shared with you stay." />
        </RadioList>
      </FormSection>

      <Divider />

      <HStack gap={2} hAlign="end">
        <Button label="Cancel" variant="secondary" onClick={leave} />
        <Button
          label="Save changes"
          variant="primary"
          isDisabled={!isDirty || hasErrors}
          isLoading={update.isPending}
          onClick={() => void save()}
        />
      </HStack>

      {unsaved.dialog}
    </VStack>
  )
}
