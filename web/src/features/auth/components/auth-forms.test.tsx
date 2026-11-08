import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { expectMessage, expectNoMessage } from '@/testing/messages'
import * as actions from '../api/auth-actions'
import { AuthError, SignInExpiredError } from '../api/auth-actions'
import { ChangePasswordPage } from './change-password-page'
import { ForgotPasswordForm } from './forgot-password-form'
import { SignInForm } from './sign-in-form'
import { SignUpForm } from './sign-up-form'
import { VerifyForm } from './verify-form'

vi.mock('../api/auth-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth-actions')>()),
  signInWithPassword: vi.fn(),
  confirmSignInCode: vi.fn(),
  createAccount: vi.fn(),
  verifyAccount: vi.fn(),
  resendVerificationCode: vi.fn(),
  requestPasswordReset: vi.fn(),
  setNewPassword: vi.fn(),
  changePassword: vi.fn(),
}))
const mocked = vi.mocked(actions)

beforeEach(() => vi.resetAllMocks())

/** Renders `form` at `route`, with every other path showing where we ended up. */
function renderForm(form: React.ReactElement, route: string) {
  const path = route.split('?')[0]
  const result = renderWithProviders(
    <Routes>
      <Route path={path} element={form} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, status: 'signedOut', username: null },
  )
  return { ...result, user: userEvent.setup() }
}

const location = () => screen.queryByTestId('location')?.textContent
// Submitting is async (the Cognito call, then navigate), so wait for where it lands
const waitForLocation = (path: string) => vi.waitFor(() => expect(location()).toBe(path))

