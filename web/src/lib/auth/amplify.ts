import { Amplify } from 'aws-amplify'
import { env } from '@/config/env'

// Cognito via Amplify's auth category only (no hosted UI, no other categories).
// Sign-in uses SRP, which the user pool client enables (infra/AuthStack.cs); users
// can sign in with either their username or their email.
let configured = false

export function configureAmplify(): void {
  if (configured) return
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.cognitoUserPoolId,
        userPoolClientId: env.cognitoClientId,
        loginWith: { username: true, email: true },
      },
    },
  })
  configured = true
}
