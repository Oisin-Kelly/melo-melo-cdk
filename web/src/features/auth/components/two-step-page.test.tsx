import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { expectMessage } from '@/testing/messages'
import { renderWithProviders } from '@/testing/providers'
import * as actions from '../api/auth-actions'
import { AuthError } from '../api/auth-actions'
import { TwoStepPage } from './two-step-page'

vi.mock('../api/auth-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth-actions')>()),
  getTwoStepStatus: vi.fn(),
  startTwoStepSetup: vi.fn(),
  finishTwoStepSetup: vi.fn(),
  turnOffTwoStep: vi.fn(),
}))
vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))
const mocked = vi.mocked(actions)
const setup = { uri: 'otpauth://totp/MeloMelo:ronan?secret=JBSWY3DPEHPK3PXP&issuer=MeloMelo', key: 'JBSWY3DPEHPK3PXP' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(mobile.useIsMobile).mockReturnValue(false)
})

function renderPage() {
  const result = renderWithProviders(<TwoStepPage />, { route: '/settings/two-step', username: 'ronan' })
  return { ...result, user: userEvent.setup() }
}

describe('TwoStepPage', () => {
  it('turns on: QR code + key, then the first code', async () => {
    mocked.getTwoStepStatus.mockResolvedValue(false)
    mocked.startTwoStepSetup.mockResolvedValue(setup)
    mocked.finishTwoStepSetup.mockResolvedValue()
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn on' }))

    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument()
    // In groups of four (each its own unbreakable span)
    expect(document.querySelector('.mm-setup-key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP')
    expect(mocked.startTwoStepSetup).toHaveBeenCalledWith('ronan')

    await user.type(screen.getByLabelText('Code'), '123456{Enter}')

    expect(await screen.findByText('Two-step verification is on')).toBeInTheDocument()
    expect(mocked.finishTwoStepSetup).toHaveBeenCalledWith('123456')
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Two-step verification is on' })
  })

  it('on phones, opens the authenticator app instead of showing a QR code', async () => {
    vi.mocked(mobile.useIsMobile).mockReturnValue(true)
    mocked.getTwoStepStatus.mockResolvedValue(false)
    mocked.startTwoStepSetup.mockResolvedValue(setup)
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn on' }))

    expect(await screen.findByRole('link', { name: 'Open in authenticator app' })).toHaveAttribute('href', setup.uri)
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()
  })

  it('keeps it off when the first code is wrong', async () => {
    mocked.getTwoStepStatus.mockResolvedValue(false)
    mocked.startTwoStepSetup.mockResolvedValue(setup)
    mocked.finishTwoStepSetup.mockRejectedValue(new AuthError("That code isn't right. Check your authenticator app.", 'code'))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn on' }))
    await user.type(await screen.findByLabelText('Code'), '000000{Enter}')

    await vi.waitFor(() => expectMessage("That code isn't right. Check your authenticator app."))
    expect(screen.queryByText('Two-step verification is on')).not.toBeInTheDocument()
  })

  it('turns off after a confirm', async () => {
    mocked.getTwoStepStatus.mockResolvedValue(true)
    mocked.turnOffTwoStep.mockResolvedValue()
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn off' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent("You'll sign in with just your password.")
    await user.click(screen.getAllByRole('button', { name: 'Turn off' }).at(-1)!)

    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Two-step verification is off' })
  })

  it('says so in the dialog when turning off fails', async () => {
    mocked.getTwoStepStatus.mockResolvedValue(true)
    mocked.turnOffTwoStep.mockRejectedValue(new Error('offline'))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn off' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getAllByRole('button', { name: 'Turn off' }).at(-1)!)

    expect(await screen.findByText("Couldn't turn it off. Check your connection and try again.")).toBeInTheDocument()
    expect(sileo.success).not.toHaveBeenCalled()
  })
})
