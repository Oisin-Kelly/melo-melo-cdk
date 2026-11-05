import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signUp,
  updatePassword,
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

/** `done` → signed in; `verify` → the account exists but its email isn't confirmed yet. */
export type SignInResult = 'done' | 'verify'

export function signInWithPassword(username: string, password: string): Promise<SignInResult> {
  return run(async () => {
    const { isSignedIn, nextStep } = await signIn({ username: username.trim(), password })
    if (isSignedIn) return 'done'
    if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return 'verify'
    throw new AuthError('This account needs attention before you can sign in.')
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
