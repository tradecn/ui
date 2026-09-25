import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, useFeedActionMenu, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const disconnected: FeedDescriptor = { id: "rfq", label: "RFQ", state: "disconnected", lane: "ordered", lastMessageAt: null, seq: 0, allowedActions: ["reconnect"] }

export default function FeedHealthActionsDemo() {
  const [feed, setFeed] = useState(disconnected)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("Disconnected.")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  // Stand in for a server reply; returning the promise lets the hook settle pending.
  const request = (current: FeedDescriptor) => new Promise<void>((resolve) => {
    setBusy(true)
    setMessage("Waiting for reply.")
    timer.current = setTimeout(() => {
      timer.current = null
      setFeed({ ...current, state: "connected", lastMessageAt: Date.now(), seq: (current.seq ?? 0) + 1, allowedActions: current.state === "disconnected" ? ["resubscribe"] : [] })
      setBusy(false)
      setMessage(current.state === "disconnected" ? "Reconnected." : "Resubscribed. No actions are allowed now.")
      resolve()
    }, 1200)
  })
  const actions: FeedAction[] = [
    { id: "reconnect", label: "Reconnect", run: request },
    { id: "resubscribe", label: "Resubscribe", run: request },
  ]
  const { actions: offered, pending, pendingLabel, run } = useFeedActions(feed, actions)
  const reading = useRef<HTMLButtonElement>(null)
  const menu = useFeedActionMenu({ hasActions: offered.length > 0, fallbackRef: reading })
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={busy || feed.state === "disconnected"} onClick={() => { setFeed(disconnected); setMessage("Disconnected.") }}>Disconnect RFQ</button>
      </div>
      <div className="w-fit max-w-full space-y-2">
        <FeedHealth feeds={[feed]} className="flex-wrap">
          <FeedHealthItem feed={feed} pending={pending}>
            <Tooltip>
              <FeedHealthTooltipTrigger ref={reading}>
                <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
                <FeedHealthTier />
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
          <FeedHealthAnnouncer />
        </FeedHealth>
        <p role="status" className="text-xs text-muted-foreground">{message}</p>
      </div>
    </>
  )
}
