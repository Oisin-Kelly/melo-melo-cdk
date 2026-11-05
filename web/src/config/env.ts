// Single source of truth for environment configuration. Import `env` from here
// — never read import.meta.env directly in features or lib code. Fail fast at
// startup if a required variable is missing rather than at the first fetch.
function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  cognitoClientId: required(
    'VITE_COGNITO_CLIENT_ID',
    import.meta.env.VITE_COGNITO_CLIENT_ID,
  ),
  cognitoUserPoolId: required(
    'VITE_COGNITO_USER_POOL_ID',
    import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ),
  awsRegion: required('VITE_AWS_REGION', import.meta.env.VITE_AWS_REGION),
} as const
