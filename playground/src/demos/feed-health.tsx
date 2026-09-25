import {
  FeedHealth,
  FeedHealthList,
  FeedHealthItem,
  FeedHealthIndicator,
  FeedHealthTier,
  FeedAge,
  FeedHealthTooltipTrigger,
  FeedHealthTooltipContent,
  FeedHealthDetails,
  FeedHealthAnnouncer,
  type FeedDescriptor,
} from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"

const feeds: FeedDescriptor[] = [
  {
    id: "md",
    label: "Market data",
    state: "connected",
    lane: "coalesced",
    lastMessageAt: Date.now(),
  },
]

export default function FeedHealthDemo() {
  return (
    <FeedHealth feeds={feeds} className="w-fit max-w-full">
      <FeedHealthList className="flex-wrap">
        {(feed) => (
          <FeedHealthItem feed={feed}>
            <Tooltip>
              <FeedHealthTooltipTrigger>
                <span className="font-medium">{feed.label}</span>
                <FeedHealthIndicator className="order-first" />
                <FeedHealthTier />
                <FeedAge feed={feed} />
              </FeedHealthTooltipTrigger>
              <FeedHealthTooltipContent>
                <FeedHealthDetails />
              </FeedHealthTooltipContent>
            </Tooltip>
          </FeedHealthItem>
        )}
      </FeedHealthList>
      <FeedHealthAnnouncer />
    </FeedHealth>
  )
}
