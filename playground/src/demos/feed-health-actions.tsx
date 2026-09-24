import { useEffect, useRef, useState } from "react"
import { FeedHealth, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

const disconnected: FeedDescriptor = { id: "rfq", label: "RFQ", state: "disconnected", lane: "ordered", lastMessageAt: null, seq: 0, allowedActions: ["reconnect"] }

export default function FeedHealthActionsDemo() {
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
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={busy || feed.state === "disconnected"} onClick={() => { setFeed(disconnected); setMessage("Disconnected.") }}>Disconnect RFQ</button>
      </div>
      <div className="w-fit max-w-full space-y-2">
        <FeedHealth feeds={[feed]} actions={actions} className="flex-wrap" />
        <p role="status" className="text-xs text-muted-foreground">{message}</p>
      </div>
    </>
  )
}
