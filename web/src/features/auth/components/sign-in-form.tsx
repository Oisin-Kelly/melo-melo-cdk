import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { signInWithPassword } from '../api/auth-actions'
import { useAuth } from '@/lib/auth/auth-context'
import { useAuthForm } from '../hooks/use-auth-form'
import { afterAuthPath, withNext } from '../utils/safe-next'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

export function SignInForm() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const form = useAuthForm()

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
        await refresh()
        navigate(afterAuthPath(params), { replace: true })
      },
    )

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
