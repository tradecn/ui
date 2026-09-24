import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentProps, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRow, useView } from "@/registry/tradecn/hooks/use-row-store"
import { byNewest, type Alert, type AlertStore, type AlertTone } from "@/registry/tradecn/lib/alert-store"
import type { RowId, RowView } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type DataGridPreset } from "@/registry/tradecn/ui/data-grid"

/** The notice container. The caller supplies the list, controls, and any overflow presentation. */
export function Alerts({ className, ...props }: ComponentProps<"div">) {
  return <div role="group" aria-label="Notices" data-slot="tradecn-alerts" className={cn("flex min-w-0 flex-col gap-2 text-xs lining-nums tabular-nums", className)} {...props} />
}

export function AlertsList({ className, ...props }: ComponentProps<"ul">) {
  return <ul role="list" data-slot="tradecn-alerts-list" className={cn("flex min-w-0 list-none flex-col gap-2", className)} {...props} />
}

export interface AlertItemProps extends ComponentProps<"li"> {
  tone?: AlertTone
}

/** Tone decorates the notice; include a severity word or another non-color cue in its content. */
export function AlertItem({ tone, className, ...props }: AlertItemProps) {
  return <li data-slot="tradecn-alert-item" data-tone={tone} className={cn("flex min-w-0 flex-col gap-1 rounded-sm border border-border/60 border-s-2 bg-card px-2 py-1.5", "data-[tone=up]:border-s-up data-[tone=down]:border-s-down data-[tone=flat]:border-s-flat data-[tone=stale]:border-s-stale data-[tone=expiring]:border-s-expiring data-[tone=primary]:border-s-primary data-[tone=destructive]:border-s-destructive", className)} {...props} />
}

export function AlertHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="tradecn-alert-header" className={cn("flex min-w-0 flex-wrap items-baseline gap-2", className)} {...props} />
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="tradecn-alert-title" className={cn("min-w-0 flex-1 font-medium wrap-anywhere", className)} {...props} />
}

export function AlertBody({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="tradecn-alert-body" className={cn("min-w-0 text-muted-foreground wrap-anywhere", className)} {...props} />
}

export function AlertActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="tradecn-alert-actions" className={cn("flex flex-wrap items-center gap-1", className)} {...props} />
}

export function AlertsEmpty({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="tradecn-alerts-empty" className={cn("text-muted-foreground", className)} {...props} />
}

export interface AlertSeverityProps extends ComponentProps<typeof Badge> {
  tone?: AlertTone
}

export function AlertSeverity({ tone, className, ...props }: AlertSeverityProps) {
  return <Badge variant="outline" data-slot="tradecn-alert-severity" data-alert-severity="" className={cn("h-auto shrink-0 px-1.5 text-xs", tone && ALERT_TONE_TEXT[tone], className)} {...props} />
}

export interface AlertActionProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  alert: Alert
  action: string
  onAction: (alert: Alert) => void
}

/** A caller-composed button shown only when the notice allows its action. It does not dismiss. */
export function AlertAction({ alert, action, onAction, className, ...props }: AlertActionProps) {
  if (!alert.allowedActions?.includes(action)) return null
  return <Button type="button" variant="outline" size="sm" data-slot="tradecn-alert-action" data-alert-action={action} className={cn("h-6 px-2 text-xs", className)} {...props} onClick={() => onAction(alert)} />
}

export function AlertDismiss({ className, children = <span aria-hidden>×</span>, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="sm" aria-label="Dismiss" data-slot="tradecn-alert-dismiss" className={cn("h-6 shrink-0 px-1.5 text-xs", className)} {...props}>{children}</Button>
}

export interface UseAlertOptions {
  /** Expiry while this hook is mounted. Any allowed action disables it. */
  ttlMs?: number
  /** Use the same clock basis as the store. Defaults to Date.now. */
  now?: () => number
}

/** Subscribe to one notice. Mount in a consumer's row component to retain per-row updates. */
export function useAlert(alerts: AlertStore, id: RowId, { ttlMs, now = Date.now }: UseAlertOptions = {}): Alert | undefined {
  const alert = useRow(alerts.store, id)
  const at = alert?.at
  const actionable = Boolean(alert?.allowedActions?.length)
  const latest = useRef(now)
  useEffect(() => { latest.current = now })
  useEffect(() => {
    if (ttlMs === undefined || at === undefined || actionable) return
    const timer = setTimeout(() => alerts.dismiss(id), Math.max(0, at + ttlMs - latest.current()))
    return () => clearTimeout(timer)
  }, [alerts, id, at, actionable, ttlMs])
  return alert
}

export interface AlertsAnnouncerProps {
  alerts: AlertStore
  /** The notice to announce, usually the first displayed ID; null leaves both regions empty. */
  id: RowId | null
  assertive?: readonly string[]
}

/** Mount one announcer for the collection. Repeats update its subscribed notice's count. */
export function AlertsAnnouncer({ alerts, id, assertive = [] }: AlertsAnnouncerProps) {
  const subscribe = useCallback((notify: () => void) => id === null ? () => {} : alerts.store.subscribeRow(id, notify), [alerts, id])
  const get = useCallback(() => id === null ? undefined : alerts.store.getRow(id), [alerts, id])
  const alert = useSyncExternalStore(subscribe, get, get)
  const text = alert ? `${alert.severity}: ${alert.title}${alert.message ? `. ${alert.message}` : ""}${alert.count > 1 ? ` (${alert.count})` : ""}` : ""
  const urgent = alert !== undefined && assertive.includes(alert.severity)
  return <>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-alerts-polite>{urgent ? "" : text}</div>
    <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" data-alerts-assertive>{urgent ? text : ""}</div>
  </>
}

export interface AlertHistoryLabels {
  title: string
  empty: string
  time: string
  severity: string
  noticeTitle: string
  message: string
  count: string
}

export const DEFAULT_ALERT_HISTORY_LABELS: AlertHistoryLabels = {
  title: "All notices",
  empty: "No notices.",
  time: "Time",
  severity: "Severity",
  noticeTitle: "Title",
  message: "Message",
  count: "Count",
}

export const ALERT_TONE_BAR: Record<AlertTone, string> = {
  up: "bg-up",
  down: "bg-down",
  flat: "bg-flat",
  stale: "bg-stale",
  expiring: "bg-expiring",
  primary: "bg-primary",
  destructive: "bg-destructive",
}

export const ALERT_TONE_TEXT: Record<AlertTone, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-flat",
  stale: "text-stale",
  expiring: "text-expiring",
  primary: "text-primary",
  destructive: "text-destructive",
}

