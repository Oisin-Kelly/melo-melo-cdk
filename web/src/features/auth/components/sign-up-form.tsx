import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { createAccount } from '../api/auth-actions'
import { useAuthForm } from '../hooks/use-auth-form'
import { withNext } from '../utils/safe-next'
import { checkEmail, checkPassword, checkUsername } from '../utils/validation'
import { AuthLayout } from './auth-layout'
import { FormError } from './form-error'

export function SignUpForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const form = useAuthForm()

  const handleSubmit = () =>
    form.submit(
      { username: checkUsername(username), email: checkEmail(email), password: checkPassword(password) },
      async () => {
        await createAccount(username, email, password)
        navigate(withNext(`/verify?username=${encodeURIComponent(username.trim())}&sent=1`, params))
      },
    )

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Share tracks privately with the people you choose."
      footer={
        <>
          Already have an account? <Link href={withNext('/login', params)}>Sign in</Link>
        </>
      }
    >
      <VStack gap={3}>
        <TextInput
          label="Username"
          description="This is how friends find you. Letters, numbers, dots and underscores."
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
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v)
            form.clear('email')
          }}
          onEnter={handleSubmit}
          autoComplete="email"
          size="lg"
          status={form.status('email')}
        />
        <TextInput
          label="Password"
          type="password"
          description="At least 8 characters, with upper and lower case letters, a number and a symbol."
          value={password}
          onChange={(v) => {
            setPassword(v)
            form.clear('password')
          }}
          onEnter={handleSubmit}
          autoComplete="new-password"
          size="lg"
          status={form.status('password')}
        />
        <FormError message={form.errors.form ?? null} />
        <Button
          label="Create account"
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
