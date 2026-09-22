// A session calendar: what tells "quiet" from "dead". feed-health takes a `SessionCalendar` and ships
// none; this builds one from sessions, holidays, and early closes, in a venue's own time zone, through
// Intl.DateTimeFormat and nothing else, so daylight saving is the runtime's problem and not this
// file's. It ships no venue's data: the sessions, the holidays, and the early closes are yours.

export type SessionStatus = "open" | "closed" | "pre" | "post" | "holiday"

export const SESSION_STATUSES: readonly SessionStatus[] = ["open", "closed", "pre", "post", "holiday"]

/** What feed-health reads. */
export interface SessionCalendar {
  status(now: number): SessionStatus
}

export interface SessionWindow {
  /** The days of the week the session opens on, 0 Sunday to 6 Saturday, in the calendar's zone. */
  days: readonly number[]
  /** "HH:MM" in the zone. */
  open: string
  /** "HH:MM" in the zone. At or before `open` means the session runs into the next day. */
  close: string
  /** "HH:MM": the pre-open starts here, on the day the session opens. */
  pre?: string
  /** "HH:MM": the post-close ends here, on the day the session closes. */
  post?: string
}

export interface EarlyClose {
  /** "YYYY-MM-DD" in the zone: the date the close falls on. */
  date: string
  /** "HH:MM" in the zone. */
  close: string
}

export interface SessionCalendarOptions {
  /** An IANA zone: "America/New_York". */
  zone: string
  sessions: readonly SessionWindow[]
  /** "YYYY-MM-DD" dates in the zone on which no session opens. */
  holidays?: readonly string[]
  earlyCloses?: readonly EarlyClose[]
}

export interface SessionTransition {
  /** ms since the epoch. */
  at: number
  /** The status from that instant. */
  status: SessionStatus
}

export interface FullSessionCalendar extends SessionCalendar {
  readonly zone: string
  /** The next change of status after `now`, or null when the calendar has no sessions. */
  nextTransition(now: number): SessionTransition | null
  /** ms until the open session closes, or null when none is open. */
  timeToClose(now: number): number | null
  /** Whether a session opens on the date: a "YYYY-MM-DD" in the zone, or an instant read in the zone. */
  isTradingDay(date: string | number | Date): boolean
  /** The instant's date, weekday, and minutes since midnight in the zone. */
  local(now: number): LocalTime
}

export interface LocalTime {
  /** "YYYY-MM-DD". */
  date: string
  /** 0 Sunday to 6 Saturday. */
  weekday: number
  /** Minutes since local midnight. */
  minutes: number
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" })
    formatters.set(zone, f)
  }
  return f
}

interface Wall {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

function wall(ms: number, zone: string): Wall {
  const out: Partial<Wall> = {}
  for (const part of formatter(zone).formatToParts(ms)) {
    if (part.type === "year") out.year = Number(part.value)
    else if (part.type === "month") out.month = Number(part.value)
    else if (part.type === "day") out.day = Number(part.value)
    else if (part.type === "hour") out.hour = Number(part.value) % 24
    else if (part.type === "minute") out.minute = Number(part.value)
    else if (part.type === "second") out.second = Number(part.value)
    else if (part.type === "weekday") out.weekday = WEEKDAYS[part.value] ?? 0
  }
  return out as Wall
}

const pad = (n: number) => String(n).padStart(2, "0")

/** An instant's date, weekday, and minutes since midnight in a zone. Throws for a zone the runtime does not know. */
export function localTime(ms: number, zone: string): LocalTime {
  const w = wall(ms, zone)
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, weekday: w.weekday, minutes: w.hour * 60 + w.minute }
}

/** Minutes since midnight from "HH:MM"; NaN when the text is not a time. */
export function parseTime(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 24 || min > 59 ? NaN : h * 60 + min
}

function splitDate(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number)
  return [y ?? NaN, m ?? NaN, d ?? NaN]
}

/** "YYYY-MM-DD" moved by `days`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** The weekday of a "YYYY-MM-DD", 0 Sunday to 6 Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = splitDate(date)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function wallUtc(ms: number, zone: string): number {
  const w = wall(ms, zone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
}

/**
 * The instant a wall-clock time in a zone falls on. The wall time is read as if it were UTC, the
 * zone's offset at that instant is taken off, and the result is checked; when the offset changed in
 * between (a daylight-saving boundary) the other offset is tried. A time that happens twice, in the
 * hour the clocks fall back, is its first occurrence. A time that never happens, in the hour they
 * spring forward, moves forward by the length of the gap, as 02:30 becomes 03:30.
 */
