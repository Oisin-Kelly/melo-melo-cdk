import { Center } from '@astryxdesign/core/Center'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { ReactNode } from 'react'
import { GradientBlobs } from '@/components/brand/gradient-blobs'
import { Wordmark } from '@/components/brand/wordmark'
import './auth.css'

type AuthLayoutProps = {
  title: string
  subtitle?: ReactNode
  /** The form fields and submit button. */
  children: ReactNode
  /** Secondary links under the form ("New here? Create an account"). */
  footer?: ReactNode
}

// Split screen from the login-split template: the form on the left, slow gradient
// blobs on the right (decorative, no text). Below the md breakpoint the art is dropped and the form
// takes the full width.
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="mm-auth">
      <VStack padding={8} gap={6} minHeight="100%">
        <Wordmark size="lg" href="/" />
        <Center axis="both" height="100%">
          <VStack gap={6} width="100%" maxWidth={380}>
            <VStack gap={1}>
              <Heading level={1}>{title}</Heading>
              {subtitle && (
                <Text type="body" color="secondary">
                  {subtitle}
                </Text>
              )}
            </VStack>
            {children}
            {footer && (
              <Text type="supporting" color="secondary">
                {footer}
              </Text>
            )}
          </VStack>
        </Center>
      </VStack>
      <div className="mm-auth-art" aria-hidden="true">
        <GradientBlobs />
      </div>
    </div>
  )
}
