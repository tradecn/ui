import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, Profiler, startTransition, StrictMode, Suspense, useLayoutEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClock, type Clock } from "@/registry/tradecn/lib/clock"
import * as Session from "@/registry/tradecn/ui/session-guard"

const { SessionGuardActionLabel, SessionGuardError, SessionGuardProvider, SessionGuardReauthenticate, SessionGuardRemaining, SessionGuardWarning, useSessionGuard } = Session
const NOW = 1_700_000_000_000
let now = NOW

beforeEach(() => { vi.useFakeTimers(); now = NOW })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function deferred() {
  let resolve!: (ok: boolean) => void
  let reject!: (error: Error) => void
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function Controls() {
  return <><SessionGuardReauthenticate><SessionGuardActionLabel /></SessionGuardReauthenticate><SessionGuardError /></>
}

describe("composed session requests", () => {
  it("locks two custom calls synchronously and shares pending/failure with every control", async () => {
    const response = deferred()
    const authenticate = vi.fn(() => response.promise)
    const invoke = { current: async () => {} }
    function Custom() {
      const { reauthenticate, pending } = useSessionGuard()
      useLayoutEffect(() => { invoke.current = reauthenticate }, [reauthenticate])
      return <button disabled={pending}>Custom renewal</button>
    }
    render(<SessionGuardProvider expiresAt={NOW + 1000} clock={{ now: () => NOW, subscribe: () => () => {} }} onReauthenticate={authenticate}><Controls /><Custom /></SessionGuardProvider>)
    act(() => { void invoke.current(); void invoke.current() })
    expect(authenticate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Signing in…" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Custom renewal" })).toBeDisabled()
    await act(async () => response.resolve(false))
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work. Try again.")
    expect(screen.getByRole("button", { name: "Custom renewal" })).toBeEnabled()
  })

  it("keeps the same pending request through every phase, expiry, clock and callback replacement", async () => {
    const response = deferred()
    const first = vi.fn(() => response.promise)
    const next = vi.fn(async () => true)
    const clock = createClock(1000, () => now)
    const view = render(<SessionGuardProvider expiresAt={NOW + 1000} clock={clock} onReauthenticate={first}><Controls /></SessionGuardProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }))
    for (const expiresAt of [NOW - 1, NOW + 600_000, null, NOW + 1000]) {
      view.rerender(<SessionGuardProvider expiresAt={expiresAt} clock={{ now: () => NOW, subscribe: () => () => {} }} onReauthenticate={next}><Controls /></SessionGuardProvider>)
      expect(screen.getByRole("button", { name: "Signing in…" })).toHaveAttribute("aria-disabled", "true")
    }
    expect(next).not.toHaveBeenCalled()
    await act(async () => response.resolve(false))
    expect(screen.getByRole("alert")).toBeVisible()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stay signed in" })))
    expect(next).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("preserves a late refusal after recovery and clears it on the next live/none entry", async () => {
    const response = deferred()
    const clock: Clock = { now: () => NOW, subscribe: () => () => {} }
    const view = render(<SessionGuardProvider expiresAt={NOW - 1} clock={clock} onReauthenticate={() => response.promise}><Controls /></SessionGuardProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }))
    view.rerender(<SessionGuardProvider expiresAt={NOW + 600_000} clock={clock} onReauthenticate={() => response.promise}><Controls /></SessionGuardProvider>)
    await act(async () => response.resolve(false))
    expect(screen.getByRole("alert")).toBeVisible()
    view.rerender(<SessionGuardProvider expiresAt={NOW + 1000} clock={clock} onReauthenticate={() => response.promise}><Controls /></SessionGuardProvider>)
    expect(screen.getByRole("alert")).toBeVisible()
    view.rerender(<SessionGuardProvider expiresAt={null} clock={clock} onReauthenticate={() => response.promise}><Controls /></SessionGuardProvider>)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("publishes current callbacks before child layout commands and tolerates StrictMode replay", async () => {
    const response = deferred()
    const first = vi.fn(() => response.promise)
    const next = vi.fn(async () => false)
    function LayoutRequest({ attempt }: { attempt: number }) {
      const { reauthenticate } = useSessionGuard()
      useLayoutEffect(() => { void reauthenticate() }, [attempt, reauthenticate])
      return <Controls />
    }
    const view = render(<StrictMode><SessionGuardProvider expiresAt={0} onReauthenticate={first}><LayoutRequest attempt={1} /></SessionGuardProvider></StrictMode>)
    expect(first).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Signing in…" })).toHaveAttribute("aria-disabled", "true")
    await act(async () => response.resolve(true))
    view.rerender(<StrictMode><SessionGuardProvider expiresAt={0} onReauthenticate={next}><LayoutRequest attempt={2} /></SessionGuardProvider></StrictMode>)
    await act(async () => {})
    expect(next).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert")).toBeVisible()
  })

  it("ignores retained commands and old settlements after the provider unmounts", async () => {
    const response = deferred()
    const authenticate = vi.fn(() => response.promise)
    const invoke = { current: async () => {} }
    function Capture() {
      const { reauthenticate } = useSessionGuard()
      useLayoutEffect(() => { invoke.current = reauthenticate }, [reauthenticate])
      return <Controls />
    }
    const first = render(<SessionGuardProvider expiresAt={0} onReauthenticate={authenticate}><Capture /></SessionGuardProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }))
    first.unmount()
    await invoke.current()
    render(<SessionGuardProvider expiresAt={0} onReauthenticate={authenticate}><Controls /></SessionGuardProvider>)
    await act(async () => response.resolve(false))
    expect(authenticate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeEnabled()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("forwards native refs and events, with preventDefault cancelling the request", () => {
    const authenticate = vi.fn(async () => true)
    const button = createRef<HTMLButtonElement>()
    const click = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault())
    render(<SessionGuardProvider expiresAt={0} onReauthenticate={authenticate}><SessionGuardReauthenticate ref={button} onClick={click} aria-label="Custom sign-in" className="custom-action">Continue</SessionGuardReauthenticate></SessionGuardProvider>)
    const control = screen.getByRole("button", { name: "Custom sign-in" })
    expect(button.current).toBe(control)
    expect(control).toHaveClass("custom-action")
    fireEvent.click(control)
    expect(click).toHaveBeenCalledTimes(1)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it.each(["throw", "reject"])("turns a %s into the shared refusal and permits retry", async mode => {
    const authenticate = vi.fn((): Promise<boolean> => {
      if (mode === "throw") throw new Error("offline")
      return Promise.reject(new Error("offline"))
    })
    render(<SessionGuardProvider expiresAt={0} onReauthenticate={authenticate}><Controls /></SessionGuardProvider>)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in again" })))
    expect(screen.getByRole("alert")).toBeVisible()
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeEnabled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in again" })))
    expect(authenticate).toHaveBeenCalledTimes(2)
  })
})

describe("committed recovery and native defaults", () => {
  const clock: Clock = { now: () => NOW, subscribe: () => () => {} }

  it.each([NOW + 600_000, null])("keeps a new child-layout refusal when recovering to %s", async expiresAt => {
    const authenticate = vi.fn(() => { throw new Error("New refusal") })
    function RecoveryRequest() {
      const { phase, reauthenticate } = useSessionGuard()
      useLayoutEffect(() => {
        if (phase === "live" || phase === "none") void reauthenticate()
      }, [phase, reauthenticate])
      return <SessionGuardError />
    }
    const scene = (expiry: number | null) => <SessionGuardProvider expiresAt={expiry} clock={clock} onReauthenticate={authenticate}><RecoveryRequest /></SessionGuardProvider>
    const view = render(scene(0))
    view.rerender(scene(expiresAt))
    await act(async () => {})
    expect(authenticate).toHaveBeenCalledOnce()
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work. Try again.")
  })

  it("clears the prior failure before recovery layout effects read it", async () => {
    const seen: { phase: Session.SessionPhase; failed: boolean }[] = []
    function ReadRecovery() {
      const { phase, failed } = useSessionGuard()
      useLayoutEffect(() => { seen.push({ phase, failed }) }, [phase, failed])
      return <Controls />
    }
    const scene = (expiresAt: number) => <SessionGuardProvider expiresAt={expiresAt} clock={clock} onReauthenticate={async () => false}><ReadRecovery /></SessionGuardProvider>
    const view = render(scene(0))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in again" })))
    expect(seen.at(-1)).toEqual({ phase: "expired", failed: true })
    view.rerender(scene(NOW + 600_000))
    expect(seen.filter(value => value.phase === "live")).toEqual([{ phase: "live", failed: false }])
  })

  it("keeps committed callbacks and failure isolated from a suspended recovery", async () => {
    const first = vi.fn(async () => false)
    const speculative = vi.fn(async () => true)
    const never = new Promise<void>(() => {})
    const command = { current: async () => {} }
    function Read({ suspend }: { suspend: boolean }) {
      const { reauthenticate } = useSessionGuard()
      useLayoutEffect(() => { command.current = reauthenticate }, [reauthenticate])
      if (suspend) throw never
      return <SessionGuardError />
    }
    const scene = (suspend: boolean) => <Suspense fallback={<p>Loading</p>}><SessionGuardProvider expiresAt={suspend ? NOW + 600_000 : 0} clock={clock} onReauthenticate={suspend ? speculative : first}><Read suspend={suspend} /></SessionGuardProvider></Suspense>
    const view = render(scene(false))
    await act(async () => command.current())
    await act(async () => startTransition(() => view.rerender(scene(true))))
    expect(screen.getByRole("alert")).toBeVisible()
    await act(async () => command.current())
    expect(first).toHaveBeenCalledTimes(2)
    expect(speculative).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeVisible()
  })

  it("keeps native defaults through optional prop spreads and honors explicit overrides", async () => {
    render(<SessionGuardProvider expiresAt={NOW + 1000} clock={clock} onReauthenticate={async () => false}>
      <form><SessionGuardReauthenticate type={undefined}>Renew</SessionGuardReauthenticate><SessionGuardReauthenticate type="submit">Submit</SessionGuardReauthenticate></form>
      <SessionGuardWarning role={undefined}>Warning</SessionGuardWarning>
      <SessionGuardRemaining role={undefined} aria-label={undefined} />
      <span id="session-time">Desk time</span><SessionGuardRemaining role="status" aria-labelledby="session-time" />
      <SessionGuardError role={undefined} /><SessionGuardError role="status">Custom failure</SessionGuardError>
    </SessionGuardProvider>)
    expect(screen.getByRole("button", { name: "Renew" })).toHaveAttribute("type", "button")
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("type", "submit")
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Warning")
    expect(screen.getByRole("timer", { name: "Session" })).toHaveClass("font-semibold")
    expect(screen.getByRole("status", { name: "Desk time" })).not.toHaveAttribute("aria-label")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Renew" })))
    expect(screen.getByRole("alert")).toHaveTextContent("That did not work. Try again.")
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Custom failure")
  })

  it("forwards the dialog content ref and its React cleanup with custom initial focus", () => {
    const fallback = createRef<HTMLInputElement>()
    const cleanup = vi.fn()
    const ref = vi.fn((node: HTMLDivElement | null) => node ? cleanup : undefined)
    const view = render(<><input ref={fallback} aria-label="Draft" /><SessionGuardProvider expiresAt={0} onReauthenticate={async () => true}>
      <Session.SessionGuardDialog fallbackFocusRef={fallback} ref={ref} initialFocus={false} aria-labelledby="renew-title" aria-describedby="renew-description">
        <h2 id="renew-title">Renew session</h2><p id="renew-description">Keep editing your draft.</p>
      </Session.SessionGuardDialog>
    </SessionGuardProvider></>)
    expect(ref).toHaveBeenCalledWith(screen.getByRole("dialog", { name: "Renew session" }))
    view.unmount()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(ref).not.toHaveBeenCalledWith(null)
  })
})

describe("phase and clock ownership", () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])("does not subscribe or tick a missing remaining-time reading for %s", expiresAt => {
    const source = createClock(1000, () => now)
    let listeners = 0
    const clock: Clock = { now: source.now, subscribe(listener) { listeners++; const unsubscribe = source.subscribe(listener); return () => { listeners--; unsubscribe() } } }
    const commits = vi.fn()
    const reading = createRef<HTMLSpanElement>()
    const scene = (expiry: number | null | undefined) => <SessionGuardProvider expiresAt={expiry} clock={clock} onReauthenticate={async () => true}>
      <Profiler id="remaining" onRender={commits}><SessionGuardRemaining ref={reading} /></Profiler>
    </SessionGuardProvider>
    const view = render(scene(expiresAt))
    // The provider retains its phase subscription; the absent reading needs none.
    expect(listeners).toBe(1)
    expect(reading.current).toBeNull()
    commits.mockClear()
    act(() => { now += 5000; vi.advanceTimersByTime(5000) })
    expect(commits).not.toHaveBeenCalled()
    view.rerender(scene(now + 10_000))
    expect(listeners).toBe(2)
    expect(reading.current).toBe(screen.getByRole("timer", { name: "Session" }))
    act(() => { now += 1000; vi.advanceTimersByTime(1000) })
    expect(reading.current).toHaveTextContent("0:09")
    view.rerender(scene(expiresAt))
    expect(listeners).toBe(1)
    expect(reading.current).toBeNull()
    commits.mockClear()
    act(() => { now += 5000; vi.advanceTimersByTime(5000) })
    expect(commits).not.toHaveBeenCalled()
    view.unmount()
    expect(listeners).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("ticks readings without rerendering request readers or application children and releases every subscription", () => {
    const source = createClock(1000, () => now)
    let listeners = 0
    const clock: Clock = { now: source.now, subscribe(listener) { listeners++; const unsubscribe = source.subscribe(listener); return () => { listeners--; unsubscribe() } } }
    let reads = 0
    let drafts = 0
    function Phase() { reads++; return <output>{useSessionGuard().phase}</output> }
    function Draft() { drafts++; return <input aria-label="Draft" /> }
    const view = render(<SessionGuardProvider expiresAt={NOW + 180_000} clock={clock} onReauthenticate={async () => true}><Phase /><Draft /><SessionGuardRemaining /></SessionGuardProvider>)
    expect(listeners).toBe(2)
    expect(vi.getTimerCount()).toBe(1)
    expect(reads).toBe(1)
    expect(drafts).toBe(1)
    act(() => { now += 1000; vi.advanceTimersByTime(1000) })
    expect(screen.getByRole("timer", { name: "Session" })).toHaveTextContent("2:59")
    expect(reads).toBe(1)
    expect(drafts).toBe(1)
    act(() => { now += 60_000; vi.advanceTimersByTime(60_000) })
    expect(screen.getByRole("status")).toHaveTextContent("warning")
    expect(reads).toBe(2)
    expect(drafts).toBe(1)
    view.unmount()
    expect(listeners).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("switches clock subscriptions and keeps expired notifications phase-based", () => {
    const firstClock = createClock(1000, () => now)
    const secondClock = createClock(2000, () => now + 600_000)
    const expired = vi.fn()
    const replacement = vi.fn()
    const view = render(<SessionGuardProvider expiresAt={NOW + 300_000} clock={firstClock} onReauthenticate={async () => true} onExpire={expired}><SessionGuardRemaining /></SessionGuardProvider>)
    view.rerender(<SessionGuardProvider expiresAt={NOW + 300_000} clock={secondClock} onReauthenticate={async () => true} onExpire={expired}><SessionGuardRemaining /></SessionGuardProvider>)
    expect(vi.getTimerCount()).toBe(1)
    expect(expired).toHaveBeenCalledTimes(1)
    view.rerender(<SessionGuardProvider expiresAt={NOW - 1} clock={secondClock} onReauthenticate={async () => true} onExpire={replacement}><SessionGuardRemaining /></SessionGuardProvider>)
    expect(replacement).not.toHaveBeenCalled()
    view.rerender(<SessionGuardProvider expiresAt={NOW + 900_000} clock={secondClock} onReauthenticate={async () => true} onExpire={replacement}><SessionGuardRemaining /></SessionGuardProvider>)
    view.rerender(<SessionGuardProvider expiresAt={NOW - 1} clock={secondClock} onReauthenticate={async () => true} onExpire={replacement}><SessionGuardRemaining /></SessionGuardProvider>)
    expect(replacement).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("retains effect replay for onExpire and allows ordinary content in a warning", () => {
    const expire = vi.fn()
    const view = render(<StrictMode><SessionGuardProvider expiresAt={0} onReauthenticate={async () => true} onExpire={expire}>{null}</SessionGuardProvider></StrictMode>)
    expect(expire).toHaveBeenCalledTimes(2)
    view.unmount()
    const warning = createRef<HTMLDivElement>()
    render(<SessionGuardProvider expiresAt={NOW + 1000} clock={{ now: () => NOW, subscribe: () => () => {} }} onReauthenticate={async () => true}><SessionGuardWarning ref={warning} aria-label="Account warning"><p>Account context</p><SessionGuardRemaining /></SessionGuardWarning></SessionGuardProvider>)
    expect(warning.current).toBe(screen.getByRole("status", { name: "Account warning" }))
    expect(warning.current).toHaveTextContent("Account context0:01")
  })
})

function publicTypes(children: ReactNode, ref: React.RefObject<HTMLButtonElement | null>, condition: boolean) {
  const renew = async () => true
  const props = { expiresAt: 0, onReauthenticate: renew }
  // @ts-expect-error The released widget export is removed, including minimal retained-prop calls.
  const oldMinimal = <Session.SessionGuard {...props} />
  // @ts-expect-error Released children were authentication content, not a provider composition.
  const oldChildren = <Session.SessionGuard {...props}><p>Sign in</p></Session.SessionGuard>
  // @ts-expect-error The old wrapper classes move to caller-owned warning/layout markup.
  const oldClasses = <Session.SessionGuard {...props} className="border-b" />
  // @ts-expect-error Retained callbacks do not keep the closed widget available.
  const oldCallbacks = <Session.SessionGuard {...props} warnMs={0} onExpire={() => {}} />
  // @ts-expect-error Labels alone do not revive the old widget.
  const oldLabels = <Session.SessionGuard {...props} labels={{ extend: "Renew" }}>{null}</Session.SessionGuard>
  // @ts-expect-error A clock and authentication field still need the new composition.
  const oldClock = <Session.SessionGuard {...props} clock={{ now: () => 0, subscribe: () => () => {} }}><input aria-label="Code" /></Session.SessionGuard>
  // @ts-expect-error Conditional old authentication content must migrate too.
  const oldConditional = <Session.SessionGuard {...props}>{condition && <p>Sign in</p>}</Session.SessionGuard>
  // @ts-expect-error The provider requires explicit composition.
  const empty = <SessionGuardProvider {...props} />
  // @ts-expect-error Warning markup belongs to the caller.
  const noWarning = <SessionGuardWarning />
  // @ts-expect-error Actions require an accessible label supplied through children.
  const noAction = <SessionGuardReauthenticate />
  // @ts-expect-error Dialogs require caller-owned content.
  const noDialog = <Session.SessionGuardDialog fallbackFocusRef={ref} />
  // @ts-expect-error A timed dialog needs a persistent focus fallback.
  const noFallback = <Session.SessionGuardDialog>{children}</Session.SessionGuardDialog>
  // @ts-expect-error The supplied session controls whether the modal is open.
  const open = <Session.SessionGuardDialog fallbackFocusRef={ref} open>{children}</Session.SessionGuardDialog>
  // @ts-expect-error Modal behavior is owned by the expiry boundary.
  const modal = <Session.SessionGuardDialog fallbackFocusRef={ref} modal={false}>{children}</Session.SessionGuardDialog>
  // @ts-expect-error The guard has no dismiss button.
  const close = <Session.SessionGuardDialog fallbackFocusRef={ref} showCloseButton>{children}</Session.SessionGuardDialog>
  // @ts-expect-error Cross-base fallback focus owns the final focus policy.
  const finalFocus = <Session.SessionGuardDialog fallbackFocusRef={ref} finalFocus={false}>{children}</Session.SessionGuardDialog>
  // @ts-expect-error Cross-base fallback focus owns the close focus policy.
  const closeFocus = <Session.SessionGuardDialog fallbackFocusRef={ref} onCloseAutoFocus={() => {}}>{children}</Session.SessionGuardDialog>
  // @ts-expect-error Remaining uses the provider's expiry.
  const expiry = <SessionGuardRemaining expiresAt={0} />
  // @ts-expect-error Required provider props do not include the old banner class.
  const providerClass = <SessionGuardProvider {...props} className="border-b">{children}</SessionGuardProvider>
  const openProps = { open: true }
  // @ts-expect-error The dialog reserves open even through a native prop spread.
  const spreadOpen = <Session.SessionGuardDialog fallbackFocusRef={ref} {...openProps}>{children}</Session.SessionGuardDialog>
  const defaultOpenProps = { defaultOpen: true }
  // @ts-expect-error The dialog reserves defaultOpen even through a native prop spread.
  const spreadDefaultOpen = <Session.SessionGuardDialog fallbackFocusRef={ref} {...defaultOpenProps}>{children}</Session.SessionGuardDialog>
  const onOpenChangeProps = { onOpenChange: () => {} }
  // @ts-expect-error The dialog reserves onOpenChange even through a native prop spread.
  const spreadOnOpenChange = <Session.SessionGuardDialog fallbackFocusRef={ref} {...onOpenChangeProps}>{children}</Session.SessionGuardDialog>
  const modalProps = { modal: false }
  // @ts-expect-error The dialog reserves modal even through a native prop spread.
  const spreadModal = <Session.SessionGuardDialog fallbackFocusRef={ref} {...modalProps}>{children}</Session.SessionGuardDialog>
  const showCloseButtonProps = { showCloseButton: true }
  // @ts-expect-error The dialog reserves showCloseButton even through a native prop spread.
  const spreadShowCloseButton = <Session.SessionGuardDialog fallbackFocusRef={ref} {...showCloseButtonProps}>{children}</Session.SessionGuardDialog>
  const finalFocusProps = { finalFocus: false }
  // @ts-expect-error The dialog reserves finalFocus even through a native prop spread.
  const spreadFinalFocus = <Session.SessionGuardDialog fallbackFocusRef={ref} {...finalFocusProps}>{children}</Session.SessionGuardDialog>
  const onCloseAutoFocusProps = { onCloseAutoFocus: () => {} }
  // @ts-expect-error The dialog reserves onCloseAutoFocus even through a native prop spread.
  const spreadOnCloseAutoFocus = <Session.SessionGuardDialog fallbackFocusRef={ref} {...onCloseAutoFocusProps}>{children}</Session.SessionGuardDialog>
  const forceMountProps = { forceMount: true }
  // @ts-expect-error The dialog reserves forceMount even through a native prop spread.
  const spreadForceMount = <Session.SessionGuardDialog fallbackFocusRef={ref} {...forceMountProps}>{children}</Session.SessionGuardDialog>
  const keepMountedProps = { keepMounted: true }
  // @ts-expect-error The dialog reserves keepMounted even through a native prop spread.
  const spreadKeepMounted = <Session.SessionGuardDialog fallbackFocusRef={ref} {...keepMountedProps}>{children}</Session.SessionGuardDialog>
  // @ts-expect-error The released widget props type was removed with its export.
  const oldProps: Session.SessionGuardProps = props
  const composed = <SessionGuardProvider {...props}>{children}{condition && <Controls />}<SessionGuardWarning>{children}</SessionGuardWarning><Session.SessionGuardDialog fallbackFocusRef={ref}>{children}</Session.SessionGuardDialog></SessionGuardProvider>
  void [oldMinimal, oldChildren, oldClasses, oldCallbacks, oldLabels, oldClock, oldConditional, empty, noWarning, noAction, noDialog, noFallback, open, modal, close, finalFocus, closeFocus, expiry, providerClass, composed, oldProps, spreadOpen, spreadDefaultOpen, spreadOnOpenChange, spreadModal, spreadShowCloseButton, spreadFinalFocus, spreadOnCloseAutoFocus, spreadForceMount, spreadKeepMounted]
}
void publicTypes