export function zonedInstant(date: string, time: string, zone: string): number {
  const [y, m, d] = splitDate(date)
  const minutes = parseTime(time)
  const wanted = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60)
  const first = wanted - (wallUtc(wanted, zone) - wanted)
  if (wallUtc(first, zone) === wanted) return first
  const second = wanted - (wallUtc(first, zone) - first)
  if (wallUtc(second, zone) === wanted) return second
  return Math.max(first, second)
}

interface Span {
  pre: number
  open: number
  close: number
  post: number
}

/** A calendar over sessions, holidays, and early closes in one zone. */
export function createSessionCalendar(options: SessionCalendarOptions): FullSessionCalendar {
  const { zone } = options
  const sessions = options.sessions.filter((s) => !Number.isNaN(parseTime(s.open)) && !Number.isNaN(parseTime(s.close)))
  const holidays = new Set(options.holidays ?? [])
  const earlyCloses = new Map((options.earlyCloses ?? []).map((e) => [e.date, e.close] as const))
  const tradingWeekdays = new Set(sessions.flatMap((s) => [...s.days]))
  // Spans by opening date, kept: a status read every second asks for the same few days.
  const spans = new Map<string, Span[]>()

  const isTradingDate = (date: string) => !holidays.has(date) && tradingWeekdays.has(weekdayOf(date))

  function spansOpening(date: string): Span[] {
    let list = spans.get(date)
    if (list) return list
    list = []
    if (!holidays.has(date)) {
      const weekday = weekdayOf(date)
      for (const s of sessions) {
        if (!s.days.includes(weekday)) continue
        const overnight = parseTime(s.close) <= parseTime(s.open)
        const closeDate = overnight ? addDays(date, 1) : date
        const closeTime = earlyCloses.get(closeDate) ?? s.close
        const open = zonedInstant(date, s.open, zone)
        const close = zonedInstant(closeDate, closeTime, zone)
        const pre = s.pre !== undefined && !Number.isNaN(parseTime(s.pre)) ? Math.min(open, zonedInstant(date, s.pre, zone)) : open
        const post = s.post !== undefined && !Number.isNaN(parseTime(s.post)) ? Math.max(close, zonedInstant(closeDate, s.post, zone)) : close
        list.push({ pre, open, close, post })
      }
    }
    if (spans.size > 64) spans.clear()
    spans.set(date, list)
    return list
  }

  function around(now: number): Span[] {
    const today = localTime(now, zone).date
    return [...spansOpening(addDays(today, -1)), ...spansOpening(today)]
  }

  function status(now: number): SessionStatus {
    let pre = false
    let post = false
    for (const span of around(now)) {
      if (span.open <= now && now < span.close) return "open"
      if (span.pre <= now && now < span.open) pre = true
      if (span.close <= now && now < span.post) post = true
    }
    if (pre) return "pre"
    if (post) return "post"
    const today = localTime(now, zone).date
    if (holidays.has(today) && tradingWeekdays.has(weekdayOf(today))) return "holiday"
    return "closed"
  }

  function nextTransition(now: number): SessionTransition | null {
    if (!sessions.length) return null
    const today = localTime(now, zone).date
    const marks: SessionTransition[] = []
    for (let i = -1; i <= 21; i++) {
      const date = addDays(today, i)
      for (const span of spansOpening(date)) {
        if (span.pre < span.open) marks.push({ at: span.pre, status: "pre" })
        marks.push({ at: span.open, status: "open" })
        marks.push({ at: span.close, status: span.post > span.close ? "post" : "closed" })
        if (span.post > span.close) marks.push({ at: span.post, status: "closed" })
      }
      if (holidays.has(date) && tradingWeekdays.has(weekdayOf(date))) {
        marks.push({ at: zonedInstant(date, "00:00", zone), status: "holiday" })
        marks.push({ at: zonedInstant(addDays(date, 1), "00:00", zone), status: "closed" })
      }
    }
    marks.sort((a, b) => a.at - b.at)
    // A boundary is a change only when the status after it differs from the status before it.
    let current = status(now)
    for (const mark of marks) {
      if (mark.at <= now) continue
      const after = status(mark.at)
      if (after !== current) return { at: mark.at, status: after }
      current = after
    }
    return null
  }

  function timeToClose(now: number): number | null {
    for (const span of around(now)) if (span.open <= now && now < span.close) return span.close - now
    return null
  }

  return {
    zone,
    status,
    nextTransition,
    timeToClose,
    isTradingDay(date) {
      const text = typeof date === "string" ? date : localTime(date instanceof Date ? date.getTime() : date, zone).date
      return isTradingDate(text)
    },
    local: (now) => localTime(now, zone),
  }
}
