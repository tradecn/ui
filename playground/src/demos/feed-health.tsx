import { useState } from "react"
import { FeedHealth, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

export default function FeedHealthDemo() {
  const [lastMessageAt, setLastMessageAt] = useState(Date.now)
  const feeds: FeedDescriptor[] = [{ id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt }]
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setLastMessageAt(Date.now())}>Receive a message</button>
      </div>
      <FeedHealth feeds={feeds} thresholds={{ agingMs: 2000, staleMs: 10_000 }} className="w-fit max-w-full flex-wrap" />
    </>
  )
}
