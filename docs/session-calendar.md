# session-calendar

A session calendar from sessions, holidays, and early closes in a venue's own time zone: what tells a quiet feed from a dead one.

## Usage

```ts
import { createSessionCalendar } from "@/lib/session-calendar"
```

```ts
const cash = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-11-26", "2026-12-25"],
  earlyCloses: [{ date: "2026-11-27", close: "13:00" }],
})

cash.status(Date.now()) // "open" | "closed" | "pre" | "post" | "holiday"
cash.nextTransition(Date.now()) // { at, status }
cash.timeToClose(Date.now()) // ms, or null when not open
cash.isTradingDay("2026-11-27") // true

<FeedHealth feeds={feeds} session={cash} />
```

## API Reference

### What feed-health reads

[`feed-health`](feed-health.md) takes a `SessionCalendar` with one method, `status(now)`, and ships none. Session state is what tells "quiet" from "dead": a feed with no message for a minute is stale at noon and closed at midnight. `createSessionCalendar` returns that calendar, with three more readings on it: `nextTransition(now)`, the next change of status and when, for a countdown or a banner; `timeToClose(now)`, how long the open session has left, or null; and `isTradingDay(date)`, for a maturity or a settlement date.

### Sessions

A session is `{ days, open, close, pre, post }`: the days of the week it opens on (0 Sunday to 6 Saturday, in the zone), the open and the close as `HH:MM` in the zone, and, when the venue has them, the start of the pre-open and the end of the post-close. A close at or before the open means the session runs into the next day: an evening session that opens at 17:00 and closes at 16:00 tomorrow is one session, open across midnight, and it is `open` at two in the morning because it opened yesterday. Several sessions may share a calendar. The status is `open` while any session is, else `pre` or `post` while one is in that window, else `holiday` on a holiday that would otherwise be a trading day, else `closed`. An edge belongs to what starts there: at the close the status is `post` or `closed`, not `open`.

### Holidays and early closes

`holidays` are `YYYY-MM-DD` dates in the zone on which no session opens. `earlyCloses` are `{ date, close }`, the date the close falls on, so an overnight session's early close names the day it closes, and the session's other edges stay where they are. The lib ships no venue's data: the sessions, the holidays, and the early closes are yours to supply from the venue's own published calendar, and the demo carries one example built from a public exchange calendar and says where it came from.

### Time zones

Everything goes through `Intl.DateTimeFormat` with a `timeZone`, so daylight saving is the runtime's problem and not this file's: 09:30 New York is 14:30 UTC in February and 13:30 UTC in June, and the calendar knows without being told. A wall-clock time inside a spring-forward gap moves forward by the length of the gap, and a time the clocks fall back through, which happens twice, is its first occurrence. `localTime(ms, zone)` reads an instant's date, weekday, and minutes since midnight in a zone; `zonedInstant(date, time, zone)` finds the instant of a wall-clock time; `addDays`, `weekdayOf`, and `parseTime` are the small parts. No dependency.

### What it does not do

It holds no venue's schedule and reads no feed. It does not tick: hand `status(now)` the clock's `now`, as feed-health does, or read `nextTransition` once and set one timer.
