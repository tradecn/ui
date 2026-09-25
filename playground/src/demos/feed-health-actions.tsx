import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
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
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={busy || feed.state === "disconnected"} onClick={() => { setFeed(disconnected); setMessage("Disconnected.") }}>Disconnect RFQ</button>
      </div>
      <div className="w-fit max-w-full space-y-2">
        <FeedHealth className="flex-wrap">
          <FeedHealthItem feed={feed} pending={pending}>
            <Tooltip>
              <FeedHealthTooltipTrigger ref={reading}>
                <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
                <FeedHealthTier />
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
          <FeedHealthAnnouncer feeds={[feed]} />
        </FeedHealth>
        <p role="status" className="text-xs text-muted-foreground">{message}</p>
      </div>
    </>
  )
}
