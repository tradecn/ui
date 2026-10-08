import { cn } from "cn"
import type { ComponentProps, ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import type { Clock } from "@/registry/tradecn/lib/clock"
import { NULL_TOKEN, NUMERIC_CLASS } from "@/registry/tradecn/lib/format"

export type StatusTone = "up" | "down" | "flat" | "stale" | "expiring" | "primary" | "destructive"

export interface StatusBarEnvironment {
  /** The word: "PRODUCTION", "UAT", "DEV". Printed as is. */
  label: string
  tone?: StatusTone
}

export interface StatusBarClock {
  /** "New York", "London", "Tokyo". */
  label: string
  /** An IANA zone: "America/New_York". */
  zone: string
  /** Show seconds. Default true. */
  seconds?: boolean
  /** Default h23. */
  hourCycle?: "h23" | "h12"
}

export interface StatusBarLabels {
  /** The bar's accessible name. */
  title: string
  environment: string
  user: string
  clocks: string
}

export const DEFAULT_STATUS_BAR_LABELS: StatusBarLabels = {
  title: "Status",
  environment: "Environment",
  user: "Signed in as",
  clocks: "Clocks",
}

export interface StatusBarProps extends Omit<ComponentProps<"div">, "children"> {
  children: ReactNode
}

export interface StatusBarEnvironmentBadgeProps extends Omit<ComponentProps<"span">, "children">, StatusBarEnvironment {
  /** Screen-reader prefix and default title. Default "Environment". */
  prefix?: string
}

export interface StatusBarClocksProps extends Omit<ComponentProps<"div">, "children"> {
  children: ReactNode
}

export interface StatusBarClockReadoutProps extends Omit<ComponentProps<"span">, "children">, StatusBarClock {
  /** The shared one-second clock unless given another. */
  source?: Clock
}

export interface StatusBarUserProps extends Omit<ComponentProps<"span">, "children"> {
  user: string
  /** Screen-reader prefix and default title prefix. Default "Signed in as". */
  prefix?: string
}

/**
 * The environment badge's classes per tone: the tone's tint behind foreground text. The label is always the word; the
 * tone is the hint. A tone's own color as text on its tint drops below 4.5 to 1 in the light themes.
 */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  up: "text-foreground bg-up-soft",
  down: "text-foreground bg-down-soft",
  flat: "text-foreground bg-flat-soft",
  stale: "text-foreground bg-stale-soft",
  expiring: "text-foreground bg-expiring-soft",
  primary: "text-foreground bg-primary/15",
  destructive: "text-foreground bg-destructive/15",
}

const formats = new Map<string, Intl.DateTimeFormat | null>()

/** A formatter for a zone, made once; null when the zone is not one the runtime knows. */
export function clockFormat(zone: string, seconds = true, hourCycle: "h23" | "h12" = "h23"): Intl.DateTimeFormat | null {
  const key = `${zone}|${seconds}|${hourCycle}`
  if (!formats.has(key)) {
    try {
      formats.set(key, new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hourCycle }))
    } catch {
      formats.set(key, null)
    }
  }
  return formats.get(key) ?? null
}

/** The time in a zone, or the null token when the zone is not one the runtime knows. */
export function formatClock(ms: number, clock: StatusBarClock): string {
  const format = clockFormat(clock.zone, clock.seconds ?? true, clock.hourCycle ?? "h23")
  return format ? format.format(ms) : NULL_TOKEN
}

/** A static container. Each clock readout owns its subscription. */
export function StatusBar({ className, children, ...props }: StatusBarProps) {
  return (
    <div role="group" aria-label={DEFAULT_STATUS_BAR_LABELS.title} data-slot="tradecn-status-bar" {...props} className={cn("flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background px-2 py-0.5 text-xs whitespace-nowrap text-foreground lining-nums tabular-nums", className)}>
      {children}
    </div>
  )
}

export function StatusBarEnvironmentBadge({ label, tone, prefix = DEFAULT_STATUS_BAR_LABELS.environment, className, ...props }: StatusBarEnvironmentBadgeProps) {
  return (
    <Badge variant="outline" data-status-environment={label} data-tone={tone} title={prefix} {...props} className={cn("h-5 shrink-0 border-transparent px-1.5 text-xs font-semibold tracking-wide", tone && STATUS_TONE_CLASS[tone], className)}>
      <span className="sr-only">{prefix}: </span>
      {label}
    </Badge>
  )
}

export function StatusBarClocks({ className, children, ...props }: StatusBarClocksProps) {
  return (
    <div role="group" aria-label={DEFAULT_STATUS_BAR_LABELS.clocks} data-status-slot="clocks" {...props} className={cn("flex shrink-0 items-center gap-3", className)}>
      {children}
    </div>
  )
}

export function StatusBarClockReadout({ label, zone, seconds, hourCycle, source, className, ...props }: StatusBarClockReadoutProps) {
  const now = useNow(source)
  return (
    <span data-status-clock={label} title={zone} {...props} className={cn("flex items-baseline gap-1", className)}>
      <span className="text-muted-foreground">{label}</span>
      <time className={NUMERIC_CLASS} dateTime={new Date(now).toISOString()} data-status-time>
        {formatClock(now, { label, zone, seconds, hourCycle })}
      </time>
    </span>
  )
}

export function StatusBarUser({ user, prefix = DEFAULT_STATUS_BAR_LABELS.user, className, ...props }: StatusBarUserProps) {
  return (
    <span data-status-user={user} title={`${prefix} ${user}`} {...props} className={cn("shrink-0 truncate", className)}>
      <span className="sr-only">{prefix} </span>
      {user}
    </span>
  )
}
