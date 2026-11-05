import { Banner } from '@astryxdesign/core/Banner'

// Form-level error (not tied to one field), shown above the submit button.
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <Banner status="error" title={message} collapsible={false} />
}
