import { useEffect, useRef, useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedHealthLane, FeedHealthDetails, FeedHealthAnnouncer, FeedHealthPending, useFeedActions, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Button } from "@/components/ui/button"

const disconnected: FeedDescriptor = { id: "rfq", label: "RFQ", state: "disconnected", lane: "ordered", lastMessageAt: null, seq: 0, allowedActions: ["reconnect"] }

export default function FeedHealthCardDemo() {
  const [feed, setFeed] = useState(disconnected)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("Disconnected.")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  // Stand in for a server reply; returning the promise lets the strip settle pending.
  const request = (current: FeedDescriptor) => new Promise<void>((resolve) => {
    setBusy(true)
    setMessage("Waiting for reply.")
    timer.current = setTimeout(() => {
      timer.current = null
      setFeed({ ...current, state: "connected", lastMessageAt: Date.now(), seq: (current.seq ?? 0) + 1, allowedActions: ["resubscribe"] })
      setBusy(false)
      setMessage(current.state === "disconnected" ? "Reconnected." : "Resubscribed.")
      resolve()
    }, 1200)
  })
  const actions: FeedAction[] = [
    { id: "reconnect", label: "Reconnect", run: request },
    { id: "resubscribe", label: "Resubscribe", run: request },
  ]
  const { actions: offered, pending, pendingLabel, run } = useFeedActions(feed, actions)
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={busy || feed.state === "disconnected"} onClick={() => { setFeed(disconnected); setMessage("Disconnected.") }}>Disconnect RFQ</button>
      </div>
      <div className="w-fit max-w-full space-y-2">
        <FeedHealth className="flex-wrap">
          <FeedHealthItem feed={feed} pending={pending} className="w-72 max-w-full flex-col items-stretch gap-3 border p-3">
            <header className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-medium"><FeedHealthIndicator />{feed.label}</span>
              <FeedHealthTier />
            </header>
            <FeedHealthDetails><dt>Venue</dt><dd>Chicago</dd>{pending && <><dt>Pending</dt><dd>{pendingLabel}</dd></>}</FeedHealthDetails>
            <FeedHealthLane />
            <footer className="flex flex-wrap items-center gap-2">
              <FeedHealthPending>{pendingLabel}</FeedHealthPending>
              {offered.map((action) => <Button key={action.id} variant="outline" size="sm" disabled={Boolean(pending)} onClick={() => run(action.id)}>{action.label}</Button>)}
              <a href="https://tradecn.dev/docs/feed-health/" target="_blank" rel="noreferrer" className="underline underline-offset-4">Feed API</a>
            </footer>
          </FeedHealthItem>
          <FeedHealthAnnouncer feeds={[feed]} />
        </FeedHealth>
        <p role="status" className="text-xs text-muted-foreground">{message}</p>
      </div>
    </>
  )
}
