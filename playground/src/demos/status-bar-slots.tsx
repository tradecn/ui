import { useState } from "react"
import { FeedHealth } from "@/registry/tradecn/ui/feed-health"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"
import { StatusBar } from "@/registry/tradecn/ui/status-bar"

export default function StatusBarSlotsDemo() {
  const [lastMessageAt, setLastMessageAt] = useState(Date.now)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setLastMessageAt(Date.now())}>Receive message</button>
      </div>
      <div className="w-3xl max-w-full">
        <StatusBar
          environment={{ label: "UAT", tone: "stale" }}
          user="jdoe"
          left={<FeedHealth compact feeds={[{ id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt, dropped: 0 }]} />}
          right={<PerfMonitor compact className="w-56" />}
        />
      </div>
    </>
  )
}
