import * as amplify from 'aws-amplify/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  changePassword,
  confirmSignInCode,
  createAccount,
  finishTwoStepSetup,
  getTwoStepStatus,
  SignInExpiredError,
  startTwoStepSetup,
  turnOffTwoStep,
  requestPasswordReset,
  resendVerificationCode,
  setNewPassword,
  signInWithPassword,
  USERNAME_RULE,
  verifyAccount,
} from './auth-actions'

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  autoSignIn: vi.fn(),
  resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  updatePassword: vi.fn(),
  confirmSignIn: vi.fn(),
  fetchMFAPreference: vi.fn(),
  setUpTOTP: vi.fn(),
  verifyTOTPSetup: vi.fn(),
  updateMFAPreference: vi.fn(),
}))

const mocked = vi.mocked(amplify)
const cognitoError = (name: string, message = '') => Object.assign(new Error(message), { name })

beforeEach(() => vi.resetAllMocks())

describe('signInWithPassword', () => {
  it('trims the username and reports a finished sign-in', async () => {
    mocked.signIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never)

    await expect(signInWithPassword('  oisin ', 'pw')).resolves.toBe('done')
    expect(mocked.signIn).toHaveBeenCalledWith({ username: 'oisin', password: 'pw' })
  })

  it('sends an unverified account to the verify step', async () => {
    mocked.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' } } as never)

    await expect(signInWithPassword('oisin', 'pw')).resolves.toBe('verify')
  })

  it('asks for the authenticator code when two-step verification is on', async () => {
    mocked.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    } as never)

    await expect(signInWithPassword('oisin', 'pw')).resolves.toBe('totp')
  })

  it('refuses any other next step', async () => {
    mocked.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'RESET_PASSWORD' } } as never)

    await expect(signInWithPassword('oisin', 'pw')).rejects.toBeInstanceOf(AuthError)
  })
})

// Every Cognito failure becomes a user-safe AuthError aimed at the right field
describe('error mapping', () => {
  it.each([
    ['NotAuthorizedException', '', 'Incorrect username or password.', 'form'],
    ['UsernameExistsException', '', 'That username is taken.', 'username'],
    ['CodeMismatchException', '', "That code isn't right. Check the email and try again.", 'code'],
    ['ExpiredCodeException', '', 'That code has expired. Send a new one.', 'code'],
    [
      'InvalidPasswordException',
      '',
      'Use at least 8 characters with upper and lower case letters, a number and a symbol.',
      'password',
    ],
    ['LimitExceededException', '', 'Too many attempts. Wait a few minutes and try again.', 'form'],
    ['TooManyRequestsException', '', 'Too many attempts. Wait a few minutes and try again.', 'form'],
    ['TooManyFailedAttemptsException', '', 'Too many attempts. Wait a few minutes and try again.', 'form'],
    [
      'UserLambdaValidationException',
      'PreSignUp failed: Email is already in use',
      'An account with that email already exists.',
      'email',
    ],
    ['UserLambdaValidationException', 'PreSignUp failed: Email is invalid', 'Enter a valid email.', 'email'],
    [
      'UserLambdaValidationException',
      "PreSignUp failed: That username isn't available",
      "That username isn't available.",
      'username',
    ],
    ['UserLambdaValidationException', 'PreSignUp failed: Username is invalid', USERNAME_RULE, 'username'],
    ['UserLambdaValidationException', 'something else', "We couldn't create your account. Try again.", 'form'],
    ['NetworkError', '', "Can't reach the server. Check your connection.", 'form'],
    ['SomethingNew', 'raw technical text', 'Something went wrong. Please try again.', 'form'],
  ])('%s %j → %j on %s', async (name, message, expected, field) => {
    mocked.signUp.mockRejectedValue(cognitoError(name, message))

    const error = await createAccount('oisin', 'o@x.com', 'pw').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AuthError)
    expect(error).toMatchObject({ message: expected, field })
  })

  it('handles a thrown non-error', async () => {
    mocked.resetPassword.mockRejectedValue(undefined)

    await expect(requestPasswordReset('oisin')).rejects.toMatchObject({
      message: 'Something went wrong. Please try again.',
      field: 'form',
    })
  })
})

describe('createAccount', () => {
  it('trims, sends the email and asks for auto sign-in after verifying', async () => {
    mocked.signUp.mockResolvedValue({} as never)

    await createAccount(' oisin ', ' o@x.com ', 'Secret1!')

    expect(mocked.signUp).toHaveBeenCalledWith({
      username: 'oisin',
      password: 'Secret1!',
      options: { userAttributes: { email: 'o@x.com' }, autoSignIn: true },
    })
  })
})

describe('verifyAccount', () => {
  it('signs straight in when Cognito offers auto sign-in', async () => {
    mocked.confirmSignUp.mockResolvedValue({ nextStep: { signUpStep: 'COMPLETE_AUTO_SIGN_IN' } } as never)
    mocked.autoSignIn.mockResolvedValue({ isSignedIn: true } as never)

    await expect(verifyAccount(' oisin ', ' 123456 ')).resolves.toBe(true)
    expect(mocked.confirmSignUp).toHaveBeenCalledWith({ username: 'oisin', confirmationCode: '123456' })
  })

  it('returns false when there is no auto sign-in step', async () => {
    mocked.confirmSignUp.mockResolvedValue({ nextStep: { signUpStep: 'DONE' } } as never)

    await expect(verifyAccount('oisin', '123456')).resolves.toBe(false)
    expect(mocked.autoSignIn).not.toHaveBeenCalled()
  })

  it('returns false (not an error) when auto sign-in fails, e.g. after a reload', async () => {
    mocked.confirmSignUp.mockResolvedValue({ nextStep: { signUpStep: 'COMPLETE_AUTO_SIGN_IN' } } as never)
    mocked.autoSignIn.mockRejectedValue(new Error('no session'))

    await expect(verifyAccount('oisin', '123456')).resolves.toBe(false)
  })
})

