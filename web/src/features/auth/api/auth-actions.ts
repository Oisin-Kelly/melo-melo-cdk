import {
  autoSignIn,
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchMFAPreference,
  resendSignUpCode,
  resetPassword,
  setUpTOTP,
  signIn,
  signUp,
  updateMFAPreference,
  updatePassword,
  verifyTOTPSetup,
} from 'aws-amplify/auth'

// Thin wrappers over Amplify's Cognito calls. Each returns what the screen needs to
// decide its next step, and every failure is rethrown as an AuthError with a message
// that is safe to show (Cognito's raw messages are often technical).

/** Which form field an error belongs next to; `form` means show it above the button. */
export type AuthErrorField = 'username' | 'email' | 'password' | 'currentPassword' | 'confirm' | 'code' | 'form'

export class AuthError extends Error {
  readonly field: AuthErrorField

  constructor(message: string, field: AuthErrorField = 'form') {
    super(message)
    this.name = 'AuthError'
    this.field = field
  }
}

/** The sign-in's code step ran out of time (Cognito allows 3 minutes): start again from the password. */
export class SignInExpiredError extends AuthError {
  constructor() {
    super('That took too long. Sign in again.')
    this.name = 'SignInExpiredError'
  }
}

// An authenticator-app code that doesn't match (sign-in and two-step setup alike)
const wrongAppCode = () => new AuthError("That code isn't right. Check your authenticator app.", 'code')

function toAuthError(error: unknown): AuthError {
  // Already user-safe (thrown by one of the wrappers below): keep it as it is
  if (error instanceof AuthError) return error
  const name = (error as { name?: string })?.name ?? ''
  const message = (error as { message?: string })?.message ?? ''

  switch (name) {
    case 'NotAuthorizedException':
      return new AuthError('Incorrect username or password.')
    case 'UsernameExistsException':
      return new AuthError('That username is taken.', 'username')
    case 'CodeMismatchException':
      return new AuthError("That code isn't right. Check the email and try again.", 'code')
    case 'ExpiredCodeException':
      return new AuthError('That code has expired. Send a new one.', 'code')
    case 'InvalidPasswordException':
      return new AuthError(
        'Use at least 8 characters with upper and lower case letters, a number and a symbol.',
        'password',
      )
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return new AuthError('Too many attempts. Wait a few minutes and try again.')
    case 'UserLambdaValidationException':
      // Raised by the PreSignUp trigger (CheckEmailExistenceLambda)
      if (message.includes('Email is already in use'))
        return new AuthError('An account with that email already exists.', 'email')
      if (message.includes('Email is invalid')) return new AuthError('Enter a valid email.', 'email')
      if (message.includes("That username isn't available"))
        return new AuthError("That username isn't available.", 'username')
      if (message.includes('Username is invalid'))
        return new AuthError(USERNAME_RULE, 'username')
      return new AuthError("We couldn't create your account. Try again.")
    case 'NetworkError':
      return new AuthError("Can't reach the server. Check your connection.")
    default:
      return new AuthError('Something went wrong. Please try again.')
  }
}

export const USERNAME_RULE = 'Usernames are 2–30 letters, numbers, dots or underscores.'

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw toAuthError(error)
  }
}

/**
 * `done` → signed in; `verify` → the account exists but its email isn't confirmed yet;
 * `totp` → two-step verification is on, so it needs the authenticator app's code next.
 */
export type SignInResult = 'done' | 'verify' | 'totp'

export function signInWithPassword(username: string, password: string): Promise<SignInResult> {
  return run(async () => {
    const { isSignedIn, nextStep } = await signIn({ username: username.trim(), password })
    if (isSignedIn) return 'done'
    if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return 'verify'
    if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp'
    throw new AuthError('This account needs attention before you can sign in.')
  })
}