describe('SignInForm', () => {
  it('checks both fields before calling Cognito', async () => {
    const { user } = renderForm(<SignInForm />, '/login')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expectMessage('Enter your username or email.')
    expectMessage('Enter your password.')
    expect(mocked.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in, refreshes the session and goes on to ?next=', async () => {
    mocked.signInWithPassword.mockResolvedValue('done')
    const { user, auth } = renderForm(<SignInForm />, '/login?next=%2Fliked')

    await user.type(screen.getByLabelText('Username or email'), 'oisin')
    await user.type(screen.getByLabelText('Password'), 'Secret1!{Enter}')

    await waitForLocation('/liked')
    expect(mocked.signInWithPassword).toHaveBeenCalledWith('oisin', 'Secret1!')
    expect(auth.refresh).toHaveBeenCalled()
  })

  it('sends an unverified account to the verify screen', async () => {
    mocked.signInWithPassword.mockResolvedValue('verify')
    const { user } = renderForm(<SignInForm />, '/login')

    await user.type(screen.getByLabelText('Username or email'), ' Oisin ')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitForLocation('/verify?username=Oisin')
  })

  it('shows a wrong password above the button, and clears it as you type', async () => {
    mocked.signInWithPassword.mockRejectedValue(new AuthError('Incorrect username or password.'))
    const { user } = renderForm(<SignInForm />, '/login')

    await user.type(screen.getByLabelText('Username or email'), 'oisin')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await vi.waitFor(() => expectMessage('Incorrect username or password.'))

    await user.type(screen.getByLabelText('Password'), 'x')
    expectNoMessage('Incorrect username or password.')
  })

  describe('with two-step verification on', () => {
    async function toCodeStep(route = '/login?next=%2Fliked') {
      mocked.signInWithPassword.mockResolvedValue('totp')
      const result = renderForm(<SignInForm />, route)
      await result.user.type(screen.getByLabelText('Username or email'), 'oisin')
      await result.user.type(screen.getByLabelText('Password'), 'Secret1!{Enter}')
      await screen.findByRole('heading', { name: 'Enter your code' })
      return result
    }

    it('asks for the app code after the password, then signs in', async () => {
      mocked.confirmSignInCode.mockResolvedValue()
      const { user, auth } = await toCodeStep()
      expect(auth.refresh).not.toHaveBeenCalled()

      await user.type(screen.getByLabelText('Code'), '123456{Enter}')

      await waitForLocation('/liked')
      expect(mocked.confirmSignInCode).toHaveBeenCalledWith('123456')
      expect(auth.refresh).toHaveBeenCalled()
    })

    it('checks the code is 6 digits before calling Cognito', async () => {
      const { user } = await toCodeStep()
      await user.type(screen.getByLabelText('Code'), '12ab{Enter}')
      expectMessage('Enter the 6-digit code.')
      expect(mocked.confirmSignInCode).not.toHaveBeenCalled()
    })

    it('shows a wrong code next to the field', async () => {
      mocked.confirmSignInCode.mockRejectedValue(new AuthError("That code isn't right. Check your authenticator app.", 'code'))
      const { user } = await toCodeStep()

      await user.type(screen.getByLabelText('Code'), '000000{Enter}')

      await vi.waitFor(() => expectMessage("That code isn't right. Check your authenticator app."))
      expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
    })

    it('goes back to the password when the code step has expired', async () => {
      mocked.confirmSignInCode.mockRejectedValue(new SignInExpiredError())
      const { user } = await toCodeStep()

      await user.type(screen.getByLabelText('Code'), '123456{Enter}')

      await screen.findByRole('heading', { name: 'Welcome back' })
      await vi.waitFor(() => expectMessage('That took too long. Sign in again.'))
      expect(screen.getByLabelText('Password')).toHaveValue('')
    })

    it('Back returns to the password step', async () => {
      const { user } = await toCodeStep()
      await user.click(screen.getByText('Back'))
      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    })
  })
})

describe('SignUpForm', () => {
  it('runs the same checks as the backend before calling Cognito', async () => {
    const { user } = renderForm(<SignUpForm />, '/signup')

    await user.type(screen.getByLabelText('Username'), 'library')
    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expectMessage("That username isn't available.")
    expectMessage('Enter a valid email.')
    expectMessage('Use at least 8 characters.')
    expect(mocked.createAccount).not.toHaveBeenCalled()
  })

  it('creates the account and goes to verify with the code already sent', async () => {
    mocked.createAccount.mockResolvedValue(undefined)
    const { user } = renderForm(<SignUpForm />, '/signup')

    await user.type(screen.getByLabelText('Username'), 'oisin.k')
    await user.type(screen.getByLabelText('Email'), 'o@example.com')
    await user.type(screen.getByLabelText('Password'), 'Secret1!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(mocked.createAccount).toHaveBeenCalledWith('oisin.k', 'o@example.com', 'Secret1!')
    await waitForLocation('/verify?username=oisin.k&sent=1')
  })

  it('puts a taken username next to the username field', async () => {
    mocked.createAccount.mockRejectedValue(new AuthError('That username is taken.', 'username'))
    const { user } = renderForm(<SignUpForm />, '/signup')

    await user.type(screen.getByLabelText('Username'), 'oisin')
    await user.type(screen.getByLabelText('Email'), 'o@example.com')
    await user.type(screen.getByLabelText('Password'), 'Secret1!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await vi.waitFor(() => expectMessage('That username is taken.'))
  })
})

describe('VerifyForm', () => {
  it('after sign-up: knows the username, says the code was sent, and signs straight in', async () => {
    mocked.verifyAccount.mockResolvedValue(true)
    const { user, auth } = renderForm(<VerifyForm />, '/verify?username=oisin&sent=1')

    expect(screen.getByText('We sent a 6-digit code to the email you signed up with.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Verification code'), '123456{Enter}')

    await waitForLocation('/')
    expect(mocked.verifyAccount).toHaveBeenCalledWith('oisin', '123456')
    expect(auth.refresh).toHaveBeenCalled()
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Welcome to MeloMelo' })
  })

  it('sends you to sign in when the verified account could not sign in automatically', async () => {
    mocked.verifyAccount.mockResolvedValue(false)
    const { user } = renderForm(<VerifyForm />, '/verify?username=oisin')

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitForLocation('/login')
  })

  it('checks the code shape first', async () => {
    const { user } = renderForm(<VerifyForm />, '/verify?username=oisin')

    await user.type(screen.getByLabelText('Verification code'), '12{Enter}')

    expectMessage('Enter the 6-digit code from the email.')
    expect(mocked.verifyAccount).not.toHaveBeenCalled()
  })

  it('asks for the username when it does not know it, and only then allows a resend', async () => {
    mocked.resendVerificationCode.mockResolvedValue(undefined)
    const { user } = renderForm(<VerifyForm />, '/verify')
    const resend = screen.getByRole('button', { name: 'Send a new code' })
    expect(resend).toBeDisabled()

    await user.type(screen.getByLabelText('Username'), 'oisin')
    await user.click(resend)

    expect(mocked.resendVerificationCode).toHaveBeenCalledWith('oisin')
    await vi.waitFor(() => expect(sileo.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Code sent' })))
  })

  it('says when a new code could not be sent', async () => {
    mocked.resendVerificationCode.mockRejectedValue(new AuthError('Too many attempts. Wait a few minutes and try again.'))
    const { user } = renderForm(<VerifyForm />, '/verify?username=oisin')

    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    await vi.waitFor(() =>
      expect(sileo.error).toHaveBeenCalledWith({
        title: "Couldn't send a code",
        description: 'Too many attempts. Wait a few minutes and try again.',
      }),
    )
  })
})

describe('ForgotPasswordForm', () => {
  it('asks for the account, then the code and new password, then sends you to sign in', async () => {
    mocked.requestPasswordReset.mockResolvedValue(undefined)
    mocked.setNewPassword.mockResolvedValue(undefined)
    const { user } = renderForm(<ForgotPasswordForm />, '/forgot-password')

    await user.type(screen.getByLabelText('Username or email'), 'oisin{Enter}')
    expect(mocked.requestPasswordReset).toHaveBeenCalledWith('oisin')
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), '654321')
    await user.type(screen.getByLabelText('New password'), 'New-pass1{Enter}')

    await waitForLocation('/login')
    expect(mocked.setNewPassword).toHaveBeenCalledWith('oisin', '654321', 'New-pass1')
    expect(sileo.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Password updated' }))
  })

  it('needs an account to send the code to', async () => {
    const { user } = renderForm(<ForgotPasswordForm />, '/forgot-password')

    await user.click(screen.getByRole('button', { name: 'Send code' }))

    expectMessage('Enter your username or email.')
    expect(mocked.requestPasswordReset).not.toHaveBeenCalled()
  })

  it('checks the code and password rules before resetting, and shows a wrong code by the code', async () => {
    mocked.requestPasswordReset.mockResolvedValue(undefined)
    mocked.setNewPassword.mockRejectedValue(new AuthError("That code isn't right. Check the email and try again.", 'code'))
    const { user } = renderForm(<ForgotPasswordForm />, '/forgot-password')
    await user.type(screen.getByLabelText('Username or email'), 'oisin{Enter}')
    await screen.findByText('Choose a new password')

    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expectMessage('Enter the 6-digit code from the email.')
    expect(mocked.setNewPassword).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Code'), '000000')
    await user.type(screen.getByLabelText('New password'), 'New-pass1')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await vi.waitFor(() => expectMessage("That code isn't right. Check the email and try again."))
  })
})

describe('a share link opened while signed out', () => {
  const next = `?next=${encodeURIComponent('/s/AbCdEfGhIjKlMnOpQrStUv')}`

  it('sign-up carries ?next= on to verify, which signs in and goes back to the invite', async () => {
    mocked.createAccount.mockResolvedValue(undefined)
    const { user } = renderForm(<SignUpForm />, `/signup${next}`)

    await user.type(screen.getByLabelText('Username'), 'ronan')
    await user.type(screen.getByLabelText('Email'), 'r@example.com')
    await user.type(screen.getByLabelText('Password'), 'Secret1!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitForLocation(`/verify?username=ronan&sent=1&next=${encodeURIComponent('/s/AbCdEfGhIjKlMnOpQrStUv')}`)
  })

  it('verify signs in and returns to the invite', async () => {
    mocked.verifyAccount.mockResolvedValue(true)
    const { user } = renderForm(<VerifyForm />, `/verify?username=ronan&sent=1&next=${encodeURIComponent('/s/AbCdEfGhIjKlMnOpQrStUv')}`)

    await user.type(screen.getByLabelText('Verification code'), '123456{Enter}')

    await waitForLocation('/s/AbCdEfGhIjKlMnOpQrStUv')
  })

  it('signing in from a new tab (no ?next=) still finds the remembered invite', async () => {
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: 'AbCdEfGhIjKlMnOpQrStUv', savedAt: Date.now() }))
    mocked.signInWithPassword.mockResolvedValue('done')
    const { user } = renderForm(<SignInForm />, '/login')

    await user.type(screen.getByLabelText('Username or email'), 'ronan')
    await user.type(screen.getByLabelText('Password'), 'Secret1!{Enter}')

    await waitForLocation('/s/AbCdEfGhIjKlMnOpQrStUv')
    localStorage.clear()
  })

  it('the links between auth screens keep ?next=', () => {
    renderForm(<SignInForm />, `/login${next}`)
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', `/signup${next}`)
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', `/forgot-password${next}`)
  })
})

describe('ChangePasswordPage', () => {
  // Signed in, unlike the other auth screens
  function renderPage() {
    const result = renderWithProviders(
      <Routes>
        <Route path="/settings/password" element={<ChangePasswordPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>,
      { route: '/settings/password', username: 'ronan' },
    )
    return { ...result, user: userEvent.setup() }
  }

  it('checks every field before calling Cognito', async () => {
    const { user } = renderPage()
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Confirm new password'), 'other')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expectMessage('Enter your current password.')
    expectMessage('Use at least 8 characters.')
    expectMessage("The passwords don't match.")
    expect(mocked.changePassword).not.toHaveBeenCalled()
  })

  it('puts a wrong current password next to that field', async () => {
    mocked.changePassword.mockRejectedValue(new AuthError("That's not your current password.", 'currentPassword'))
    const { user } = renderPage()
    await user.type(screen.getByLabelText('Current password'), 'Wrong1!x')
    await user.type(screen.getByLabelText('New password'), 'Secret1!x')
    await user.type(screen.getByLabelText('Confirm new password'), 'Secret1!x{Enter}')

    await vi.waitFor(() => expectMessage("That's not your current password."))
  })

  it('changes it and goes back to Settings', async () => {
    mocked.changePassword.mockResolvedValue(undefined)
    const { user } = renderPage()
    await user.type(screen.getByLabelText('Current password'), 'Old1!pass')
    await user.type(screen.getByLabelText('New password'), 'Secret1!x')
    await user.type(screen.getByLabelText('Confirm new password'), 'Secret1!x')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    await waitForLocation('/settings')
    expect(mocked.changePassword).toHaveBeenCalledWith('Old1!pass', 'Secret1!x')
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Password changed' })
  })
})
