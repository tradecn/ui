import { useEffect, useState } from "react"
import { FeedHealth, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"
import { StatusBar } from "@/registry/tradecn/ui/status-bar"

// The bar composes what a consumer puts in it: here feed health and the frame monitor, both compact,
// with production in a word and a tone, three market clocks on one shared timer, and who is signed in.
function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null },
  ]
}

export default function StatusBarDemo() {
  const [feeds, setFeeds] = useState<FeedDescriptor[]>(initialFeeds)
  useEffect(() => {
    const t = setInterval(() => setFeeds((fs) => fs.map((f) => ({ ...f, lastMessageAt: Date.now(), seq: f.seq === undefined ? undefined : f.seq + 1 }))), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex h-24 flex-col justify-end font-(family-name:--tradecn-font-mono) text-xs">
      <StatusBar
        environment={{ label: "PRODUCTION", tone: "destructive" }}
        clocks={[
          { label: "New York", zone: "America/New_York" },
          { label: "London", zone: "Europe/London" },
          { label: "Tokyo", zone: "Asia/Tokyo" },
        ]}
        user="jdoe"
        left={<FeedHealth feeds={feeds} compact />}
        right={<PerfMonitor compact />}
      />
    </div>
  )
}
