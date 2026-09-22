import { useEffect, useState } from "react"
import { FeedHealth, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"

function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null },
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
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">feed-health</h1>
      <FeedHealth feeds={feeds} />
      <FeedHealth feeds={feeds} compact />
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
