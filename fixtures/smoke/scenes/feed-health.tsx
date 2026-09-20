import { FeedHealth, type FeedDescriptor } from "@/components/ui/feed-health"

const FEEDS: FeedDescriptor[] = [
  { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: Date.now(), dropped: 3 },
  { id: "rfq", label: "RFQ", state: "connecting", lane: "ordered", lastMessageAt: null },
]

export function FeedHealthScene() {
  return <FeedHealth feeds={FEEDS} />
}
