import { cn } from "cn"
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import { sharedClock, type Clock } from "@/registry/tradecn/lib/clock"

// Time left to a moment: digits that tick once a second and a bar that shrinks to nothing.
//
// The digits read the shared clock, so a stack of forty countdowns costs one interval. The bar is
// one Web Animation on its element, started once and left to the compositor, so it costs nothing per
// frame; under reduced motion it steps with the digits instead. The tier turns in the last seconds
// and stops at zero. What the countdown never does is decide anything: it shows the time it was
// given, and the server's own word is what says whether the thing it timed is over.

export type CountdownTier = "plenty" | "soon" | "expired"

export interface CountdownThresholds {
  /** From how far out the tier is `soon`. */
  soonMs: number
}

/** A placeholder until the people who work the screen say how many seconds count as soon. */
export const PROVISIONAL_COUNTDOWN_THRESHOLDS: CountdownThresholds = { soonMs: 10_000 }

/** Pure tiering. At or below zero is expired, whatever the thresholds. */
export function countdownTier(remainingMs: number, thresholds: CountdownThresholds = PROVISIONAL_COUNTDOWN_THRESHOLDS): CountdownTier {
  if (!(remainingMs > 0)) return "expired"
  return remainingMs <= thresholds.soonMs ? "soon" : "plenty"
}

/** "1:30", "0:09", "0:00", and "1:02:03" past an hour. Rounds up, so it never says zero while time is left: an endless wait (`Infinity`) prints "–". */
export function formatRemaining(ms: number): string {
  if (ms === Infinity) return "–"
  const total = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const minutes = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${minutes}:${String(s).padStart(2, "0")}`
}

const TIER_CLASS: Record<CountdownTier, string> = {
  plenty: "text-foreground",
  soon: "font-semibold text-expiring",
  expired: "text-muted-foreground",
}

const BAR_CLASS: Record<CountdownTier, string> = {
  plenty: "bg-primary",
  soon: "bg-expiring",
  expired: "bg-muted-foreground",
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

export interface CountdownProps {
  /** When it ends, in ms since the epoch. */
  expiresAt: number
  /** When it began, for the bar's full width. Left out, the moment the countdown was first drawn. */
  startsAt?: number
  thresholds?: CountdownThresholds
  clock?: Clock
  /** The name a screen reader gives it, and the subject of its announcements. Default "Time left". */
  label?: string
  /** The digits alone, inline, for a grid cell. */
  compact?: boolean
  /** Speak the time left when the tier changes, in a polite live region. Default true; turn it off in a grid, where the stack speaks. */
  announce?: boolean
  /** Called once when the digits reach zero. A display event: the server's word says whether the thing timed is over. */
  onExpire?: () => void
  className?: string
}

// The capability never changes within a session, so the store is three constants.
const subscribeToNothing = () => () => {}
const hasWebAnimations = () => typeof Element !== "undefined" && typeof Element.prototype.animate === "function"
const optimistic = () => true

export function Countdown({ expiresAt, startsAt, thresholds = PROVISIONAL_COUNTDOWN_THRESHOLDS, clock, label = "Time left", compact = false, announce = true, onExpire, className }: CountdownProps) {
  const c = clock ?? sharedClock()
  const ticked = useNow(c)
  // First sight samples the time source directly: the shared clock's last tick can be
  // arbitrarily old when nothing subscribed while this countdown was away. The time is never
  // behind first sight, so the first frame shows the real time left and nothing is announced
  // when the clock catches up.
  const [firstSeen] = useState(() => c.sample?.() ?? ticked)
  const now = Math.max(ticked, firstSeen)
  const remaining = expiresAt - now
  const tier = countdownTier(remaining, thresholds)

  // The bar's full width is `startsAt` to `expiresAt`; without a finite `startsAt`, from first sight to the end.
  // With no finite deadline it does not move: full for an endless wait, empty for one it cannot read.
  const total = Math.max(1, expiresAt - (typeof startsAt === "number" && Number.isFinite(startsAt) ? startsAt : firstSeen))
  const fraction = Number.isFinite(total) ? Math.max(0, Math.min(1, remaining / total)) : remaining > 0 ? 1 : 0
  const [reduced] = useState(prefersReducedMotion)
  // A browser without Web Animations draws the bar from the digits' tick too, instead of holding it
  // full. The server snapshot is optimistic so hydration agrees, and the client reads the real API.
  const canAnimate = useSyncExternalStore(subscribeToNothing, hasWebAnimations, optimistic)
  // Drawn from the digits' tick when it cannot animate: reduced motion, no API, nothing left to animate, or no deadline to run to.
  const staticBar = reduced || !canAnimate || tier === "expired" || !Number.isFinite(expiresAt)

  const bar = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el || staticBar || typeof el.animate !== "function") return
    const left = Math.max(0, expiresAt - (c.sample?.() ?? c.now()))
    const from = Math.max(0, Math.min(1, left / total))
    // One animation for exactly the time left, linear, held at zero when it ends. The
    // compositor runs it. When the fresh sample says time is already up while the last tick
    // has not caught up — the second right after a deadline — the zero-length run holds the
    // bar empty instead of leaving it full until the tick.
    const animation = el.animate([{ transform: `scaleX(${from})` }, { transform: "scaleX(0)" }], { duration: left, easing: "linear", fill: "forwards" })
    return () => animation.cancel()
  }, [expiresAt, total, c, staticBar])

  // Said once, when the digits reach zero; said again only if the end moves out and comes back.
  const latest = useRef(onExpire)
  useEffect(() => {
    latest.current = onExpire
  })
  const fired = useRef(false)
  useEffect(() => {
    if (tier !== "expired") {
      fired.current = false
      return
    }
    if (fired.current) return
    fired.current = true
    latest.current?.()
  }, [tier])

  // Derived state, set during render: speak when the tier changes, never on a plain tick.
  const [seen, setSeen] = useState(tier)
  const [message, setMessage] = useState("")
  if (seen !== tier) {
    setSeen(tier)
    setMessage(`${label} ${formatRemaining(remaining)}`)
  }

  // Named by the label and the time left together, so the digits reach a screen reader wherever the name is read,
  // a grid row's name built from its cells included.
  const id = useId()
  return (
    <span
      role="timer"
      aria-labelledby={`${id}-label ${id}-digits`}
      data-slot="tradecn-countdown"
      data-tier={tier}
      className={cn(compact ? "inline-flex items-baseline" : "inline-flex min-w-16 flex-col gap-0.5 rounded px-1", "text-xs lining-nums tabular-nums", tier === "soon" && !compact && "bg-expiring-soft", TIER_CLASS[tier], className)}
    >
      <span id={`${id}-label`} hidden>
        {label}
      </span>
      <span id={`${id}-digits`} data-countdown-digits data-numeric="">
        {formatRemaining(remaining)}
      </span>
      {!compact && (
        <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span ref={bar} className={cn("block h-full w-full origin-left", BAR_CLASS[tier])} style={staticBar ? { transform: `scaleX(${fraction})` } : undefined} />
        </span>
      )}
      {announce && (
        <span aria-live="polite" className="sr-only">
          {message}
        </span>
      )}
    </span>
  )
}
