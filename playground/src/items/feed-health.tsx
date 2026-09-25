import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Separator } from "@/components/ui/separator"
import { Tooltip } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null, allowedActions: ["resubscribe"] },
    { id: "vpn", label: "VPN", state: "connected", lane: "ordered", lastMessageAt: now },
  ]
}

export function FeedHealthScene() {
  const replies = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => () => { for (const timer of replies.current) clearTimeout(timer) }, [])
  const schedule = (reply: () => void, ms: number) => {
    const timer = setTimeout(() => { replies.current.delete(timer); reply() }, ms)
    replies.current.add(timer)
  }
  const [paused, setPaused] = useState(false)
  const [gap, setGap] = useState(false)
  const [down, setDown] = useState(false)
  const [feeds, setFeeds] = useState<FeedDescriptor[]>(initialFeeds)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setFeeds((fs) =>
        fs.map((f) => {
          if (f.id === "md") return paused ? f : { ...f, lastMessageAt: now, dropped: (f.dropped ?? 0) + (Math.random() < 0.3 ? 7 : 0) }
          if (f.id === "rfq") return { ...f, lastMessageAt: gap ? f.lastMessageAt : now, seq: gap ? f.seq : (f.seq ?? 0) + 1, gap: gap ? (f.gap ?? { since: now, replaying: true }) : null }
          return { ...f, state: down ? "disconnected" : "connected", lastMessageAt: down ? f.lastMessageAt : now }
        }),
      )
    }, 500)
    return () => clearInterval(t)
  }, [paused, gap, down])
  // What the server allows on each feed, and what a press asks for. The strip shows the request pending until the feed's state moves.
  const actions: FeedAction[] = [
    {
      id: "pause", label: "Pause", run: () => {
        schedule(() => setPaused(true), 400)
      }
    },
    {
      id: "resume", label: "Resume", run: () => {
        schedule(() => setPaused(false), 400)
      }
    },
    {
      id: "reconnect", label: "Reconnect", run: () => {
        schedule(() => setDown(false), 800)
      }
    },
    { id: "resubscribe", label: "Resubscribe", run: () => new Promise<void>((resolve) => schedule(resolve, 1500)) },
  ]
  const availableFeeds = feeds.map((f) => (f.id === "md" ? { ...f, allowedActions: [paused ? "resume" : "pause"], state: paused ? ("connecting" as const) : ("connected" as const) } : f.id === "vpn" ? { ...f, allowedActions: down ? ["reconnect"] : [] } : f))
  // This scene has three fixed feeds; each hook supplies both presentations of its feed.
  const marketHealth = useFeedActions(availableFeeds[0]!, actions)
  const rfqHealth = useFeedActions(availableFeeds[1]!, actions)
  const vpnHealth = useFeedActions(availableFeeds[2]!, actions)
  const health = [marketHealth, rfqHealth, vpnHealth]
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">feed-health</h1>
      <p className="text-muted-foreground">Each feed's menu offers what the server allows on it; a press shows pending until the feed's state moves or the promise settles. The tier never moves on a click.</p>
      <FeedHealth className="w-fit flex-col items-start gap-3">
        {[false, true].map((compact) => <div key={String(compact)} className="flex items-center gap-1">
          {availableFeeds.map((feed, index) => <div key={feed.id} className="inline-flex items-center gap-1">
            {index > 0 && <Separator orientation="vertical" className="h-3" />}
            <FeedPresentation feed={feed} health={health[index]!} compact={compact} />
          </div>)}
        </div>)}
        <FeedHealthAnnouncer feeds={availableFeeds} />
      </FeedHealth>
      <div className="flex gap-2">
        <button className="rounded border border-border px-2 py-1" onClick={() => setPaused((p) => !p)}>
          {paused ? "resume market data" : "pause market data (watch it age, then go stale at 10 s)"}
        </button>
        <button className="rounded border border-border px-2 py-1" onClick={() => setGap((g) => !g)}>
          {gap ? "close RFQ gap" : "open RFQ gap"}
        </button>
        <button className="rounded border border-border px-2 py-1" onClick={() => setDown((d) => !d)}>
          {down ? "reconnect VPN" : "drop VPN"}
        </button>
      </div>
    </main>
  )
}

function FeedPresentation({ feed, health, compact }: { feed: FeedDescriptor; health: ReturnType<typeof useFeedActions>; compact: boolean }) {
  const { actions: offered, pending, pendingLabel, run } = health
  const [menuState, setMenuState] = useState<"closed" | "open" | "closing">("closed")
  const [menuFocused, setMenuFocused] = useState(false)
  const reading = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (menuState !== "closing") return
    // Keep the trigger mounted until the primitive and browser finish moving focus.
    const restoreFocus = setTimeout(() => {
      const active = document.activeElement
      if (offered.length === 0 && document.hasFocus() && (active === document.body || active === trigger.current || content.current?.contains(active))) reading.current?.focus()
      setMenuState("closed")
    }, 0)
    return () => clearTimeout(restoreFocus)
  }, [menuState, offered.length])
  return <FeedHealthItem feed={feed} pending={pending}>
    <Tooltip>
      <FeedHealthTooltipTrigger ref={reading}>
        <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
        <FeedHealthTier className={compact ? "sr-only" : undefined} />
        <FeedAge feed={feed} /><FeedHealthLane /><FeedHealthPending>{pendingLabel}</FeedHealthPending>
      </FeedHealthTooltipTrigger>
      <FeedHealthTooltipContent><FeedHealthDetails>{pending && <><dt>Pending</dt><dd>{pendingLabel}</dd></>}</FeedHealthDetails></FeedHealthTooltipContent>
    </Tooltip>
    {(offered.length > 0 || menuState !== "closed" || menuFocused) && <DropdownMenu open={menuState === "open"} onOpenChange={(open) => setMenuState(open ? "open" : "closing")}>
      <DropdownMenuTrigger ref={trigger} onFocus={() => setMenuFocused(true)} onBlur={() => setMenuFocused(false)} aria-label={`Actions: ${feed.label}`} data-feed-actions={feed.id} className="rounded px-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40">⋮</DropdownMenuTrigger>
      <DropdownMenuContent ref={content} align="start">
        {offered.length === 0 && <DropdownMenuItem disabled>No actions available.</DropdownMenuItem>}
        {offered.map((action) => <DropdownMenuItem key={action.id} data-feed-action={action.id} disabled={Boolean(pending)} className={action.destructive ? "text-destructive" : undefined} onClick={() => run(action.id)}>{action.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </FeedHealthItem>
}
