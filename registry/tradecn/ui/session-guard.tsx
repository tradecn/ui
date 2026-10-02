import { cn } from "cn"
import { createContext, useCallback, useContext, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import { sharedClock, type Clock } from "@/registry/tradecn/lib/clock"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { countdownTier, formatRemaining } from "@/registry/tradecn/ui/countdown"

// One owner coordinates the session phase and sign-in request. Callers compose the warning,
// modal contents and controls; only time readings subscribe to every clock tick.

export type SessionPhase = "none" | "live" | "warning" | "expired"

export interface SessionStatusValue {
  phase: SessionPhase
  /** Milliseconds until the session ends, negative past it, null with no session. */
  remainingMs: number | null
  expiresAt: number | null
}

export interface SessionGuardLabels {
  /** The banner's sentence; `{remaining}` is where the countdown goes. */
  warning: string
  /** The banner's button. */
  extend: string
  /** The dialog. */
  expiredTitle: string
  expiredDescription: string
  reauthenticate: string
  /** While `onReauthenticate` is out, and when it said no. */
  pending: string
  failed: string
  /** The status readout's word, and its phases as words for a screen reader. */
  session: string
  live: string
  ending: string
  ended: string
  noSession: string
}

export const DEFAULT_SESSION_GUARD_LABELS: SessionGuardLabels = {
  warning: "Your session ends in {remaining}.",
  extend: "Stay signed in",
  expiredTitle: "Your session has ended",
  expiredDescription: "Sign in again to carry on. Nothing on the desk has been lost.",
  reauthenticate: "Sign in again",
  pending: "Signing in…",
  failed: "That did not work. Try again.",
  session: "Session",
  live: "signed in",
  ending: "ending soon",
  ended: "ended",
  noSession: "no session",
}

/** The warning window: two minutes before the end. */
export const DEFAULT_WARN_MS = 120_000

/** The phase of a session at a moment: none without an end, expired at or past it, warning within `warnMs` of it, live before that. */
export function sessionStatus(expiresAt: number | null | undefined, now: number, warnMs: number = DEFAULT_WARN_MS): SessionStatusValue {
  if (expiresAt === null || expiresAt === undefined || !Number.isFinite(expiresAt)) return { phase: "none", remainingMs: null, expiresAt: null }
  const remainingMs = expiresAt - now
  return { phase: remainingMs <= 0 ? "expired" : remainingMs <= warnMs ? "warning" : "live", remainingMs, expiresAt }
}

export interface UseSessionStatusOptions {
  /** How long before the end the warning starts. Default two minutes. */
  warnMs?: number
  /** The shared one-second clock unless given another. */
  clock?: Clock
}

/** The session's phase and time left, ticking once a second on the shared clock. */
export function useSessionStatus(expiresAt: number | null | undefined, options: UseSessionStatusOptions = {}): SessionStatusValue {
  const now = useNow(options.clock)
  const warnMs = options.warnMs ?? DEFAULT_WARN_MS
  return useMemo(() => sessionStatus(expiresAt, now, warnMs), [expiresAt, now, warnMs])
}

function phaseWord(phase: SessionPhase, labels: SessionGuardLabels): string {
  return phase === "live" ? labels.live : phase === "warning" ? labels.ending : phase === "expired" ? labels.ended : labels.noSession
}

interface RequestState {
  pending: boolean
  failed: boolean
}

function createRequestStore(authenticate: () => Promise<boolean>) {
  let state: RequestState = { pending: false, failed: false }
  let phase: SessionPhase | undefined
  let needsNotification = false
  let active = false
  let generation = 0
  const listeners = new Set<() => void>()
  function notify() {
    if (!needsNotification) return
    needsNotification = false
    for (const listener of listeners) listener()
  }
  function publish(next: RequestState) {
    if (state.pending === next.pending && state.failed === next.failed) return
    state = next
    needsNotification = true
    notify()
  }
  const recovering = (next: SessionPhase) => next !== phase && (next === "live" || next === "none")
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    snapshot: () => state,
    recovering,
    commitPhase(next: SessionPhase) {
      // Commit before child layout commands, without scheduling React work in insertion effects.
      if (recovering(next) && state.failed) {
        state = { ...state, failed: false }
        needsNotification = true
      }
      phase = next
    },
    notify,
    setCallback(next: () => Promise<boolean>) { authenticate = next },
    mount() { active = true },
    unmount() {
      active = false
      generation++
      state = { pending: false, failed: false }
      needsNotification = false
    },
    async reauthenticate() {
      if (!active || state.pending) return
      const request = generation
      // Lock before calling application code, including another control in this same event.
      publish({ pending: true, failed: false })
      let ok = false
      try { ok = await authenticate() } catch { /* A thrown or rejected request is a refusal. */ }
      if (active && request === generation) publish({ pending: false, failed: !ok })
    },
  }
}

