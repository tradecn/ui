import { cn } from "cn"
import { useState, useSyncExternalStore } from "react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// A strip that says, for each feed, whether it is connected and how old its data is.
//
// A number that admits it is two seconds old can be worked with; a frozen screen cannot. So every
// feed gets a state, an age, and a tier, and past a threshold the tier says stale. Only the leaves
// subscribe to the clock: the strip and the app around it do not re-render every second.

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

export interface Clock {
  subscribe(cb: () => void): () => void
  /** The time of the last tick; stable between ticks. */
  now(): number
}

/** One interval shared by every subscriber; it runs only while someone is listening. */
export function createClock(intervalMs = 1000, source: () => number = Date.now): Clock {
  let current = source()
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()
  return {
    now: () => current,
    subscribe(cb) {
      listeners.add(cb)
      if (timer === null) {
        current = source()
        timer = setInterval(() => {
          current = source()
          for (const l of listeners) l()
        }, intervalMs)
      }
      return () => {
        listeners.delete(cb)
        if (!listeners.size && timer !== null) {
          clearInterval(timer)
          timer = null
        }
      }
    },
  }
}

let shared: Clock | null = null
function sharedClock(): Clock {
  return (shared ??= createClock(1000))
}

function useNow(clock: Clock): number {
  return useSyncExternalStore(clock.subscribe, clock.now, clock.now)
}

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

export interface FeedAgeProps {
  feed: FeedDescriptor
  clock?: Clock
  className?: string
}

/** The age of a feed's data, ticking once a second. Hidden from assistive tech; the strip announces tier changes instead. */
export function FeedAge({ feed, clock, className }: FeedAgeProps) {
  const now = useNow(clock ?? sharedClock())
  return (
    <span aria-hidden className={cn("tabular-nums", className)}>
      {formatAge(feed.lastMessageAt === null ? null : Math.max(0, now - feed.lastMessageAt))}
    </span>
  )
}

interface ItemProps {
  feed: FeedDescriptor
  thresholds: StalenessThresholds
  session: SessionCalendar
  clock: Clock
  compact: boolean
}

function FeedItem({ feed, thresholds, session, clock, compact }: ItemProps) {
  const now = useNow(clock)
  const tier = stalenessTier(feed, now, thresholds, session)
  return (
    <Tooltip>
      <TooltipTrigger
        data-feed={feed.id}
        data-tier={tier}
        data-state={feed.state}
        className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40", TIER_CLASS[tier])}
      >
        <span aria-hidden className={cn("size-1.5 rounded-full", STATE_DOT[feed.state])} />
        <span className="font-medium">{feed.label}</span>
        {!compact && (
          <Badge variant="outline" className={cn("h-4 px-1 text-[10px] uppercase", TIER_CLASS[tier])}>
            {tier}
          </Badge>
        )}
        <FeedAge feed={feed} clock={clock} />
        {feed.lane === "coalesced" && Boolean(feed.dropped) && <span className="tabular-nums text-muted-foreground">{`drop ${feed.dropped!.toLocaleString()}`}</span>}
        {feed.lane === "ordered" && feed.gap && (
          <span className="inline-flex items-center gap-1 text-stale">
            {feed.gap.replaying && <Spinner className="size-3" />}
            {`gap ${formatAge(Math.max(0, now - feed.gap.since))}`}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-left tabular-nums">
          <span>State</span>
          <span>{feed.state}</span>
          <span>Data</span>
          <span>{tier}</span>
          <span>Last message</span>
          <span>{feed.lastMessageAt === null ? "–" : new Date(feed.lastMessageAt).toLocaleTimeString()}</span>
          {feed.lane === "ordered" && feed.seq !== undefined && (
            <>
              <span>Sequence</span>
              <span>{feed.seq.toLocaleString()}</span>
            </>
          )}
          {feed.lane === "coalesced" && (
            <>
              <span>Dropped</span>
              <span>{(feed.dropped ?? 0).toLocaleString()}</span>
            </>
          )}
          {feed.gap && (
            <>
              <span>Gap</span>
              <span>{feed.gap.replaying ? "replaying" : "open"}</span>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function Announcer({ feeds, thresholds, session, clock }: Omit<ItemProps, "feed" | "compact"> & { feeds: FeedDescriptor[] }) {
  const now = useNow(clock)
  const tiers = feeds.map((f) => `${f.id}=${stalenessTier(f, now, thresholds, session)}`).join("|")
  const [seen, setSeen] = useState(tiers)
  const [message, setMessage] = useState("")
  // Derived state, set during render: speak only when a tier changes, never on a plain tick.
  if (seen !== tiers) {
    const before = new Map(seen.split("|").map((p) => p.split("=") as [string, string]))
    const changes = feeds
      .map((f) => ({ f, tier: stalenessTier(f, now, thresholds, session) }))
      .filter(({ f, tier }) => before.get(f.id) !== tier)
      .map(({ f, tier }) => `${f.label} ${tier}${tier === "stale" || tier === "aging" ? `, ${formatAge(f.lastMessageAt === null ? null : now - f.lastMessageAt)}` : ""}`)
    setSeen(tiers)
    if (changes.length) setMessage(changes.join(". "))
  }
  return (
    <span aria-live="polite" className="sr-only">
      {message}
    </span>
  )
}

export interface FeedHealthProps {
  feeds: FeedDescriptor[]
  thresholds?: StalenessThresholds
  session?: SessionCalendar
  clock?: Clock
  /** Hide the tier pill; the color and the age still show. */
  compact?: boolean
  className?: string
}

export function FeedHealth({ feeds, thresholds = PROVISIONAL_THRESHOLDS, session = alwaysOpen, clock, compact = false, className }: FeedHealthProps) {
  const c = clock ?? sharedClock()
  // Radix tooltips throw without a provider above them; Base UI tooltips do not need one. Every style
  // exports TooltipProvider, so the strip brings its own and works in a consumer that never added one.
  return (
    <TooltipProvider>
      <div role="group" aria-label="Feed health" data-slot="tradecn-feed-health" className={cn("flex items-center gap-1", className)}>
        {feeds.map((feed, i) => (
          <span key={feed.id} className="inline-flex items-center gap-1">
            {i > 0 && <Separator orientation="vertical" className="h-3" />}
            <FeedItem feed={feed} thresholds={thresholds} session={session} clock={c} compact={compact} />
          </span>
        ))}
        <Announcer feeds={feeds} thresholds={thresholds} session={session} clock={c} />
      </div>
    </TooltipProvider>
  )
}
