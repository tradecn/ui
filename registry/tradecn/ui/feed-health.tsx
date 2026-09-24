import { cn } from "cn"
import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import { createClock, sharedClock, type Clock } from "@/registry/tradecn/lib/clock"

// Callers own the rows, tooltips and controls. Items coordinate one feed's readings; only
// those items, standalone ages and the explicit collection announcer subscribe to the clock.

export type FeedState = "connected" | "connecting" | "disconnected" | "unknown"
export type FeedLane = "coalesced" | "ordered"
export type Tier = "live" | "aging" | "stale" | "offline" | "closed"

export interface FeedDescriptor {
  id: string
  label: string
  state: FeedState
  /** `coalesced` lanes drop stale ticks and count them; `ordered` lanes never drop and can have gaps. */
  lane: FeedLane
  /** Wall clock of the last message, ms since epoch. */
  lastMessageAt: number | null
  /** Messages dropped so far (coalesced lane). */
  dropped?: number
  /** Last sequence number applied (ordered lane). */
  seq?: number
  /** A sequence gap is open (ordered lane). */
  gap?: { since: number; replaying: boolean } | null
  /** What the server allows on this feed now, by id. No list means nothing may. */
  allowedActions?: readonly string[]
}

export interface FeedAction {
  /** Matched against each feed's `allowedActions`. */
  id: string
  label: string
  /** Given the feed as it was when pressed. A returned promise settles the pending mark when it resolves or rejects. */
  run: (feed: FeedDescriptor) => void | Promise<unknown>
  destructive?: boolean
}

/** The actions a feed offers now: yours, in your order, kept to the ids in its `allowedActions`. */
export function feedActionsFor(feed: FeedDescriptor, actions: readonly FeedAction[] | undefined): FeedAction[] {
  if (!actions?.length || !feed.allowedActions?.length) return []
  return actions.filter((action) => feed.allowedActions!.includes(action.id))
}

/** An action out on a feed: which, the state the feed was in, and when. It clears when the state moves, when `pendingMs` lapses, or when the run's promise settles. */
export interface PendingFeedAction {
  action: string
  state: FeedState
  since: number
}

export interface StalenessThresholds {
  agingMs: number
  staleMs: number
}

/** Placeholders until the people who trade on the data agree on real ones. */
export const PROVISIONAL_THRESHOLDS: StalenessThresholds = { agingMs: 2000, staleMs: 10_000 }

export interface SessionCalendar {
  status(now: number): "open" | "closed" | "pre" | "post" | "holiday"
}

export const alwaysOpen: SessionCalendar = { status: () => "open" }

/** Pure tiering. A disconnect is offline whatever the hour; a closed session is closed, not stale. */
export function stalenessTier(feed: FeedDescriptor, now: number, thresholds: StalenessThresholds = PROVISIONAL_THRESHOLDS, session: SessionCalendar = alwaysOpen): Tier {
  if (feed.state === "disconnected") return "offline"
  const status = session.status(now)
  if (status === "closed" || status === "holiday") return "closed"
  if (feed.lastMessageAt === null) return "aging"
  const age = now - feed.lastMessageAt
  if (age < thresholds.agingMs) return "live"
  if (age < thresholds.staleMs) return "aging"
  return "stale"
}

/** "now", "12s", "3m", "2h". */
export function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "–"
  if (ms < 1000) return "now"
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

// The clock lives in lib/clock so a countdown ticks on the same interval. Exported from here still, so nothing that imported it moves.
export { createClock }
export type { Clock }

const TIER_CLASS: Record<Tier, string> = {
  live: "text-foreground",
  aging: "text-stale/80",
  stale: "bg-stale-soft text-stale",
  offline: "text-destructive",
  closed: "text-muted-foreground",
}

const STATE_DOT: Record<FeedState, string> = {
  connected: "bg-up",
  connecting: "animate-pulse bg-stale",
  disconnected: "bg-destructive",
  unknown: "bg-muted-foreground",
}

export interface FeedHealthOptions {
  thresholds?: StalenessThresholds
  session?: SessionCalendar
  clock?: Clock
}

const OptionsContext = createContext<FeedHealthOptions>({})

function useOptions(options: FeedHealthOptions) {
  const inherited = useContext(OptionsContext)
  return {
    thresholds: options.thresholds ?? inherited.thresholds ?? PROVISIONAL_THRESHOLDS,
    session: options.session ?? inherited.session ?? alwaysOpen,
    clock: options.clock ?? inherited.clock ?? sharedClock(),
  }
}

export interface FeedHealthProps extends ComponentProps<"div">, FeedHealthOptions { }

/** Supply the rows and one announcer. No clock subscription or collection state lives here. */
export function FeedHealth({ thresholds, session, clock, className, ...props }: FeedHealthProps) {
  const options = useOptions({ thresholds, session, clock })
  return (
    <OptionsContext value={options}>
      <TooltipProvider>
        <div role="group" aria-label={props["aria-labelledby"] ? undefined : "Feed health"} data-slot="tradecn-feed-health" className={cn("flex min-w-0 items-center gap-1 text-xs lining-nums tabular-nums", className)} {...props} />
      </TooltipProvider>
    </OptionsContext>
  )
}

