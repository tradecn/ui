import { useNow } from "@/registry/tradecn/hooks/use-clock"
import { createSessionCalendar } from "@/registry/tradecn/lib/session-calendar"

// One example calendar, built from the NYSE's published 2026 holiday calendar (nyse.com/markets/hours-calendars):
// the cash session, its early closes, and the days it does not open. Check the source before relying on it;
// the lib ships no venue's data of its own.
const cash = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  earlyCloses: [
    { date: "2026-11-27", close: "13:00" },
    { date: "2026-12-24", close: "13:00" },
  ],
})

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const duration = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`
}

export default function SessionCalendarDemo() {
  const now = useNow()
  const status = cash.status(now)
  const next = cash.nextTransition(now)
  const left = cash.timeToClose(now)
  return (
    <div className="space-y-1 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <p>
        New York cash session is <span className="font-semibold" data-session-status={status}>{status}</span>
        {left !== null && <span className="text-muted-foreground"> · {duration(left)} to the close</span>}
      </p>
      {next && (
        <p className="text-muted-foreground">
          next: {next.status} at {fmt.format(next.at)} New York
        </p>
      )}
      <p className="text-muted-foreground">
        trading days this week: {["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"].filter((d) => cash.isTradingDay(d)).length} of 6 · Labor Day 2026-09-07: {cash.isTradingDay("2026-09-07") ? "trading" : "holiday"}
      </p>
    </div>
  )
}
