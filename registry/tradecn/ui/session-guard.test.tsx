import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClock } from "@/registry/tradecn/lib/clock"
import { DEFAULT_SESSION_GUARD_LABELS, DEFAULT_WARN_MS, SessionGuard, SessionStatus, sessionStatus } from "@/registry/tradecn/ui/session-guard"

const T0 = 1_700_000_000_000
const MINUTE = 60_000
let t = T0

beforeEach(() => {
  vi.useFakeTimers()
  t = T0
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** The fake clock's time moves and its interval fires, so everything on the clock re-renders. */
const tick = (ms: number) =>
  act(() => {
    t += ms
    vi.advanceTimersByTime(ms)
  })

const root = () => document.querySelector<HTMLElement>("[data-slot='tradecn-session-guard']")!

describe("sessionStatus", () => {
  it("is none without an end, live before the window, warning inside it, and expired at or past the end", () => {
    expect(sessionStatus(null, T0)).toEqual({ phase: "none", remainingMs: null, expiresAt: null })
    expect(sessionStatus(undefined, T0)).toEqual({ phase: "none", remainingMs: null, expiresAt: null })
    expect(sessionStatus(NaN, T0).phase).toBe("none")
    expect(sessionStatus(T0 + 5 * MINUTE, T0)).toEqual({ phase: "live", remainingMs: 5 * MINUTE, expiresAt: T0 + 5 * MINUTE })
    expect(sessionStatus(T0 + DEFAULT_WARN_MS + 1, T0).phase).toBe("live")
    expect(sessionStatus(T0 + DEFAULT_WARN_MS, T0).phase).toBe("warning")
    expect(sessionStatus(T0 + 1, T0).phase).toBe("warning")
    expect(sessionStatus(T0, T0).phase).toBe("expired")
    expect(sessionStatus(T0 - MINUTE, T0)).toEqual({ phase: "expired", remainingMs: -MINUTE, expiresAt: T0 - MINUTE })
    expect(sessionStatus(T0 + 30_000, T0, 10_000).phase).toBe("live")
    expect(sessionStatus(T0 + 9_000, T0, 10_000).phase).toBe("warning")
  })
})

describe("the guard", () => {
  it("shows nothing while the session is live, the banner with a countdown in the warning window, and the wall at expiry, firing onExpire once", () => {
    const clock = createClock(1000, () => t)
    const onExpire = vi.fn()
    render(
      <SessionGuard expiresAt={T0 + 5 * MINUTE} clock={clock} onReauthenticate={() => Promise.resolve(true)} onExpire={onExpire}>
        <p>Use your token</p>
      </SessionGuard>,
    )
    expect(root()).toHaveAttribute("data-session-phase", "live")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onExpire).not.toHaveBeenCalled()
    // Into the window: the banner, its countdown, its button.
    tick(3 * MINUTE)
    expect(root()).toHaveAttribute("data-session-phase", "warning")
    const banner = screen.getByRole("status")
    expect(banner).toHaveTextContent("Your session ends in 2:00.")
    expect(banner.querySelector("[data-slot='tradecn-countdown']")).toHaveAttribute("data-tier", "soon")
    expect(screen.getByRole("button", { name: "Stay signed in" })).toBeEnabled()
    expect(screen.queryByRole("dialog")).toBeNull()
    tick(30_000)
    expect(banner).toHaveTextContent("Your session ends in 1:30.")
    // The end: the wall, with the consumer's sign-in inside it; the banner is gone; onExpire once, and only once.
    tick(90_000)
    expect(root()).toHaveAttribute("data-session-phase", "expired")
    expect(screen.queryByRole("status")).toBeNull()
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("Your session has ended")
    expect(dialog).toHaveTextContent("Sign in again to carry on. Nothing on the desk has been lost.")
    expect(dialog).toHaveTextContent("Use your token")
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeEnabled()
    expect(onExpire).toHaveBeenCalledTimes(1)
    tick(5_000)
    expect(onExpire).toHaveBeenCalledTimes(1)
    // A close request is refused: the wall stays until the session is back.
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(root()).toHaveAttribute("data-session-phase", "expired")
  })

  it("asks the consumer for more time from the banner, holds the button while the promise is out, and steps back when expiresAt moves", async () => {
    const clock = createClock(1000, () => t)
    let settle: (ok: boolean) => void = () => {}
    const onReauthenticate = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)))
    const { rerender } = render(<SessionGuard expiresAt={T0 + MINUTE} clock={clock} onReauthenticate={onReauthenticate} />)
    expect(root()).toHaveAttribute("data-session-phase", "warning")
    const button = screen.getByRole("button", { name: "Stay signed in" })
    fireEvent.click(button)
    expect(onReauthenticate).toHaveBeenCalledTimes(1)
    expect(button).toHaveTextContent("Signing in…")
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("data-pending", "true")
    fireEvent.click(button)
    expect(onReauthenticate).toHaveBeenCalledTimes(1)
    await act(async () => {
      settle(true)
      await Promise.resolve()
    })
    expect(button).toHaveTextContent("Stay signed in")
    expect(button).toBeEnabled()
    expect(screen.queryByRole("alert")).toBeNull()
    // The session is what closes the banner: a new end, well ahead.
    rerender(<SessionGuard expiresAt={t + 10 * MINUTE} clock={clock} onReauthenticate={onReauthenticate} />)
    expect(root()).toHaveAttribute("data-session-phase", "live")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("prints a refusal, and a rejection, as an alert beside the button, and forgets it once the session is live again", async () => {
    const clock = createClock(1000, () => t)
    let answer: () => Promise<boolean> = () => Promise.resolve(false)
    const onReauthenticate = vi.fn(() => answer())
    const { rerender } = render(<SessionGuard expiresAt={T0 - 1} clock={clock} onReauthenticate={onReauthenticate} />)
    expect(root()).toHaveAttribute("data-session-phase", "expired")
    const button = screen.getByRole("button", { name: "Sign in again" })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work. Try again.")
    expect(button).toBeEnabled()
    answer = () => Promise.reject(new Error("no route to the identity provider"))
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work. Try again.")
    expect(onReauthenticate).toHaveBeenCalledTimes(2)
    // Live again, then back in the window: the old refusal is not on the banner.
    rerender(<SessionGuard expiresAt={t + 10 * MINUTE} clock={clock} onReauthenticate={onReauthenticate} />)
    expect(root()).toHaveAttribute("data-session-phase", "live")
    tick(9 * MINUTE)
    expect(root()).toHaveAttribute("data-session-phase", "warning")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows nothing at all without a session, and takes its words from labels", () => {
    const clock = createClock(1000, () => t)
    const { rerender } = render(<SessionGuard expiresAt={null} clock={clock} onReauthenticate={() => Promise.resolve(true)} />)
    expect(root()).toHaveAttribute("data-session-phase", "none")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
    rerender(<SessionGuard expiresAt={T0 + 30_000} clock={clock} onReauthenticate={() => Promise.resolve(true)} labels={{ warning: "{remaining} left on the desk", extend: "More time" }} />)
    expect(screen.getByRole("status")).toHaveTextContent("0:30 left on the desk")
    expect(screen.getByRole("button", { name: "More time" })).toBeInTheDocument()
  })
})

