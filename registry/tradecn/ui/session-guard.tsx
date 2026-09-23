import { cn } from "cn"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import type { Clock } from "@/registry/tradecn/lib/clock"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { Countdown, formatRemaining } from "@/registry/tradecn/ui/countdown"

// A session ends and the trader must not lose a half-typed ticket. The guard reads one number, when the
// session expires, and does three things with it: in the warning window it shows a banner with a countdown
// and a button that asks the consumer to extend the session; at expiry it opens a dialog that is a hotkey
// wall, blocking every action underneath and unmounting nothing, so drafts and layouts stay where they are;
// and it reports the phase for a status bar. The guard holds no token and knows no protocol: the consumer's
// login is the consumer's, rendered as the dialog's children, and `onReauthenticate` is how it is asked.

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

/** Asks the consumer for a new session and reports where the ask stands. */
function useReauthenticate(onReauthenticate: () => Promise<boolean>, phase: SessionPhase) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef(onReauthenticate)
  useEffect(() => {
    latest.current = onReauthenticate
  })
  // A refusal is forgotten once the session is live again, settled during render.
  const [seen, setSeen] = useState(phase)
  if (seen !== phase) {
    setSeen(phase)
    if (phase === "live" || phase === "none") setFailed(false)
  }
  const attempt = async () => {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const ok = await latest.current()
      setFailed(!ok)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  return { pending, failed, attempt }
}

export interface SessionGuardProps {
  /** When the session ends, ms since the epoch. Null or undefined while there is no session. */
  expiresAt: number | null | undefined
  /** How long before the end the banner shows. Default two minutes. */
  warnMs?: number
  /** Ask for a new session. Resolve true when there is one; the guard closes when `expiresAt` moves. */
  onReauthenticate: () => Promise<boolean>
  /** The consumer's re-authentication, shown in the dialog above the button: a password field, a hardware token prompt, a note. */
  children?: ReactNode
  /** The session ended. Called once per expiry. */
  onExpire?: () => void
  labels?: Partial<SessionGuardLabels>
  /** The shared one-second clock unless given another. */
  clock?: Clock
  /** Classes on the banner. */
  className?: string
}

// The dialog is a wall: a close request is not a way through it.
function keepOpen() {
  // The session is what opens and closes it.
}

export function SessionGuard({ expiresAt, warnMs = DEFAULT_WARN_MS, onReauthenticate, children, onExpire, labels: labelsProp, clock, className }: SessionGuardProps) {
  const labels = useMemo<SessionGuardLabels>(() => ({ ...DEFAULT_SESSION_GUARD_LABELS, ...labelsProp }), [labelsProp])
  const status = useSessionStatus(expiresAt, { warnMs, clock })
  const { pending, failed, attempt } = useReauthenticate(onReauthenticate, status.phase)
  const expire = useRef(onExpire)
  useEffect(() => {
    expire.current = onExpire
  })
  useEffect(() => {
    if (status.phase === "expired") expire.current?.()
  }, [status.phase])
  const [before, after] = labels.warning.split("{remaining}")
  return (
    <div data-slot="tradecn-session-guard" data-session-phase={status.phase} className={cn(status.phase === "warning" ? "block" : "contents", className)}>
      {status.phase === "warning" && status.expiresAt !== null && (
        <div role="status" data-session-banner="" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-expiring/50 bg-expiring-soft px-3 py-1.5 text-xs text-foreground lining-nums tabular-nums">
          <span>
            {before}
            <Countdown expiresAt={status.expiresAt} compact announce={false} thresholds={{ soonMs: warnMs }} label={labels.session} clock={clock} className="text-expiring" />
            {after}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={pending} data-session-extend="" data-pending={pending || undefined} onClick={() => void attempt()}>
            {pending ? labels.pending : labels.extend}
          </Button>
          {failed && (
            <span role="alert" data-session-failed="" className="text-destructive">
              {labels.failed}
            </span>
          )}
        </div>
      )}
      <Dialog open={status.phase === "expired"} onOpenChange={keepOpen}>
        <DialogContent showCloseButton={false} data-session-dialog="" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.expiredTitle}</DialogTitle>
            <DialogDescription>{labels.expiredDescription}</DialogDescription>
          </DialogHeader>
          {children}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending} data-session-reauthenticate="" data-pending={pending || undefined} onClick={() => void attempt()}>
              {pending ? labels.pending : labels.reauthenticate}
            </Button>
            {failed && (
              <span role="alert" data-session-failed="" className="text-xs text-destructive">
                {labels.failed}
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export interface SessionStatusProps {
  expiresAt: number | null | undefined
  warnMs?: number
  clock?: Clock
  labels?: Partial<SessionGuardLabels>
  className?: string
}

/** The session for a status bar: the word, the time left, and the phase on `data-session-status` and in the accessible name. */
export function SessionStatus({ expiresAt, warnMs = DEFAULT_WARN_MS, clock, labels: labelsProp, className }: SessionStatusProps) {
  const labels = useMemo<SessionGuardLabels>(() => ({ ...DEFAULT_SESSION_GUARD_LABELS, ...labelsProp }), [labelsProp])
  const status = useSessionStatus(expiresAt, { warnMs, clock })
  const remaining = status.remainingMs !== null && status.remainingMs > 0 ? formatRemaining(status.remainingMs) : null
  const word = phaseWord(status.phase, labels)
  return (
    <span
      data-session-status={status.phase}
      aria-label={`${labels.session}: ${word}${remaining === null ? "" : `, ${remaining}`}`}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", status.phase === "warning" && "text-expiring", status.phase === "expired" && "text-destructive", className)}
    >
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