interface SessionContextValue {
  phase: SessionPhase
  expiresAt: number | null
  warnMs: number
  clock: Clock
  labels: SessionGuardLabels
  request: ReturnType<typeof createRequestStore>
}

const SessionContext = createContext<SessionContextValue | null>(null)

function useSessionContext() {
  const context = useContext(SessionContext)
  if (!context) throw new Error("SessionGuard parts must be inside SessionGuardProvider.")
  return context
}

export interface SessionGuardProviderProps extends UseSessionStatusOptions {
  /** When the session ends, ms since the epoch. Non-finite or absent values mean no session. */
  expiresAt: number | null | undefined
  /** Request a new session. The result does not change expiresAt. */
  onReauthenticate: () => Promise<boolean>
  /** Caller-owned warnings, dialogs, controls and surrounding content. */
  children: ReactNode
  /** Called by an effect on entering expired, including an expired mount and effect replay. */
  onExpire?: () => void
  labels?: Partial<SessionGuardLabels>
}

/** Coordinate one session without owning its markup. Plain clock ticks do not render its children. */
export function SessionGuardProvider({ expiresAt: suppliedExpiry, warnMs = DEFAULT_WARN_MS, onReauthenticate, onExpire, labels: labelsProp, clock: suppliedClock, children }: SessionGuardProviderProps) {
  const clock = suppliedClock ?? sharedClock()
  const expiresAt = suppliedExpiry === null || suppliedExpiry === undefined || !Number.isFinite(suppliedExpiry) ? null : suppliedExpiry
  const phaseSnapshot = useCallback(() => sessionStatus(expiresAt, clock.now(), warnMs).phase, [expiresAt, clock, warnMs])
  const phase = useSyncExternalStore(clock.subscribe, phaseSnapshot, phaseSnapshot)
  const labels = useMemo<SessionGuardLabels>(() => ({ ...DEFAULT_SESSION_GUARD_LABELS, ...labelsProp }), [labelsProp])
  const [request] = useState(() => createRequestStore(onReauthenticate))
  const expire = useRef(onExpire)
  // Publish callbacks and ownership before a descendant can invoke a command in a layout effect.
  useInsertionEffect(() => {
    request.setCallback(onReauthenticate)
    request.commitPhase(phase)
    expire.current = onExpire
  }, [request, phase, onReauthenticate, onExpire])
  useInsertionEffect(() => {
    request.mount()
    return () => request.unmount()
  }, [request])
  useLayoutEffect(() => request.notify(), [phase, request])
  useEffect(() => {
    if (phase === "expired") expire.current?.()
  }, [phase])
  const context = useMemo(() => ({ phase, expiresAt, warnMs, clock, labels, request }), [phase, expiresAt, warnMs, clock, labels, request])
  return <SessionContext value={context}>{children}</SessionContext>
}

export interface SessionGuardValue extends Omit<SessionContextValue, "request">, RequestState {
  /** One shared request, ignored while pending or after the provider unmounts. */
  reauthenticate: () => Promise<void>
}

/** Shared phase, settings and sign-in state. Time readings use useSessionStatus or SessionGuardRemaining. */
export function useSessionGuard(): SessionGuardValue {
  const { request, ...context } = useSessionContext()
  const state = useSyncExternalStore(request.subscribe, request.snapshot, request.snapshot)
  return { ...context, ...state, failed: state.failed && !request.recovering(context.phase), reauthenticate: request.reauthenticate }
}