let clockFormat: Intl.DateTimeFormat | null = null
const localTime = (ms: number) => (clockFormat ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })).format(ms)

const NEWEST_FIRST = { comparator: byNewest }

/** A newest-first view, disposed when its owner unmounts. Read its IDs with useRowIds. */
export function useAlertView(alerts: AlertStore): RowView<Alert> {
  return useView(alerts.store, NEWEST_FIRST)!
}

/** Time, severity, title, message, count. Spread them into your own list to add, drop, or reorder. */
export function alertColumns(options: { time?: (ms: number) => string; labels?: Partial<AlertHistoryLabels> } = {}): ColumnDef<Alert>[] {
  const time = options.time ?? localTime
  const labels = { ...DEFAULT_ALERT_HISTORY_LABELS, ...options.labels }
  return [
    { key: "at", header: labels.time, width: 80, sortable: true, flash: false, accessor: (a) => a.at, format: (v) => time(v as number) },
    // The word, in the tone: the tone is a hint on a word that is always there.
    { key: "severity", header: labels.severity, width: 88, sortable: true, flash: false, accessor: (a) => a.severity, cell: ({ row }) => <span className={cn("font-medium", row.tone && ALERT_TONE_TEXT[row.tone])}>{row.severity}</span> },
    { key: "title", header: labels.noticeTitle, width: 200, sortable: true, flash: false, accessor: (a) => a.title },
    { key: "message", header: labels.message, width: 280, flash: false, accessor: (a) => a.message ?? null },
    { key: "count", header: labels.count, width: 64, numeric: true, sortable: true, flash: false, accessor: (a) => a.count },
  ]
}

export interface AlertHistoryProps {
  alerts: AlertStore
  columns?: ColumnDef<Alert>[]
  preset?: DataGridPreset
  label?: string
  labels?: Partial<AlertHistoryLabels>
  renderContextMenu?: (rows: Alert[], ids: RowId[]) => ReactNode
  className?: string
}

/** The optional grid view. Put it in a panel, dialog, or sheet at the call site. */
export function AlertHistory({ alerts, columns, preset = "blotter", label, labels: labelsProp, renderContextMenu, className }: AlertHistoryProps) {
  const labels = { ...DEFAULT_ALERT_HISTORY_LABELS, ...labelsProp }
  const view = useAlertView(alerts)
  const cols = useMemo(() => columns ?? alertColumns({ labels: labelsProp }), [columns, labelsProp])
  return (
    <div data-slot="tradecn-alert-history" className={cn("h-full min-h-0 min-w-0", className)}>
      <DataGrid<Alert> store={alerts.store} view={view} columns={cols} preset={preset} label={label ?? labels.title} renderContextMenu={renderContextMenu} emptyState={labels.empty} />
    </div>
  )
}

/**
 * Forwards each new notice to whatever toast function you have (your shadcn `sonner`, or none): the
 * bridge imports no toast package. A notice folded into an existing one by its key is not a new notice
 * and is not forwarded; read the count on the row for that.
 */
export function useToastBridge(alerts: AlertStore, toast: ((alert: Alert) => void) | null | undefined): void {
  const latest = useRef(toast)
  useEffect(() => {
    latest.current = toast
  })
  useEffect(() => {
    const seen = new Set(alerts.store.getIds())
    return alerts.store.subscribeOrder(() => {
      const fresh: Alert[] = []
      for (const id of alerts.store.getIds()) {
        if (seen.has(id)) continue
        seen.add(id)
        const row = alerts.store.getRow(id)
        if (row) fresh.push(row)
      }
      for (const id of [...seen]) if (alerts.store.getRow(id) === undefined) seen.delete(id)
      if (!latest.current) return
      for (const alert of fresh.sort(byNewest).reverse()) latest.current(alert)
    })
  }, [alerts])
}
