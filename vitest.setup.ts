import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// happy-dom has no layout, no ResizeObserver, and no Web Animations. Give tests inert stand-ins;
// individual tests replace them with recording fakes where the behavior matters.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver
}
if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.animate !== "function") {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel() {}, currentTime: 0, onfinish: null })),
  })
}

afterEach(() => {
  cleanup()
})