/** The sign-in's second step: the 6-digit code from the authenticator app. */
export function confirmSignInCode(code: string): Promise<void> {
  return run(async () => {
    try {
      const { isSignedIn } = await confirmSignIn({ challengeResponse: code.trim() })
      if (!isSignedIn) throw new AuthError('This account needs attention before you can sign in.')
    } catch (error) {
      const { name, message = '' } = (error ?? {}) as { name?: string; message?: string }
      if (name === 'CodeMismatchException') throw wrongAppCode()
      // The challenge session has expired (or there isn't one, e.g. after a reload)
      if (name === 'NotAuthorizedException' && /session/i.test(message)) throw new SignInExpiredError()
      if (name === 'SignInException') throw new SignInExpiredError()
      throw error
    }
  })
}

export function createAccount(username: string, email: string, password: string): Promise<void> {
  return run(async () => {
    await signUp({
      username: username.trim(),
      password,
      // autoSignIn lets the verify step sign straight in after the code is accepted
      options: { userAttributes: { email: email.trim() }, autoSignIn: true },
    })
  })
}

/** `true` when the verified account was signed in automatically (same session as sign-up). */
export function verifyAccount(username: string, code: string): Promise<boolean> {
  return run(async () => {
    const { nextStep } = await confirmSignUp({
      username: username.trim(),
      confirmationCode: code.trim(),
    })
    if (nextStep.signUpStep !== 'COMPLETE_AUTO_SIGN_IN') return false
    try {
      const { isSignedIn } = await autoSignIn()
      return isSignedIn
    } catch {
      return false // e.g. the page was reloaded between sign-up and verify
    }
  })
}

export function resendVerificationCode(username: string): Promise<void> {
  return run(async () => {
    await resendSignUpCode({ username: username.trim() })
  })
}

export function requestPasswordReset(username: string): Promise<void> {
  return run(async () => {
    await resetPassword({ username: username.trim() })
  })
}

export function setNewPassword(username: string, code: string, newPassword: string): Promise<void> {
  return run(async () => {
    await confirmResetPassword({
      username: username.trim(),
      confirmationCode: code.trim(),
      newPassword,
    })
  })
}

/** Signed in: replaces the password. Cognito checks the current one (wrong → on that field). */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return run(async () => {
    try {
      await updatePassword({ oldPassword: currentPassword, newPassword })
    } catch (error) {
      // Here NotAuthorizedException means the current password is wrong, not the username
      if ((error as { name?: string })?.name === 'NotAuthorizedException')
        throw new AuthError("That's not your current password.", 'currentPassword')
      throw error
    }
  })
}

// ---- Two-step verification (TOTP), signed in ----

/** Whether two-step verification is on for the signed-in account. */
export function getTwoStepStatus(): Promise<boolean> {
  return run(async () => {
    const { enabled } = await fetchMFAPreference()
    return enabled?.includes('TOTP') ?? false
  })
}

export type TwoStepSetup = {
  /** The otpauth:// link authenticator apps read (as a QR code, or opened directly on a phone). */
  uri: string
  /** The same secret as text, to type in by hand. */
  key: string
}

/** Starts setting up two-step verification: a new secret for the authenticator app. */
export function startTwoStepSetup(username: string): Promise<TwoStepSetup> {
  return run(async () => {
    const details = await setUpTOTP()
    return { uri: details.getSetupUri('MeloMelo', username).toString(), key: details.sharedSecret }
  })
}

/** Checks the app's first code against the new secret, then turns two-step verification on. */
export function finishTwoStepSetup(code: string): Promise<void> {
  return run(async () => {
    try {
      await verifyTOTPSetup({ code: code.trim() })
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'CodeMismatchException' || name === 'EnableSoftwareTokenMFAException') throw wrongAppCode()
      throw error
    }
    await updateMFAPreference({ totp: 'PREFERRED' })
  })
}

export function turnOffTwoStep(): Promise<void> {
  return run(async () => {
    await updateMFAPreference({ totp: 'DISABLED' })
  })
}
