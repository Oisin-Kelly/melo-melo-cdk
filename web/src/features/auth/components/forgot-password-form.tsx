import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { sileo } from 'sileo'
import { requestPasswordReset, setNewPassword } from '../api/auth-actions'
import { useAuthForm } from '../hooks/use-auth-form'
import { withNext } from '../utils/safe-next'
import { checkCode, checkPassword } from '../utils/validation'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

// Two steps on one screen: ask for the account, then the emailed code + new password.
export function ForgotPasswordForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const form = useAuthForm()

  const handleRequest = () =>
    form.submit({ username: username.trim() ? null : 'Enter your username or email.' }, async () => {
      await requestPasswordReset(username)
      setStep('reset')
    })

  const handleReset = () =>
    form.submit({ code: checkCode(code), password: checkPassword(password) }, async () => {
      await setNewPassword(username, code, password)
      sileo.success({ title: 'Password updated', description: 'Sign in with your new password.' })
      navigate(withNext('/login', params), { replace: true })
    })

  const footer = (
    <>
      Remembered it? <Link href={withNext('/login', params)}>Back to sign in</Link>
    </>
  )

  if (step === 'request') {
    return (
      <AuthLayout
        title="Reset your password"
        subtitle="Enter your username or email and we'll send you a code."
        footer={footer}
      >
        <VStack gap={3}>
          <TextInput
            label="Username or email"
            value={username}
            onChange={(v) => {
              setUsername(v)
              form.clear('username')
            }}
            onEnter={handleRequest}
            autoComplete="username"
            size="lg"
            hasAutoFocus
            status={form.status('username')}
          />
          <FormError message={form.errors.form ?? null} />
          <Button
            label="Send code"
            variant="primary"
            size="lg"
            width="100%"
            isLoading={form.isSubmitting}
            onClick={handleRequest}
          />
        </VStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      // Cognito hides whether the account exists, so this reads the same either way
      subtitle="If that account exists, we've emailed it a 6-digit code."
      footer={footer}
    >
      <VStack gap={3}>
        <TextInput
          label="Code"
          value={code}
          onChange={(v) => {
            setCode(v)
            form.clear('code')
          }}
          autoComplete="one-time-code"
          size="lg"
          hasAutoFocus
          status={form.status('code')}
        />
        <TextInput
          label="New password"
          type="password"
          description="At least 8 characters, with upper and lower case letters, a number and a symbol."
          value={password}
          onChange={(v) => {
            setPassword(v)
            form.clear('password')
          }}
          onEnter={handleReset}
          autoComplete="new-password"
          size="lg"
          status={form.status('password')}
        />
        <FormError message={form.errors.form ?? null} />
        <Button
          label="Update password"
          variant="primary"
          size="lg"
          width="100%"
          isLoading={form.isSubmitting}
          onClick={handleReset}
        />
      </VStack>
    </AuthLayout>
  )
}