export interface SessionGuardWarningProps extends ComponentProps<"div"> {
  children: ReactNode
}

/** Caller-owned warning content, mounted only inside the warning window. */
export function SessionGuardWarning({ className, role = "status", ...props }: SessionGuardWarningProps) {
  const { phase } = useSessionContext()
  if (phase !== "warning") return null
  return <div role={role} data-slot="tradecn-session-guard" data-session-banner="" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-expiring/50 bg-expiring-soft px-3 py-1.5 text-xs text-foreground lining-nums tabular-nums", className)} {...props} />
}

/** The provider's countdown. Only this reading renders on ordinary clock ticks. */
export function SessionGuardRemaining(props: Omit<ComponentProps<"span">, "children">) {
  const { expiresAt } = useSessionContext()
  return expiresAt === null ? null : <RemainingTime {...props} expiresAt={expiresAt} />
}

function RemainingTime({ expiresAt, className, role = "timer", "aria-label": label, ...props }: Omit<ComponentProps<"span">, "children"> & { expiresAt: number }) {
  const { warnMs, clock, labels } = useSessionContext()
  const now = useNow(clock)
  const remaining = expiresAt - now
  const tier = countdownTier(remaining, { soonMs: warnMs })
  return <span role={role} aria-label={label ?? (props["aria-labelledby"] ? undefined : labels.session)} data-slot="tradecn-session-guard-remaining" data-tier={tier} className={cn("inline-flex items-baseline text-xs lining-nums tabular-nums", tier === "soon" ? "font-semibold text-expiring" : tier === "expired" ? "text-muted-foreground" : "text-foreground", className)} {...props}>
    <span data-countdown-digits data-numeric="">{formatRemaining(remaining)}</span>
  </span>
}

/** The localized warning sentence with its ticking reading. Compose Remaining directly for other layouts. */
export function SessionGuardWarningText(props: Omit<ComponentProps<"span">, "children">) {
  const { labels } = useSessionContext()
  const [before, after] = labels.warning.split("{remaining}")
  return <span {...props}>{before}<SessionGuardRemaining />{after}</span>
}

export interface SessionGuardReauthenticateProps extends Omit<ComponentProps<typeof Button>, "children"> {
  children: ReactNode
}

/** An installed button sharing the provider's request lock. preventDefault cancels the request. */
export function SessionGuardReauthenticate({ children, disabled, type = "button", onClick, ...props }: SessionGuardReauthenticateProps) {
  const { pending, reauthenticate } = useSessionGuard()
  return <Button data-slot="tradecn-session-guard-reauthenticate" data-pending={pending || undefined} {...props} type={type} disabled={pending || disabled} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented) void reauthenticate()
  }}>{children}</Button>
}

/** The pending text, warning action or expired action, using the provider's labels. */
export function SessionGuardActionLabel(props: Omit<ComponentProps<"span">, "children">) {
  const { phase, pending, labels } = useSessionGuard()
  return <span {...props}>{pending ? labels.pending : phase === "warning" ? labels.extend : labels.reauthenticate}</span>
}

/** The shared refusal, mounted as an alert until the next attempt or recovery. */
export function SessionGuardError({ className, children, role = "alert", ...props }: ComponentProps<"span">) {
  const { failed, labels } = useSessionGuard()
  if (!failed) return null
  return <span role={role} data-slot="tradecn-session-guard-error" data-session-failed="" className={cn("text-xs text-destructive", className)} {...props}>{children === undefined ? labels.failed : children}</span>
}

export interface SessionGuardDialogProps extends Omit<ComponentProps<typeof DialogContent>, "children" | "showCloseButton" | "finalFocus" | "onCloseAutoFocus" | "forceMount"> {
  children: ReactNode
  /** A persistent application control, used only if the primitive leaves focus in the closing dialog or on body. */
  fallbackFocusRef: RefObject<HTMLElement | null>
  open?: never
  defaultOpen?: never
  onOpenChange?: never
  modal?: never
  showCloseButton?: never
  finalFocus?: never
  onCloseAutoFocus?: never
  forceMount?: never
  keepMounted?: never
}

