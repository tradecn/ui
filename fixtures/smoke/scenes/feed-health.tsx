import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthList, FeedHealthEmpty, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, useFeedActionMenu, type FeedAction, type FeedDescriptor } from "@/components/ui/feed-health"
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
        <button type="button" onClick={() => schedule(() => setFeeds([]), 500)}>Remove all feeds soon</button>
        <label><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />Compact feeds</label>
      </div>
      <FeedHealth feeds={feeds}>
        <FeedHealthList>{(feed, index) => <div className="inline-flex items-center gap-1">
          {index > 0 && <Separator orientation="vertical" className="h-3" />}
          <FeedRow feed={feed} actions={actions} compact={compact} />
        </div>}</FeedHealthList>
        <FeedHealthEmpty>No feeds configured.</FeedHealthEmpty>
        <FeedHealthAnnouncer />
      </FeedHealth>
    </div>
  )
}

function FeedRow({ feed, actions, compact }: { feed: FeedDescriptor; actions: FeedAction[]; compact: boolean }) {
  const { actions: offered, pending, pendingLabel, run } = useFeedActions(feed, actions, { pendingMs: 2000 })
  const reading = useRef<HTMLButtonElement>(null)
  const menu = useFeedActionMenu({ hasActions: offered.length > 0, fallbackRef: reading })
  return <FeedHealthItem feed={feed} pending={pending}>
    <Tooltip>
      <FeedHealthTooltipTrigger ref={reading}>
        <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
        <FeedHealthTier className={compact ? "sr-only" : undefined} />
        <FeedAge feed={feed} /><FeedHealthLane /><FeedHealthPending>{pendingLabel}</FeedHealthPending>
      </FeedHealthTooltipTrigger>
      <FeedHealthTooltipContent><FeedHealthDetails>{pending && <><dt>Pending</dt><dd>{pendingLabel}</dd></>}</FeedHealthDetails></FeedHealthTooltipContent>
    </Tooltip>
    {menu.mounted && <DropdownMenu {...menu.menuProps}>
      <DropdownMenuTrigger {...menu.triggerProps} aria-label={`Actions: ${feed.label}`} data-feed-actions={feed.id} className="rounded px-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40">⋮</DropdownMenuTrigger>
      <DropdownMenuContent {...menu.contentProps} align="start">
        {offered.length === 0 && <DropdownMenuItem disabled>No actions available.</DropdownMenuItem>}
        {offered.map((action) => <DropdownMenuItem key={action.id} data-feed-action={action.id} disabled={Boolean(pending)} className={action.destructive ? "text-destructive" : undefined} onClick={() => run(action.id)}>{action.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
  </FeedHealthItem>
}
