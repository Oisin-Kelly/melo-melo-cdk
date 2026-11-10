import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())

// Toasts are fire-and-forget calls; tests assert them on this mock instead of rendering a Toaster
vi.mock('sileo', () => ({
  sileo: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}))

// jsdom lacks these browser APIs. Astryx's useMediaQuery reads matchMedia (desktop by default);
// IntersectionObserver/ResizeObserver are inert unless a test installs its own.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom has <audio> but can't play it (play/pause/load throw "Not implemented"): the invite screen's
// preview player and the app's player only need them to do nothing
window.HTMLMediaElement.prototype.play = () => Promise.resolve()
window.HTMLMediaElement.prototype.pause = () => {}
window.HTMLMediaElement.prototype.load = () => {}

class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
// Assigned (not vi.stubGlobal) so a test's vi.unstubAllGlobals() can't remove them
const globals = globalThis as unknown as Record<string, unknown>
globals.IntersectionObserver ??= InertObserver
globals.ResizeObserver ??= InertObserver

// <dialog> and the popover API, which Astryx's Dialog/DropdownMenu/Popover drive imperatively.
// Just enough state for open/closed to be observable (the `open` attribute, :popover-open).
const dialogProto = HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>
if (!dialogProto.showModal) {
  dialogProto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dialogProto.show = dialogProto.showModal
  dialogProto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
const elementProto = HTMLElement.prototype as HTMLElement & Record<string, unknown>
if (!elementProto.showPopover) {
  elementProto.showPopover = function (this: HTMLElement) {
    this.dataset.popoverOpen = ''
  }
  elementProto.hidePopover = function (this: HTMLElement) {
    delete this.dataset.popoverOpen
  }
  elementProto.togglePopover = function (this: HTMLElement) {
    if ('popoverOpen' in this.dataset) delete this.dataset.popoverOpen
    else this.dataset.popoverOpen = ''
    return 'popoverOpen' in this.dataset
  }
}

// jsdom logs "Not implemented" for these; components call them for focus/scroll niceties
window.scrollTo = () => {}
Element.prototype.scrollIntoView ??= function () {}
