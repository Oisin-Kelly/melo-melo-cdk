import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { sileo } from 'sileo'
import { resendVerificationCode, verifyAccount } from '../api/auth-actions'
import { useAuth } from '@/lib/auth/auth-context'
import { useAuthForm } from '../hooks/use-auth-form'
import { afterAuthPath, withNext } from '../utils/safe-next'
import { checkCode } from '../utils/validation'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

// Reached after sign-up (?username=…&sent=1) or when signing in to an unconfirmed
// account (?username=…, no code sent yet in this visit — offer to send one).
export function VerifyForm() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const [username, setUsername] = useState(params.get('username') ?? '')
  const [code, setCode] = useState('')
  const [isResending, setIsResending] = useState(false)
  const form = useAuthForm()
  const knowsUsername = Boolean(params.get('username'))

  const handleSubmit = () =>
    form.submit(
      { username: username.trim() ? null : 'Enter your username.', code: checkCode(code) },
      async () => {
        const signedIn = await verifyAccount(username, code)
        if (signedIn) {
          await refresh()
          sileo.success({ title: 'Welcome to MeloMelo' })
          navigate(afterAuthPath(params), { replace: true })
        } else {
          sileo.success({ title: 'Email verified', description: 'Sign in to get started.' })
          navigate(withNext('/login', params), { replace: true })
        }
      },
    )

  const handleResend = async () => {
    if (!username.trim()) return
    setIsResending(true)
    try {
      await resendVerificationCode(username)
      sileo.success({ title: 'Code sent', description: 'Check your inbox (and spam folder).' })
    } catch (error) {
      sileo.error({ title: "Couldn't send a code", description: (error as Error).message })
    } finally {
      setIsResending(false)
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        params.get('sent')
          ? 'We sent a 6-digit code to the email you signed up with.'
          : 'Enter the 6-digit code we emailed you, or send a new one.'
      }
      footer={
        <>
          Wrong account? <Link href={withNext('/login', params)}>Back to sign in</Link>
        </>
      }
    >
      <VStack gap={3}>
        {!knowsUsername && (
          <TextInput
            label="Username"
            value={username}
            onChange={(v) => {
              setUsername(v)
              form.clear('username')
            }}
            autoComplete="username"
            size="lg"
            status={form.status('username')}
          />
        )}
        <TextInput
          label="Verification code"
          value={code}
          onChange={(v) => {
            setCode(v)
            form.clear('code')
          }}
          onEnter={handleSubmit}
          autoComplete="one-time-code"
          size="lg"
          hasAutoFocus
          status={form.status('code')}
        />
        <FormError message={form.errors.form ?? null} />
        <Button
          label="Verify"
          variant="primary"
          size="lg"
          width="100%"
          isLoading={form.isSubmitting}
          onClick={handleSubmit}
        />
        <Button
          label="Send a new code"
          variant="ghost"
          width="100%"
          isLoading={isResending}
          isDisabled={!username.trim()}
          onClick={handleResend}
        />
      </VStack>
    </AuthLayout>
  )
}
