import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { confirmSignInCode, SignInExpiredError, signInWithPassword } from '../api/auth-actions'
import { useAuth } from '@/lib/auth/auth-context'
import { useAuthForm } from '../hooks/use-auth-form'
import { afterAuthPath, withNext } from '../utils/safe-next'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

// Sign in: username/email + password, then — when two-step verification is on — the
// authenticator app's code on the same card (no route change, so nothing lands in the URL).
export function SignInForm() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [code, setCode] = useState('')
  const form = useAuthForm()

  const finish = async () => {
    await refresh()
    navigate(afterAuthPath(params), { replace: true })
  }

  const handleSubmit = () =>
    form.submit(
      {
        username: username.trim() ? null : 'Enter your username or email.',
        password: password ? null : 'Enter your password.',
      },
      async () => {
        const result = await signInWithPassword(username, password)
        if (result === 'verify') {
          navigate(withNext(`/verify?username=${encodeURIComponent(username.trim())}`, params))
          return
        }
        if (result === 'totp') {
          setCode('')
          setStep('code')
          return
        }
        await finish()
      },
    )

  const handleCode = () =>
    form.submit({ code: /^\d{6}$/.test(code.trim()) ? null : 'Enter the 6-digit code.' }, async () => {
      try {
        await confirmSignInCode(code)
      } catch (error) {
        // Too slow: back to the password, with the reason shown there
        if (error instanceof SignInExpiredError) {
          setPassword('')
          setStep('password')
        }
        throw error
      }
      await finish()
    })

  if (step === 'code') {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle="Open your authenticator app and enter the 6-digit code for MeloMelo."
        footer={
          <Link
            onClick={() => {
              form.clear('code')
              setStep('password')
            }}
          >
            Back
          </Link>
        }
      >
        <VStack gap={3}>
          <TextInput
            label="Code"
            value={code}
            onChange={(v) => {
              setCode(v)
              form.clear('code')
            }}
            onEnter={handleCode}
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
            onClick={handleCode}
          />
        </VStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to hear what your friends have been sharing."
      footer={
        <>
          New to MeloMelo? <Link href={withNext('/signup', params)}>Create an account</Link>
        </>
      }
    >
      <VStack gap={3}>
        <TextInput
          label="Username or email"
          value={username}
          onChange={(v) => {
            setUsername(v)
            form.clear('username')
          }}
          onEnter={handleSubmit}
          autoComplete="username"
          size="lg"
          hasAutoFocus
          status={form.status('username')}
        />
        <VStack gap={1}>
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              form.clear('password')
            }}
            onEnter={handleSubmit}
            autoComplete="current-password"
            size="lg"
            status={form.status('password')}
          />
          <VStack hAlign="end">
            <Link href={withNext('/forgot-password', params)} color="secondary" size="sm">
              Forgot your password?
            </Link>
          </VStack>
        </VStack>
        <FormError message={form.errors.form ?? null} />
        <Button
          label="Sign in"
          variant="primary"
          size="lg"
          width="100%"
          isLoading={form.isSubmitting}
          onClick={handleSubmit}
        />
      </VStack>
    </AuthLayout>
  )
}
