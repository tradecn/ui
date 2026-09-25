import { useState } from "react"
import { FeedHealth, FeedHealthList, FeedHealthEmpty, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedHealthAnnouncer, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

const feeds: FeedDescriptor[] = [
  { id: "md", label: "Market data", state: "disconnected", lane: "coalesced", lastMessageAt: null },
]

export default function FeedHealthEmptyDemo() {
  const [configured, setConfigured] = useState(false)
  return (
    <>
      <div data-demo-controls className="text-xs">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={configured} onChange={(event) => setConfigured(event.target.checked)} />Include market data</label>
      </div>
      <FeedHealth feeds={configured ? feeds : []} className="w-fit max-w-full">
        <FeedHealthList className="flex-wrap">{(feed) => (
          <FeedHealthItem feed={feed}>
            <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" /><FeedHealthTier />
          </FeedHealthItem>
        )}</FeedHealthList>
        <FeedHealthEmpty>No feeds configured.</FeedHealthEmpty>
        <FeedHealthAnnouncer />
      </FeedHealth>
    </>
  )
}
