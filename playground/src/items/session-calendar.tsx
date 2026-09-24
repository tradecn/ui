import { Separator } from "@/components/ui/separator"
import { useState } from "react"
import { createSessionCalendar, zonedInstant, type FullSessionCalendar, type SessionStatus } from "@/registry/tradecn/lib/session-calendar"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTrigger, FeedHealthContent, FeedHealthDetails, FeedHealthAnnouncer, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"

// Two calendars against a clock you can move: a cash session with holidays and early closes, and an
// overnight session across midnight. Step through a day, a weekend, a holiday, and both daylight-saving
// changes and watch the status, the next transition, and what feed-health makes of a silent feed.

// The NYSE's published 2026 holiday calendar (nyse.com/markets/hours-calendars). An example; check the source.
const cash = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  earlyCloses: [
    { date: "2026-11-27", close: "13:00" },
    { date: "2026-12-24", close: "13:00" },
  ],
})

// An overnight session, the shape of a futures evening open: 17:00 Chicago Sunday to Thursday, closing 16:00 the next day.
const overnight = createSessionCalendar({ zone: "America/Chicago", sessions: [{ days: [0, 1, 2, 3, 4], open: "17:00", close: "16:00" }] })

const MOMENTS: { label: string; at: number }[] = [
  { label: "Tue 2026-09-22 10:00 New York", at: zonedInstant("2026-09-22", "10:00", "America/New_York") },
  { label: "Tue 2026-09-22 16:30 New York", at: zonedInstant("2026-09-22", "16:30", "America/New_York") },
  { label: "Sat 2026-09-26 12:00 New York", at: zonedInstant("2026-09-26", "12:00", "America/New_York") },
  { label: "Mon 2026-09-07 12:00 New York (Labor Day)", at: zonedInstant("2026-09-07", "12:00", "America/New_York") },
  { label: "Fri 2026-11-27 13:30 New York (early close)", at: zonedInstant("2026-11-27", "13:30", "America/New_York") },
  { label: "Mon 2026-03-09 09:45 New York (first day on daylight time)", at: zonedInstant("2026-03-09", "09:45", "America/New_York") },
  { label: "Mon 2026-11-02 09:45 New York (first day back on standard time)", at: zonedInstant("2026-11-02", "09:45", "America/New_York") },
  { label: "Tue 2026-09-22 02:00 Chicago", at: zonedInstant("2026-09-22", "02:00", "America/Chicago") },
]

const STATUS_WORDS: Record<SessionStatus, string> = { open: "open", closed: "closed", pre: "pre-open", post: "post-close", holiday: "holiday" }

function Reading({ name, calendar, at }: { name: string; calendar: FullSessionCalendar; at: number }) {
  const status = calendar.status(at)
  const next = calendar.nextTransition(at)
  const left = calendar.timeToClose(at)
  const local = calendar.local(at)
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: calendar.zone, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return (
    <div className="rounded-md border border-border p-2" data-calendar={name} data-session-status={status}>
      <p className="font-semibold">
        {name} <span className="font-normal text-muted-foreground">{calendar.zone}</span>
      </p>
      <p>
        {local.date} {String(Math.floor(local.minutes / 60)).padStart(2, "0")}:{String(local.minutes % 60).padStart(2, "0")} local · <span className="font-semibold">{STATUS_WORDS[status]}</span>
        {left !== null && <span className="text-muted-foreground"> · {Math.round(left / 60_000)} min to the close</span>}
      </p>
      <p className="text-muted-foreground">{next ? `next: ${STATUS_WORDS[next.status]} at ${fmt.format(next.at)}` : "no sessions"}</p>
      <p className="text-muted-foreground">trading day: {calendar.isTradingDay(at) ? "yes" : "no"}</p>
    </div>
  )
}

export function SessionCalendarScene() {
  const [moment, setMoment] = useState(0)
  const at = MOMENTS[moment]!.at
  const feeds: FeedDescriptor[] = [
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: at - 90_000, dropped: 0 },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: at - 500, seq: 1, gap: null },
  ]
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-sm font-semibold">session-calendar</h1>
        <span className="text-muted-foreground">Pick a moment. Two calendars read it in their own zones; feed-health reads the cash calendar for a feed that has been quiet for ninety seconds.</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {MOMENTS.map((m, i) => (
          <button key={m.label} type="button" className={`rounded border border-border px-2 py-0.5 ${i === moment ? "bg-muted" : ""}`} aria-pressed={i === moment} onClick={() => setMoment(i)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Reading name="cash" calendar={cash} at={at} />
        <Reading name="overnight" calendar={overnight} at={at} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground">feed-health with the cash calendar, at that moment (the clock is frozen there)</p>
        <FeedHealth session={cash} clock={{ subscribe: () => () => { }, now: () => at }}>
          {feeds.map((feed, index) => <div key={feed.id} className="inline-flex items-center gap-1">
            {index > 0 && <Separator orientation="vertical" className="h-3" />}
            <FeedHealthItem feed={feed}>
              <Tooltip>
                <FeedHealthTrigger>
                  <FeedHealthIndicator /><span className="font-medium">{feed.label}</span>
                  <FeedHealthTier />
                  <FeedAge feed={feed} /><FeedHealthLane />
                </FeedHealthTrigger>
                <FeedHealthContent><FeedHealthDetails /></FeedHealthContent>
              </Tooltip>
            </FeedHealthItem>
          </div>)}
          <FeedHealthAnnouncer feeds={feeds} />
        </FeedHealth>
      </div>
    </main>
  )
}
