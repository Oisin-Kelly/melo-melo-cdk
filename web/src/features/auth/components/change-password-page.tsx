import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { sileo } from 'sileo'
import { BackButton } from '@/components/navigation/back-button'
import { changePassword } from '../api/auth-actions'
import { useAuthForm } from '../hooks/use-auth-form'
import { checkPassword } from '../utils/validation'
import { FormError } from './form-error'

// Settings → Change password (signed in). Same password rules as sign-up, checked before
// Cognito is called; a wrong current password goes next to that field. Back to Settings after.
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const form = useAuthForm()

  const handleSubmit = () =>
    form.submit(
      {
        currentPassword: current ? null : 'Enter your current password.',
        password: checkPassword(next),
        confirm: confirm === next ? null : "The passwords don't match.",
      },
      async () => {
        await changePassword(current, next)
        sileo.success({ title: 'Password changed' })
        navigate('/settings', { replace: true })
      },
    )

  return (
    <VStack gap={6} maxWidth="30rem">
      <VStack gap={2}>
        <BackButton fallback="/settings" className="mm-page-back" />
        <Heading level={1}>Change password</Heading>
      </VStack>
      <VStack gap={3}>
        <TextInput
          label="Current password"
          type="password"
          value={current}
          onChange={(v) => {
            setCurrent(v)
            form.clear('currentPassword')
          }}
          onEnter={handleSubmit}
          autoComplete="current-password"
          hasAutoFocus
          status={form.status('currentPassword')}
        />
        <TextInput
          label="New password"
          type="password"
          description="At least 8 characters, with upper and lower case letters, a number and a symbol."
          value={next}
          onChange={(v) => {
            setNext(v)
            form.clear('password')
          }}
          onEnter={handleSubmit}
          autoComplete="new-password"
          status={form.status('password')}
        />
        <TextInput
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            form.clear('confirm')
          }}
          onEnter={handleSubmit}
          autoComplete="new-password"
          status={form.status('confirm')}
        />
        <FormError message={form.errors.form ?? null} />
        <Button
          label="Change password"
          variant="primary"
          width="100%"
          isLoading={form.isSubmitting}
          onClick={handleSubmit}
        />
      </VStack>
    </VStack>
  )
}