describe("the status readout", () => {
  it("says the phase in words with the time left, in the expiring token inside the window and destructive past the end", () => {
    const clock = createClock(1000, () => t)
    const { rerender } = render(<SessionStatus expiresAt={T0 + 5 * MINUTE} clock={clock} />)
    const readout = () => document.querySelector<HTMLElement>("[data-session-status]")!
    expect(readout()).toHaveAttribute("data-session-status", "live")
    expect(readout()).toHaveTextContent("Session 5:00")
    expect(readout()).toHaveAttribute("aria-label", "Session: signed in, 5:00")
    expect(readout().className).not.toContain("text-expiring")
    tick(4 * MINUTE)
    expect(readout()).toHaveAttribute("data-session-status", "warning")
    expect(readout()).toHaveTextContent("Session 1:00")
    expect(readout()).toHaveAttribute("aria-label", "Session: ending soon, 1:00")
    expect(readout().className).toContain("text-expiring")
    tick(MINUTE)
    expect(readout()).toHaveAttribute("data-session-status", "expired")
    expect(readout()).toHaveTextContent("Session ended")
    expect(readout()).toHaveAttribute("aria-label", "Session: ended")
    expect(readout().className).toContain("text-destructive")
    rerender(<SessionStatus expiresAt={null} clock={clock} labels={{ noSession: "signed out" }} />)
    expect(readout()).toHaveAttribute("data-session-status", "none")
    expect(readout()).toHaveTextContent("Session signed out")
    expect(readout()).toHaveAttribute("aria-label", "Session: signed out")
    expect(DEFAULT_SESSION_GUARD_LABELS.session).toBe("Session")
  })
})
