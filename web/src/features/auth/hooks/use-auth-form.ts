import { useState } from 'react'
import { AuthError, type AuthErrorField } from '../api/auth-actions'

type Errors = Partial<Record<AuthErrorField, string>>

// Shared submit/error state for the auth forms. `submit` runs client checks first
// (any non-null message blocks the request), then the action, routing an AuthError
// to the field it belongs to.
export function useAuthForm() {
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(
    checks: Partial<Record<AuthErrorField, string | null>>,
    action: () => Promise<void>,
  ) {
    const failed = Object.fromEntries(Object.entries(checks).filter(([, m]) => m)) as Errors
    setErrors(failed)
    if (Object.keys(failed).length > 0) return

    setIsSubmitting(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof AuthError) setErrors({ [error.field]: error.message })
      else setErrors({ form: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Clears one field's error as the user edits it. */
  function clear(field: AuthErrorField) {
    setErrors((current) => {
      if (!current[field] && !current.form) return current
      const { [field]: _, form: __, ...rest } = current
      return rest
    })
  }

  const status = (field: AuthErrorField) =>
    errors[field] ? { type: 'error' as const, message: errors[field] } : undefined

  return { errors, isSubmitting, submit, clear, status }
}
