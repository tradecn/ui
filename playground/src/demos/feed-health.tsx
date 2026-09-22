import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { FeedHealth, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0, allowedActions: ["pause"] },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null, allowedActions: ["resubscribe"] },
    { id: "vpn", label: "VPN", state: "connected", lane: "ordered", lastMessageAt: now },
  ]
}

export default function FeedHealthDemo() {
  const [paused, setPaused] = useState(false)
  const [gap, setGap] = useState(false)
  const [down, setDown] = useState(false)
  const [feeds, setFeeds] = useState<FeedDescriptor[]>(initialFeeds)
  // The feeds report; the component only reads. Pause one and watch it age, then go stale at 10 s.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setFeeds((fs) =>
        fs.map((f) => {
          if (f.id === "md") return paused ? f : { ...f, lastMessageAt: now, dropped: (f.dropped ?? 0) + (Math.random() < 0.3 ? 7 : 0) }
          if (f.id === "rfq") return { ...f, lastMessageAt: gap ? f.lastMessageAt : now, seq: gap ? f.seq : (f.seq ?? 0) + 1, gap: gap ? (f.gap ?? { since: now, replaying: true }) : null }
          return { ...f, state: down ? "disconnected" : "connected", lastMessageAt: down ? f.lastMessageAt : now }
        }),
      )
    }, 500)
    return () => clearInterval(t)
  }, [paused, gap, down])
  // The menu on a feed offers what the server allows on it. A press is a request: the feed shows it pending until its state moves.
  const actions: FeedAction[] = [
    { id: "pause", label: "Pause", run: () => {
      setTimeout(() => setPaused(true), 400)
    } },
    { id: "resume", label: "Resume", run: () => {
      setTimeout(() => setPaused(false), 400)
    } },
    { id: "reconnect", label: "Reconnect", run: () => {
      setTimeout(() => setDown(false), 800)
    } },
    { id: "resubscribe", label: "Resubscribe", run: () => new Promise((resolve) => setTimeout(resolve, 1200)) },
  ]
  const offered = feeds.map((f) => (f.id === "md" ? { ...f, allowedActions: [paused ? "resume" : "pause"], state: paused ? ("connecting" as const) : ("connected" as const) } : f.id === "vpn" ? { ...f, allowedActions: down ? ["reconnect"] : [] } : f))
  return (
    <div className="space-y-4 font-(family-name:--tradecn-font-mono) text-xs">
      <FeedHealth feeds={offered} actions={actions} />
      <FeedHealth feeds={offered} actions={actions} compact />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume market data" : "Pause market data"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setGap((g) => !g)}>
          {gap ? "Close the RFQ gap" : "Open an RFQ gap"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDown((d) => !d)}>
          {down ? "Reconnect the VPN" : "Drop the VPN"}
        </Button>
      </div>
    </div>
  )
}
