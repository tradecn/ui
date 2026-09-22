import { useState } from "react"
import { FeedHealth, type FeedAction, type FeedDescriptor } from "@/components/ui/feed-health"

const NOW = Date.now()
const FEEDS: FeedDescriptor[] = [
  { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: NOW, dropped: 3, allowedActions: ["reconnect", "pause"] },
  { id: "rfq", label: "RFQ", state: "connecting", lane: "ordered", lastMessageAt: null },
]

// The market-data feed allows two actions; a press is answered by the pretend server 300 ms later, which
// moves the feed's state and so settles the pending mark. RFQ allows nothing and has no menu.
export function FeedHealthScene() {
  const [feeds, setFeeds] = useState(FEEDS)
  const [acted, setActed] = useState("")
  const actions: FeedAction[] = [
    {
      id: "reconnect",
      label: "Reconnect",
      run: (feed) => {
        setActed(`reconnect:${feed.id}`)
        setTimeout(() => setFeeds((fs) => fs.map((f) => (f.id === feed.id ? { ...f, state: "connecting" } : f))), 300)
      },
    },
    { id: "pause", label: "Pause", run: (feed) => setActed(`pause:${feed.id}`) },
    { id: "resume", label: "Resume", run: () => {} },
  ]
  return (
    <div data-feed-acted={acted}>
      <FeedHealth feeds={feeds} actions={actions} pendingMs={2000} />
    </div>
  )
}
