import { useEffect, useState } from "react"
import { FeedHealth, type FeedAction, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null, allowedActions: ["resubscribe"] },
    { id: "vpn", label: "VPN", state: "connected", lane: "ordered", lastMessageAt: now },
  ]
}

export function FeedHealthScene() {
  const [paused, setPaused] = useState(false)
  const [gap, setGap] = useState(false)
  const [down, setDown] = useState(false)
  const [feeds, setFeeds] = useState<FeedDescriptor[]>(initialFeeds)
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
  // What the server allows on each feed, and what a press asks for. The strip shows the request pending until the feed's state moves.
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
    { id: "resubscribe", label: "Resubscribe", run: () => new Promise((resolve) => setTimeout(resolve, 1500)) },
  ]
  const offered = feeds.map((f) => (f.id === "md" ? { ...f, allowedActions: [paused ? "resume" : "pause"], state: paused ? ("connecting" as const) : ("connected" as const) } : f.id === "vpn" ? { ...f, allowedActions: down ? ["reconnect"] : [] } : f))
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">feed-health</h1>
      <p className="text-muted-foreground">Each feed's menu offers what the server allows on it; a press shows pending until the feed's state moves or the promise settles. The tier never moves on a click.</p>
      <FeedHealth feeds={offered} actions={actions} />
      <FeedHealth feeds={offered} actions={actions} compact />
      <div className="flex gap-2">
        <button className="rounded border border-border px-2 py-1" onClick={() => setPaused((p) => !p)}>
          {paused ? "resume market data" : "pause market data (watch it age, then go stale at 10 s)"}
        </button>
        <button className="rounded border border-border px-2 py-1" onClick={() => setGap((g) => !g)}>
          {gap ? "close RFQ gap" : "open RFQ gap"}
        </button>
        <button className="rounded border border-border px-2 py-1" onClick={() => setDown((d) => !d)}>
          {down ? "reconnect VPN" : "drop VPN"}
        </button>
      </div>
    </main>
  )
}
