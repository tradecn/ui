import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, type FeedAction, type FeedDescriptor } from "@/components/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

const NOW = Date.now()
const FEEDS: FeedDescriptor[] = [
  { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: NOW, dropped: 3, allowedActions: ["reconnect", "pause"] },
  { id: "rfq", label: "RFQ", state: "connecting", lane: "ordered", lastMessageAt: null },
]

// The market-data feed allows two actions; a press is answered by the pretend server 300 ms later, which
// moves the feed's state and so settles the pending mark. RFQ allows nothing and has no menu.
export function FeedHealthScene() {
  const [feeds, setFeeds] = useState(FEEDS)
  const [acted, setActed] = useState("")
  const [compact, setCompact] = useState(false)
  const restore = useRef<HTMLButtonElement>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer) }, [])
  const hasMarketData = feeds.some((feed) => feed.id === "md")
  useEffect(() => { if (!hasMarketData) restore.current?.focus() }, [hasMarketData])
  const schedule = (update: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); update() }, delay)
    timers.current.add(timer)
  }
  const actions: FeedAction[] = [
    {
      id: "reconnect",
      label: "Reconnect",
      run: (feed) => {
        setActed(`reconnect:${feed.id}`)
        schedule(() => setFeeds((fs) => fs.map((f) => (f.id === feed.id ? { ...f, state: "connecting", allowedActions: [] } : f))), 300)
      },
    },
    { id: "pause", label: "Pause", run: (feed) => setActed(`pause:${feed.id}`) },
    { id: "resume", label: "Resume", run: () => { } },
  ]
  return (
    <div data-feed-acted={acted}>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" ref={restore} onClick={() => setFeeds(FEEDS)}>Restore feeds</button>
        <button type="button" onClick={() => schedule(() => setFeeds((feeds) => feeds.filter((feed) => feed.id !== "md")), 500)}>Remove market data soon</button>
        <button type="button" onClick={() => schedule(() => setFeeds((feeds) => feeds.map((feed) => ({ ...feed, allowedActions: [] }))), 500)}>Revoke actions soon</button>
        <label><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />Compact feeds</label>
      </div>
      <FeedHealth>
        {feeds.map((feed, index) => <div key={feed.id} className="inline-flex items-center gap-1">
          {index > 0 && <Separator orientation="vertical" className="h-3" />}
          <FeedRow feed={feed} actions={actions} compact={compact} />
        </div>)}
        <FeedHealthAnnouncer feeds={feeds} />
      </FeedHealth>
    </div>
  )
}

function FeedRow({ feed, actions, compact }: { feed: FeedDescriptor; actions: FeedAction[]; compact: boolean }) {
  const { actions: offered, pending, pendingLabel, run } = useFeedActions(feed, actions, { pendingMs: 2000 })
  const [open, setOpen] = useState(false)
  const [menuFocused, setMenuFocused] = useState(false)
  const reading = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open && offered.length === 0) reading.current?.focus()
    wasOpen.current = open
  }, [open, offered.length])
  return <FeedHealthItem feed={feed} pending={pending}>
    <Tooltip>
      <FeedHealthTooltipTrigger ref={reading}>
        <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
        <FeedHealthTier className={compact ? "sr-only" : undefined} />
        <FeedAge feed={feed} /><FeedHealthLane /><FeedHealthPending>{pendingLabel}</FeedHealthPending>
      </FeedHealthTooltipTrigger>
      <FeedHealthTooltipContent><FeedHealthDetails>{pending && <><dt>Pending</dt><dd>{pendingLabel}</dd></>}</FeedHealthDetails></FeedHealthTooltipContent>
    </Tooltip>
    {(offered.length > 0 || open || menuFocused) && <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger onFocus={() => setMenuFocused(true)} onBlur={() => setMenuFocused(false)} aria-label={`Actions: ${feed.label}`} data-feed-actions={feed.id} className="rounded px-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40">⋮</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {offered.length === 0 && <p className="px-2 py-1 text-xs">No actions available.</p>}
        {offered.map((action) => <DropdownMenuItem key={action.id} data-feed-action={action.id} disabled={Boolean(pending)} className={action.destructive ? "text-destructive" : undefined} onClick={() => run(action.id)}>{action.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </FeedHealthItem>
}