interface FeedContextValue {
  feed: FeedDescriptor
  tier: Tier
  now: number
  pending?: PendingFeedAction | null
  descriptionId: string
}

const FeedContext = createContext<FeedContextValue | null>(null)

function useFeed() {
  const feed = useContext(FeedContext)
  if (!feed) throw new Error("FeedHealth parts must be inside FeedHealthItem")
  return feed
}

export interface FeedHealthItemProps extends ComponentProps<"div">, FeedHealthOptions {
  feed: FeedDescriptor
  pending?: PendingFeedAction | null
}

/** One feed's context and presentation. Its children can be a strip, a card, or application markup. */
export function FeedHealthItem({ feed, pending, thresholds, session, clock, className, ...props }: FeedHealthItemProps) {
  const options = useOptions({ thresholds, session, clock })
  const now = useNow(options.clock)
  const tier = stalenessTier(feed, now, options.thresholds, options.session)
  const descriptionId = useId()
  return (
    <OptionsContext value={options}>
      <FeedContext value={{ feed, tier, now, pending, descriptionId }}>
        <div data-slot="tradecn-feed-health-item" data-feed={feed.id} data-tier={tier} data-state={feed.state} data-pending={pending?.action} className={cn("inline-flex min-w-0 items-center gap-1.5 rounded text-xs lining-nums tabular-nums", TIER_CLASS[tier], className)} {...props} />
      </FeedContext>
    </OptionsContext>
  )
}

