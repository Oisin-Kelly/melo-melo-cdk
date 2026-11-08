import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { sileo } from 'sileo'
import { renderSVG } from 'uqr'
import { PageLoader } from '@/components/feedback/page-loader'
import { BackButton } from '@/components/navigation/back-button'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useUsername } from '@/lib/auth/auth-context'
import {
  finishTwoStepSetup,
  getTwoStepStatus,
  startTwoStepSetup,
  turnOffTwoStep,
  type TwoStepSetup,
} from '../api/auth-actions'
import { useAuthForm } from '../hooks/use-auth-form'
import { FormError } from './form-error'
import './two-step.css'

const statusKey = ['auth', 'two-step'] as const

// The setup key in groups of four, easier to read and type into an app by hand
const groupKey = (key: string) => key.match(/.{1,4}/g) ?? [key]

// Settings → Two-step verification: optional, with an authenticator app (TOTP). Off → Turn
// on → scan the QR code (or open the app straight from a phone, or type the key) → enter the
// app's first code → on. On → Turn off, after a confirm. There are no backup codes: a lost
// phone is turned off by the owner (scripts/disable-two-step.sh), which the setup says.
export function TwoStepPage() {
  const username = useUsername()
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: statusKey, queryFn: getTwoStepStatus })
  const [setup, setSetup] = useState<TwoStepSetup | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [isTurningOff, setIsTurningOff] = useState(false)

  const setOn = (isOn: boolean) => queryClient.setQueryData(statusKey, isOn)

  const start = async () => {
    setIsStarting(true)
    setStartError(null)
    try {
      setSetup(await startTwoStepSetup(username))
    } catch (error) {
      setStartError((error as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  let body
  if (status.isPending) body = <PageLoader compact what="settings" />
  else if (status.isError)
    body = (
      <VStack gap={3} hAlign="start">
        <Text color="secondary">Couldn't check your two-step verification.</Text>
        <Button label="Try again" variant="secondary" onClick={() => void status.refetch()} />
      </VStack>
    )
  else if (status.data)
    body = (
      <VStack gap={4} hAlign="start">
        <HStack gap={2} vAlign="center">
          <Icon icon={ShieldCheckIcon} color="success" />
          <Text weight="semibold">Two-step verification is on</Text>
        </HStack>
        <Text color="secondary">You'll be asked for a code from your authenticator app each time you sign in.</Text>
        <Button label="Turn off" variant="secondary" onClick={() => setIsTurningOff(true)} />
        <TurnOffDialog isOpen={isTurningOff} onOpenChange={setIsTurningOff} onDone={() => setOn(false)} />
      </VStack>
    )
  else if (setup)
    body = (
      <SetupSteps
        setup={setup}
        onDone={() => {
          setSetup(null)
          setOn(true)
          sileo.success({ title: 'Two-step verification is on' })
        }}
      />
    )
  else
    body = (
      <VStack gap={4} hAlign="start">
        <Text color="secondary">
          Add a second step when you sign in: after your password, a 6-digit code from an authenticator app on your
          phone, like Google Authenticator, 1Password or your phone's passwords app.
        </Text>
        <FormError message={startError} />
        <Button label="Turn on" variant="primary" isLoading={isStarting} onClick={() => void start()} />
      </VStack>
    )

  return (
    <VStack gap={6} maxWidth="30rem">
      <VStack gap={2}>
        <BackButton fallback="/settings" className="mm-page-back" />
        <Heading level={1}>Two-step verification</Heading>
      </VStack>
      {body}
    </VStack>
  )
}

function SetupSteps({ setup, onDone }: { setup: TwoStepSetup; onDone: () => void }) {
  const isMobile = useIsMobile()
  const [code, setCode] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const form = useAuthForm()

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.key)
      setIsCopied(true)
    } catch {
      // Clipboard blocked: the key is still on screen to select by hand
    }
  }

  const handleSubmit = () =>
    form.submit({ code: /^\d{6}$/.test(code.trim()) ? null : 'Enter the 6-digit code from the app.' }, async () => {
      await finishTwoStepSetup(code)
      onDone()
    })

  return (
    <VStack gap={5}>
      <VStack gap={3}>
        <Text weight="semibold">1. Add MeloMelo to your authenticator app</Text>
        {isMobile ? (
          <Button label="Open in authenticator app" variant="secondary" width="100%" href={setup.uri} />
        ) : (
          <>
            <Text color="secondary">Scan this QR code with the app.</Text>
            {/* The QR code is data, drawn dark-on-light whatever the theme so every app can read it */}
            <span
              className="mm-qr"
              role="img"
              aria-label="QR code for your authenticator app"
              dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri, { border: 2 }) }}
            />
          </>
        )}
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            {isMobile ? 'Or enter this setup key in the app:' : "Can't scan it? Enter this setup key instead:"}
          </Text>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="semibold" className="mm-setup-key">
              {/* Groups of four that never split; the lines are balanced so a group doesn't
                  dangle on a line of its own */}
              {groupKey(setup.key).map((group, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className="mm-setup-key-group">{group}</span>
                </span>
              ))}
            </Text>
            <Button label={isCopied ? 'Copied' : 'Copy'} variant="ghost" size="sm" onClick={() => void copyKey()} />
          </HStack>
        </VStack>
      </VStack>

      <VStack gap={3}>
        <Text weight="semibold">2. Enter the code the app shows</Text>
        <TextInput
          label="Code"
          value={code}
          onChange={(v) => {
            setCode(v)
            form.clear('code')
          }}
          onEnter={handleSubmit}
          autoComplete="one-time-code"
          status={form.status('code')}
        />
        <FormError message={form.errors.form ?? null} />
        <Button label="Turn on" variant="primary" width="100%" isLoading={form.isSubmitting} onClick={handleSubmit} />
        <Text type="supporting" color="secondary">
          If you lose your phone, contact support to turn this off.
        </Text>
      </VStack>
    </VStack>
  )
}

// A failure stays in the dialog (a toast would sit behind it); the success toast fires as it closes
function TurnOffDialog({
  isOpen,
  onOpenChange,
  onDone,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onDone: () => void
}) {
  const [isWorking, setIsWorking] = useState(false)
  const [didFail, setDidFail] = useState(false)

  const confirm = async () => {
    setIsWorking(true)
    setDidFail(false)
    try {
      await turnOffTwoStep()
    } catch {
      setDidFail(true)
      return
    } finally {
      setIsWorking(false)
    }
    onOpenChange(false)
    onDone()
    sileo.success({ title: 'Two-step verification is off' })
  }

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) setDidFail(false)
      }}
      title="Turn off two-step verification?"
      description={
        didFail
          ? "Couldn't turn it off. Check your connection and try again."
          : "You'll sign in with just your password."
      }
      actionLabel="Turn off"
      isActionLoading={isWorking}
      onAction={() => void confirm()}
    />
  )
}
