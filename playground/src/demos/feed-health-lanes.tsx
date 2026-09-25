import { useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, type Clock, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

// Freeze the sample so its lane details stay comparable while changing the presentation.
const now = Date.parse("2026-09-22T14:00:00Z")
const clock: Clock = { now: () => now, subscribe: () => () => { } }

export default function FeedHealthLanesDemo() {
  const [compact, setCompact] = useState(false)
  const [hasGap, setHasGap] = useState(true)
  const feeds: FeedDescriptor[] = [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now - 1000, dropped: 7 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now - 1000, seq: 42, gap: hasGap ? { since: now - 3000, replaying: true } : null },
  ]
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />Compact</label>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setHasGap(!hasGap)}>{hasGap ? "Close RFQ gap" : "Open RFQ gap"}</button>
      </div>
      <FeedHealth clock={clock} className="w-fit max-w-full flex-wrap">
        {feeds.map((feed, index) => <div key={feed.id} className="inline-flex items-center gap-1">
          {index > 0 && <Separator orientation="vertical" className="h-3" />}
          <FeedHealthItem feed={feed}>
            <Tooltip>
              <FeedHealthTooltipTrigger>
                <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
                <FeedHealthTier className={compact ? "sr-only" : undefined} />
                <FeedAge feed={feed} /><FeedHealthLane />
              </FeedHealthTooltipTrigger>
              <FeedHealthTooltipContent><FeedHealthDetails /></FeedHealthTooltipContent>
            </Tooltip>
          </FeedHealthItem>
        </div>)}
        <FeedHealthAnnouncer feeds={feeds} />
      </FeedHealth>
    </>
  )
}