// Only the supplied session closes the modal.
function keepOpen() {}

/** Expiry-controlled modal content. Callers own its heading, form and actions; the wall owns dismissal and fallback focus. */
export function SessionGuardDialog({ fallbackFocusRef, children, className, ref, ...props }: SessionGuardDialogProps) {
  const { phase } = useSessionContext()
  const open = phase === "expired"
  const wasOpen = useRef(false)
  const content = useRef<HTMLElement | null>(null)
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    // Keep the closing node until its exit completes, even when initial focus is customized.
    if (node) content.current = node
    if (typeof ref === "function") return ref(node)
    if (ref) ref.current = node
  }, [ref])
  const fallback = useRef(fallbackFocusRef)
  useInsertionEffect(() => { fallback.current = fallbackFocusRef }, [fallbackFocusRef])
  useLayoutEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const closingContent = content.current
    const owner = closingContent?.ownerDocument ?? fallback.current.current?.ownerDocument
    if (!owner) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const restore = () => {
      content.current = null
      const target = fallback.current.current
      if (!owner.hasFocus() || !target?.isConnected || target.ownerDocument !== owner) return
      const focused = owner.activeElement
      if (focused !== owner.body && focused !== null && !closingContent?.contains(focused)) return
      if (target.matches(":disabled") || target.closest("[inert], [hidden], [aria-hidden='true']") || !target.getClientRects().length) return
      const visibility = owner.defaultView?.getComputedStyle(target).visibility
      if (visibility === "hidden" || visibility === "collapse") return
      target.focus()
    }
    // Exit animations can keep the popup mounted and the desk inert after open becomes false.
    // Wait for actual removal, then let the installed primitive finish its native focus cleanup.
    const Observer = owner.defaultView?.MutationObserver
    const observer = Observer && closingContent?.isConnected ? new Observer(() => {
      if (closingContent.isConnected) return
      observer?.disconnect()
      timer = setTimeout(restore, 0)
    }) : undefined
    if (observer) observer.observe(owner.documentElement, { childList: true, subtree: true })
    else timer = setTimeout(restore, 0)
    return () => {
      observer?.disconnect()
      clearTimeout(timer)
    }
  }, [open])
  return <Dialog open={open} onOpenChange={keepOpen} modal>
    <DialogContent {...props} ref={contentRef} showCloseButton={false} data-session-dialog="" className={cn("max-h-[calc(100%-2rem)] overflow-auto sm:max-w-md", className)}>{children}</DialogContent>
  </Dialog>
}

export interface SessionStatusProps {
  expiresAt: number | null | undefined
  warnMs?: number
  clock?: Clock
  labels?: Partial<SessionGuardLabels>
  className?: string
}

/** The session for a status bar: the word, the time left, and the phase on `data-session-status`, spoken through visually hidden text. */
export function SessionStatus({ expiresAt, warnMs = DEFAULT_WARN_MS, clock, labels: labelsProp, className }: SessionStatusProps) {
  const labels = useMemo<SessionGuardLabels>(() => ({ ...DEFAULT_SESSION_GUARD_LABELS, ...labelsProp }), [labelsProp])
  const status = useSessionStatus(expiresAt, { warnMs, clock })
  const remaining = status.remainingMs !== null && status.remainingMs > 0 ? formatRemaining(status.remainingMs) : null
  const word = phaseWord(status.phase, labels)
  return (
    <span
      data-session-status={status.phase}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", status.phase === "warning" && "text-expiring", status.phase === "expired" && "text-destructive", className)}
    >
      {/* A generic span cannot carry aria-label, so the spoken sentence is hidden text. */}
      <span className="sr-only">{`${labels.session}: ${word}${remaining === null ? "" : `, ${remaining}`}`}</span>
      <span aria-hidden>{labels.session}</span>{" "}
      {status.phase === "expired" ? (
        <span aria-hidden>{labels.ended}</span>
      ) : remaining !== null ? (
        <span aria-hidden data-numeric="" className={NUMERIC_CLASS}>
          {remaining}
        </span>
      ) : (
        <span aria-hidden className="text-muted-foreground">
          {labels.noSession}
        </span>
      )}
    </span>
  )
}