/** Use inside your Tooltip, paired with FeedHealthContent. */
export function FeedHealthTrigger({ className, ...props }: ComponentProps<typeof TooltipTrigger>) {
  const { descriptionId } = useFeed()
  return <TooltipTrigger aria-describedby={descriptionId} className={cn("inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)} {...props} />
}

/** A described tooltip in either primitive base. The caller supplies its content. */
export function FeedHealthContent(props: ComponentProps<typeof TooltipContent>) {
  const { descriptionId } = useFeed()
  return <TooltipContent id={descriptionId} role="tooltip" {...props} />
}

/** The state word accompanies its dot even when the tier badge is visually hidden. */
export function FeedHealthIndicator({ className, children, ...props }: ComponentProps<"span">) {
  const { feed } = useFeed()
  return <span data-slot="tradecn-feed-health-indicator" className={cn("inline-flex items-center", className)} {...props}>
    <span aria-hidden className={cn("size-1.5 rounded-full", STATE_DOT[feed.state])} />
    {children === undefined ? <span className="sr-only">{feed.state}</span> : children}
  </span>
}

export function FeedHealthTier({ className, children, ...props }: ComponentProps<typeof Badge>) {
  const { tier } = useFeed()
  return <Badge variant="outline" data-slot="tradecn-feed-health-tier" className={cn("h-4 px-1 text-xs uppercase", TIER_CLASS[tier], className)} {...props}>{children === undefined ? tier : children}</Badge>
}

export interface FeedAgeProps extends ComponentProps<"span"> {
  feed: FeedDescriptor
  clock?: Clock
}

/** A self-ticking age. Hidden from assistive technology; mount one announcer for tier changes. */
export function FeedAge({ feed, clock, className, children, ...props }: FeedAgeProps) {
  const options = useOptions({ clock })
  const now = useNow(options.clock)
  return <span aria-hidden data-numeric="" className={cn("lining-nums tabular-nums", className)} {...props}>{children === undefined ? formatAge(feed.lastMessageAt === null ? null : Math.max(0, now - feed.lastMessageAt)) : children}</span>
}

/** Optional inline drop count or gap age. Detailed sequence and gap state are in FeedHealthDetails. */
export function FeedHealthLane({ className, children, ...props }: ComponentProps<"span">) {
  const { feed, now } = useFeed()
  const dropped = feed.lane === "coalesced" && Boolean(feed.dropped)
  const gap = feed.lane === "ordered" ? feed.gap : null
  if (children === undefined && !dropped && !gap) return null
  return <span data-slot="tradecn-feed-health-lane" data-numeric="" className={cn("inline-flex items-center gap-1 lining-nums tabular-nums", gap ? "text-stale" : "text-muted-foreground", className)} {...props}>
    {children === undefined ? <>
      {dropped && `drop ${feed.dropped!.toLocaleString()}`}
      {gap && <>{gap.replaying && <Spinner aria-hidden className="size-3" />}{`gap ${formatAge(Math.max(0, now - gap.since))}`}<span className="sr-only">{gap.replaying ? " replaying" : " open"}</span></>}
    </> : children}
  </span>
}

/** Replaceable metadata formatting. Children append caller-owned fields, such as a pending label. */
export function FeedHealthDetails({ className, children, ...props }: ComponentProps<"dl">) {
  const { feed, tier } = useFeed()
  return <dl data-slot="tradecn-feed-health-details" className={cn("grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-left text-xs lining-nums tabular-nums", className)} {...props}>
    <dt>State</dt><dd>{feed.state}</dd>
    <dt>Data</dt><dd>{tier}</dd>
    <dt>Last message</dt><dd>{feed.lastMessageAt === null ? "–" : new Date(feed.lastMessageAt).toLocaleTimeString()}</dd>
    {feed.lane === "ordered" && feed.seq !== undefined && <><dt>Sequence</dt><dd>{feed.seq.toLocaleString()}</dd></>}
    {feed.lane === "coalesced" && <><dt>Dropped</dt><dd>{(feed.dropped ?? 0).toLocaleString()}</dd></>}
    {feed.gap && <><dt>Gap</dt><dd>{feed.gap.replaying ? "replaying" : "open"}</dd></>}
    {children}
  </dl>
}

/** Put the caller's pending label wherever it belongs; omission uses the action id. */
export function FeedHealthPending({ className, children, ...props }: ComponentProps<"span">) {
  const { pending } = useFeed()
  if (!pending) return null
  return <span data-slot="tradecn-feed-health-pending" data-feed-pending={pending.action} className={cn("inline-flex items-center gap-1 text-muted-foreground", className)} {...props}><Spinner aria-hidden className="size-3" />{children === undefined ? pending.action : children}</span>
}

export interface FeedHealthAnnouncerProps extends ComponentProps<"span">, FeedHealthOptions {
  feeds: readonly FeedDescriptor[]
}

/** Mount once per collection, even when the same feeds have several visual presentations. */
export function FeedHealthAnnouncer({ feeds, thresholds, session, clock, className, ...props }: FeedHealthAnnouncerProps) {
  const options = useOptions({ thresholds, session, clock })
  const now = useNow(options.clock)
  const tiers = new Map(feeds.map((feed) => [feed.id, stalenessTier(feed, now, options.thresholds, options.session)]))
  const [seen, setSeen] = useState(tiers)
  const [message, setMessage] = useState({ text: "", revision: 0 })
  if (seen.size !== tiers.size || feeds.some((feed) => seen.get(feed.id) !== tiers.get(feed.id))) {
    const changes = feeds.filter((feed) => seen.get(feed.id) !== tiers.get(feed.id)).map((feed) => {
      const tier = tiers.get(feed.id)!
      return `${feed.label} ${tier}${tier === "stale" || tier === "aging" ? `, ${formatAge(feed.lastMessageAt === null ? null : Math.max(0, now - feed.lastMessageAt))}` : ""}`
    })
    setSeen(tiers)
    // A new addition may repeat the previous words after a removal. Replace the message node
    // so the persistent live region receives an addition even when its text is identical.
    if (changes.length) setMessage({ text: changes.join(". "), revision: message.revision + 1 })
  }
  return <span aria-live="polite" aria-atomic="true" data-slot="tradecn-feed-health-announcer" className={cn("sr-only", className)} {...props}>{message.text && <span key={message.revision}>{message.text}</span>}</span>
}

export interface UseFeedActionsOptions {
  /** A pending request expires after this many milliseconds. Changes affect future presses. */
  pendingMs?: number
  /** Timestamp source; this hook does not subscribe. */
  clock?: Clock
}

interface FeedRequest {
  feedId: string
  pending: PendingFeedAction
  timer: ReturnType<typeof setTimeout>
}

/** One owner per feed. Share its result across controls or views; run rechecks current permissions. */
export function useFeedActions(feed: FeedDescriptor, actions: readonly FeedAction[], { pendingMs = 5000, clock }: UseFeedActionsOptions = {}) {
  const options = useOptions({ clock })
  const [request, setRequest] = useState<FeedRequest | null>(null)
  const active = useRef<FeedRequest | null>(null)
  const latest = useRef({ feed, actions, pendingMs, clock: options.clock })
  const mounted = useRef(false)

  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (active.current) clearTimeout(active.current.timer)
      active.current = null
    }
  }, [])
  useLayoutEffect(() => {
    latest.current = { feed, actions, pendingMs, clock: options.clock }
    if (active.current && (active.current.feedId !== feed.id || active.current.pending.state !== feed.state)) {
      clearTimeout(active.current.timer)
      active.current = null
      setRequest(null)
    }
  }, [feed, actions, pendingMs, options.clock])

  const run = useCallback((actionId: string) => {
    const current = latest.current
    const action = current.actions.find((candidate) => candidate.id === actionId)
    if (!mounted.current || active.current || !action || !current.feed.allowedActions?.includes(actionId)) return
    const clear = () => {
      if (active.current !== next) return
      clearTimeout(next.timer)
      active.current = null
      setRequest(null)
    }
    const next: FeedRequest = {
      feedId: current.feed.id,
      pending: { action: actionId, state: current.feed.state, since: current.clock.now() },
      timer: setTimeout(clear, current.pendingMs),
    }
    active.current = next
    setRequest(next)
    try {
      const result = action.run(current.feed)
      if (result) Promise.resolve(result).then(clear, clear)
    } catch {
      clear()
    }
  }, [])

  const pending = request?.feedId === feed.id && request.pending.state === feed.state ? request.pending : null
  return { actions: feedActionsFor(feed, actions), pending, pendingLabel: pending ? (actions.find((action) => action.id === pending.action)?.label ?? pending.action) : undefined, run }
}
