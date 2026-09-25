import { useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"

export default function FeedHealthDemo() {
  const [lastMessageAt, setLastMessageAt] = useState(Date.now)
  const feed: FeedDescriptor = { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt }
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setLastMessageAt(Date.now())}>Receive a message</button>
      </div>
      <FeedHealth thresholds={{ agingMs: 2000, staleMs: 10_000 }} className="w-fit max-w-full flex-wrap">
        <FeedHealthItem feed={feed}>
          <Tooltip>
            <FeedHealthTooltipTrigger>
              <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
              <FeedHealthTier />
              <FeedAge feed={feed} />
            </FeedHealthTooltipTrigger>
            <FeedHealthTooltipContent><FeedHealthDetails /></FeedHealthTooltipContent>
          </Tooltip>
        </FeedHealthItem>
        <FeedHealthAnnouncer feeds={[feed]} />
      </FeedHealth>
    </>
  )
}