describe('codes and password reset', () => {
  it('resends the verification code for the trimmed username', async () => {
    mocked.resendSignUpCode.mockResolvedValue({} as never)
    await resendVerificationCode(' oisin ')
    expect(mocked.resendSignUpCode).toHaveBeenCalledWith({ username: 'oisin' })
  })

  it('requests a reset and sets the new password with a trimmed code', async () => {
    mocked.resetPassword.mockResolvedValue({} as never)
    mocked.confirmResetPassword.mockResolvedValue(undefined)

    await requestPasswordReset(' oisin ')
    await setNewPassword(' oisin ', ' 654321 ', 'New-pass1')

    expect(mocked.resetPassword).toHaveBeenCalledWith({ username: 'oisin' })
    expect(mocked.confirmResetPassword).toHaveBeenCalledWith({
      username: 'oisin',
      confirmationCode: '654321',
      newPassword: 'New-pass1',
    })
  })
})

describe('changePassword', () => {
  it('passes both passwords to Cognito', async () => {
    mocked.updatePassword.mockResolvedValue(undefined)
    await changePassword('Old1!pass', 'New1!pass')
    expect(mocked.updatePassword).toHaveBeenCalledWith({ oldPassword: 'Old1!pass', newPassword: 'New1!pass' })
  })

  it('a wrong current password is reported on that field, not as a sign-in failure', async () => {
    mocked.updatePassword.mockRejectedValue(cognitoError('NotAuthorizedException', 'Incorrect username or password.'))
    await expect(changePassword('nope', 'New1!pass')).rejects.toMatchObject({
      message: "That's not your current password.",
      field: 'currentPassword',
    })
  })

  it('a new password Cognito rejects goes on the new password field', async () => {
    mocked.updatePassword.mockRejectedValue(cognitoError('InvalidPasswordException'))
    await expect(changePassword('Old1!pass', 'weak')).rejects.toMatchObject({ field: 'password' })
    await expect(changePassword('Old1!pass', 'weak')).rejects.toBeInstanceOf(AuthError)
  })
})

describe('confirmSignInCode', () => {
  it('sends the trimmed code', async () => {
    mocked.confirmSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never)

    await confirmSignInCode(' 123456 ')

    expect(mocked.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: '123456' })
  })

  it('says a wrong code is wrong, next to the code field', async () => {
    mocked.confirmSignIn.mockRejectedValue(cognitoError('CodeMismatchException'))

    await expect(confirmSignInCode('000000')).rejects.toMatchObject({
      message: "That code isn't right. Check your authenticator app.",
      field: 'code',
    })
  })

  it('turns an expired session into a fresh start', async () => {
    mocked.confirmSignIn.mockRejectedValue(cognitoError('NotAuthorizedException', 'Invalid session for the user, session is expired.'))

    await expect(confirmSignInCode('123456')).rejects.toBeInstanceOf(SignInExpiredError)
  })
})

describe('two-step verification', () => {
  it('is on when TOTP is enabled', async () => {
    mocked.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP'], preferred: 'TOTP' } as never)
    await expect(getTwoStepStatus()).resolves.toBe(true)

    mocked.fetchMFAPreference.mockResolvedValue({} as never)
    await expect(getTwoStepStatus()).resolves.toBe(false)
  })

  it('starts setup with an otpauth link for MeloMelo and the key as text', async () => {
    const getSetupUri = vi.fn(() => new URL('otpauth://totp/MeloMelo:oisin?secret=ABCD&issuer=MeloMelo'))
    mocked.setUpTOTP.mockResolvedValue({ sharedSecret: 'ABCD', getSetupUri } as never)

    await expect(startTwoStepSetup('oisin')).resolves.toEqual({
      uri: 'otpauth://totp/MeloMelo:oisin?secret=ABCD&issuer=MeloMelo',
      key: 'ABCD',
    })
    expect(getSetupUri).toHaveBeenCalledWith('MeloMelo', 'oisin')
  })

  it('verifies the first code, then makes TOTP the preferred second step', async () => {
    mocked.verifyTOTPSetup.mockResolvedValue()
    mocked.updateMFAPreference.mockResolvedValue()

    await finishTwoStepSetup(' 123456 ')

    expect(mocked.verifyTOTPSetup).toHaveBeenCalledWith({ code: '123456' })
    expect(mocked.updateMFAPreference).toHaveBeenCalledWith({ totp: 'PREFERRED' })
  })

  it('a wrong first code leaves it off', async () => {
    mocked.verifyTOTPSetup.mockRejectedValue(cognitoError('EnableSoftwareTokenMFAException'))

    await expect(finishTwoStepSetup('000000')).rejects.toMatchObject({ field: 'code' })
    expect(mocked.updateMFAPreference).not.toHaveBeenCalled()
  })

  it('turns off', async () => {
    mocked.updateMFAPreference.mockResolvedValue()
    await turnOffTwoStep()
    expect(mocked.updateMFAPreference).toHaveBeenCalledWith({ totp: 'DISABLED' })
  })
})
