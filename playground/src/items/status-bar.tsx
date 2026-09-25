import { Separator } from "@/components/ui/separator"
import { useEffect, useState } from "react"
import { FeedHealth, FeedHealthList, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"
import { StatusBar, type StatusBarClock, type StatusBarEnvironment } from "@/registry/tradecn/ui/status-bar"

// A screen's chrome, bottom edge: switch the environment and watch the badge change word and tone, add
// a clock and watch it join the one timer the others tick on, drop the user, fill or empty the slots.

const ENVIRONMENTS: StatusBarEnvironment[] = [
  { label: "PRODUCTION", tone: "destructive" },
  { label: "UAT", tone: "stale" },
  { label: "DEV", tone: "flat" },
  { label: "REPLAY", tone: "primary" },
]

const CLOCKS: StatusBarClock[] = [
  { label: "New York", zone: "America/New_York" },
  { label: "Chicago", zone: "America/Chicago" },
  { label: "London", zone: "Europe/London" },
  { label: "Frankfurt", zone: "Europe/Berlin" },
  { label: "Tokyo", zone: "Asia/Tokyo" },
  { label: "Sydney", zone: "Australia/Sydney" },
  { label: "UTC", zone: "UTC" },
]

function initialFeeds(): FeedDescriptor[] {
  const now = Date.now()
  return [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 1, gap: null },
    { id: "vpn", label: "VPN", state: "connected", lane: "ordered", lastMessageAt: now },
  ]
}

export function StatusBarScene() {
  const [env, setEnv] = useState(0)
  const [clocks, setClocks] = useState<StatusBarClock[]>(CLOCKS.slice(0, 3))
  const [user, setUser] = useState<string | undefined>("jdoe")
  const [slots, setSlots] = useState({ left: true, center: false, right: true })
  const [feeds, setFeeds] = useState<FeedDescriptor[]>(initialFeeds)
  useEffect(() => {
    const t = setInterval(() => setFeeds((fs) => fs.map((f) => (f.id === "vpn" ? f : { ...f, lastMessageAt: Date.now(), seq: f.seq === undefined ? undefined : f.seq + 1 }))), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <main className="flex h-screen flex-col font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex-1 space-y-3 p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-sm font-semibold">status-bar</h1>
          <span className="text-muted-foreground">The bottom edge of a screen. The environment is a word in a tone, the clocks share one timer, the slots hold whatever the consumer puts there.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">environment</span>
          {ENVIRONMENTS.map((e, i) => (
            <button key={e.label} type="button" className={`rounded border border-border px-2 py-0.5 ${i === env ? "bg-muted" : ""}`} aria-pressed={i === env} onClick={() => setEnv(i)}>
              {e.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">clocks</span>
          {CLOCKS.map((c) => {
            const on = clocks.some((x) => x.zone === c.zone)
            return (
              <button key={c.zone} type="button" className={`rounded border border-border px-2 py-0.5 ${on ? "bg-muted" : ""}`} aria-pressed={on} onClick={() => setClocks((list) => (on ? list.filter((x) => x.zone !== c.zone) : [...list, c]))}>
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={user !== undefined} onChange={(e) => setUser(e.target.checked ? "jdoe" : undefined)} /> user
          </label>
          {(["left", "center", "right"] as const).map((slot) => (
            <label key={slot} className="flex items-center gap-1">
              <input type="checkbox" checked={slots[slot]} onChange={(e) => setSlots({ ...slots, [slot]: e.target.checked })} /> {slot} slot
            </label>
          ))}
        </div>
      </div>
      <StatusBar
        environment={ENVIRONMENTS[env]}
        clocks={clocks}
        user={user}
        left={slots.left ? <FeedHealth feeds={feeds}>
          <FeedHealthList>{(feed, index) => <div className="inline-flex items-center gap-1">
            {index > 0 && <Separator orientation="vertical" className="h-3" />}
            <FeedHealthItem feed={feed}>
              <Tooltip>
                <FeedHealthTooltipTrigger>
                  <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
                  <FeedHealthTier className="sr-only" />
                  <FeedAge feed={feed} /><FeedHealthLane />
                </FeedHealthTooltipTrigger>
                <FeedHealthTooltipContent><FeedHealthDetails /></FeedHealthTooltipContent>
              </Tooltip>
            </FeedHealthItem>
          </div>}</FeedHealthList>
          <FeedHealthAnnouncer />
        </FeedHealth> : undefined}
        center={slots.center ? <span className="text-muted-foreground">T 4 1/8 05/34 · 99-16+ / 99-17</span> : undefined}
        right={slots.right ? <PerfMonitor compact /> : undefined}
      />
    </main>
  )
}
