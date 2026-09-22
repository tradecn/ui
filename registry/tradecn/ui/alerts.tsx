import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRow, useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { byNewest, type Alert, type AlertStore, type AlertTone } from "@/registry/tradecn/lib/alert-store"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore, RowView } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type DataGridPreset } from "@/registry/tradecn/ui/data-grid"

// The strip of notices: the newest few, each with the severity as the consumer's word and the tone
// as a bar beside it, the count when one stands for many, the actions the server allowed, a dismiss,
// a clear-all, and "N more" that opens the whole list in a grid. It never takes focus. Screen readers
// hear a new notice politely, and at once only for a severity the consumer names. A notice with an
// action never dismisses itself; one without may, after a `ttlMs` the consumer sets.

export interface AlertsLabels {
  /** The region's name. */
  title: string
  listTitle: string
  listDescription: string
  dismiss: string
  clearAll: string
  /** `{n}` is the count. */
  more: string
  /** Before a count above one: "×3". */
  times: string
  empty: string
  time: string
  severity: string
  message: string
  count: string
}

export const DEFAULT_ALERTS_LABELS: AlertsLabels = {
  title: "Notices",
  listTitle: "All notices",
  listDescription: "Every notice, newest first.",
  dismiss: "Dismiss",
  clearAll: "Clear all",
  more: "{n} more",
  times: "×",
  empty: "No notices.",
  time: "Time",
  severity: "Severity",
  message: "Message",
  count: "Count",
}

export interface AlertAction {
  /** Matched against a notice's `allowedActions`. */
  id: string
  label: string
  onAction: (alert: Alert) => void
}

/** The tone as a bar and as the severity's text. The severity word is always printed; the color is the hint. */
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

function fill(template: string, n: number): string {
  return template.replace("{n}", n.toLocaleString())
}

/** A view of the store newest first, remade when the store changes and disposed after. */
export function useAlertView(alerts: AlertStore): RowView<Alert> {
  const view = useMemo(() => alerts.store.createView({ comparator: byNewest }), [alerts])
  useEffect(() => () => view.dispose(), [view])
  return view
}

/** Time, severity, title, message, count. Spread them into your own list to add, drop, or reorder. */
export function alertColumns(options: { time?: (ms: number) => string; labels?: Partial<AlertsLabels> } = {}): ColumnDef<Alert>[] {
  const time = options.time ?? localTime
  const labels = { ...DEFAULT_ALERTS_LABELS, ...options.labels }
  return [
    { key: "at", header: labels.time, width: 80, sortable: true, flash: false, accessor: (a) => a.at, format: (v) => time(v as number) },
    // The word, in the tone: the tone is a hint on a word that is always there.
    { key: "severity", header: labels.severity, width: 88, sortable: true, flash: false, accessor: (a) => a.severity, cell: ({ row }) => <span className={cn("font-medium", row.tone && ALERT_TONE_TEXT[row.tone])}>{row.severity}</span> },
    { key: "title", header: "Title", width: 200, sortable: true, flash: false, accessor: (a) => a.title },
    { key: "message", header: labels.message, width: 280, flash: false, accessor: (a) => a.message ?? null },
    { key: "count", header: labels.count, width: 64, numeric: true, sortable: true, flash: false, accessor: (a) => a.count },
  ]
}

export interface AlertListProps {
  alerts: AlertStore
  columns?: ColumnDef<Alert>[]
  /** The grid's preset. `blotter` by default: newest first, the viewport pinned while notices arrive above it. */
  preset?: DataGridPreset
  actions?: AlertAction[]
  label?: string
  labels?: Partial<AlertsLabels>
  renderContextMenu?: (rows: Alert[], ids: RowId[]) => ReactNode
  className?: string
}

/** The whole list in the data grid, newest first, for the dialog or a panel of your own. */
export function AlertList({ alerts, columns, preset = "blotter", label, labels: labelsProp, renderContextMenu, className }: AlertListProps) {
  const labels = { ...DEFAULT_ALERTS_LABELS, ...labelsProp }
  const view = useAlertView(alerts)
  // The consumer's partial keeps its identity; the merged object would not, and the columns would be remade every render.
  const cols = useMemo(() => columns ?? alertColumns({ labels: labelsProp }), [columns, labelsProp])
  return (
    <div data-slot="tradecn-alert-list" className={cn("h-full min-h-0", className)}>
      <DataGrid<Alert> store={alerts.store} view={view} columns={cols} preset={preset} label={label ?? labels.listTitle} renderContextMenu={renderContextMenu} emptyState={labels.empty} />
    </div>
  )
}

export interface AlertsProps {
  alerts: AlertStore
  /** How many of the newest show in the strip. Default 3. */
  visible?: number
  /** Offered on a notice whose `allowedActions` names the id, in this order, with these labels. */
  actions?: AlertAction[]
  /** Severities a screen reader hears at once. Every other notice is announced politely. */
  assertive?: string[]
  /** Dismiss a notice with no action this long after it arrived. Off when left out. A notice with an action never dismisses itself. */
  ttlMs?: number
  /** For the ttl and the times. Defaults to Date.now. */
  now?: () => number
  time?: (ms: number) => string
  /** Columns for the full list. */
  listColumns?: ColumnDef<Alert>[]
  listPreset?: DataGridPreset
  labels?: Partial<AlertsLabels>
  className?: string
}

interface NoticeProps {
  store: RowStore<Alert>
  id: RowId
  actions: AlertAction[]
  time: (ms: number) => string
  labels: AlertsLabels
  ttlMs?: number
  now: () => number
  onDismiss: (id: RowId) => void
}

// One notice subscribes to its own row, so a repeat folded into the row at the top of the strip, which
// moves nothing in the order, still shows its new count. The ttl lives here too, from the row's own
// `at`, so a repeat starts the clock again and a notice with an action never sets one.
function Notice({ store, id, actions, time, labels, ttlMs, now, onDismiss }: NoticeProps) {
  const alert = useRow(store, id)
  const latest = useRef({ onDismiss, now })
  useEffect(() => {
    latest.current = { onDismiss, now }
  })
  const at = alert?.at
  const actionable = Boolean(alert?.allowedActions?.length)
  useEffect(() => {
    if (ttlMs === undefined || at === undefined || actionable) return
    const timer = setTimeout(() => latest.current.onDismiss(id), Math.max(0, at + ttlMs - latest.current.now()))
    return () => clearTimeout(timer)
  }, [id, at, actionable, ttlMs])
  if (!alert) return null
  const allowed = new Set(alert.allowedActions ?? [])
  const offered = actions.filter((action) => allowed.has(action.id))
  return (
    <li data-alert-id={alert.id} data-severity={alert.severity} data-tone={alert.tone} data-count={alert.count} className="flex items-stretch gap-2 rounded-sm border border-border/60 bg-card px-2 py-1">
      <span aria-hidden data-alert-bar className={cn("w-0.5 shrink-0 rounded-sm", alert.tone ? ALERT_TONE_BAR[alert.tone] : "bg-border")} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <Badge variant="outline" className={cn("h-4 shrink-0 px-1.5 text-xs", alert.tone && ALERT_TONE_TEXT[alert.tone])} data-alert-severity>
            {alert.severity}
          </Badge>
          <span className="min-w-0 flex-1 truncate font-medium" title={alert.title}>
            {alert.title}
          </span>
          {alert.count > 1 && (
            <span className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)} data-alert-count={alert.count} title={`${alert.count}`}>
              {labels.times}
              {alert.count}
            </span>
          )}
          <span className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)} data-alert-time>
            {time(alert.at)}
          </span>
        </div>
        {alert.message && <p className="truncate text-muted-foreground" title={alert.message}>{alert.message}</p>}
        {offered.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offered.map((action) => (
              <Button key={action.id} type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" data-alert-action={action.id} onClick={() => action.onAction(alert)}>
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 self-start px-1.5 text-xs" aria-label={`${labels.dismiss}: ${alert.title}`} onClick={() => onDismiss(id)}>
        <span aria-hidden>×</span>
      </Button>
    </li>
  )
}

export function Alerts({ alerts, visible = 3, actions, assertive, ttlMs, now, time, listColumns, listPreset, labels: labelsProp, className }: AlertsProps) {
  const labels = { ...DEFAULT_ALERTS_LABELS, ...labelsProp }
  const view = useAlertView(alerts)
  const ids = useRowIds(view)
  const shown = ids.slice(0, Math.max(0, visible))
  const more = Math.max(0, ids.length - shown.length)
  const [open, setOpen] = useState(false)
  const actionList = actions ?? []
  const printTime = time ?? localTime
  const clock = now ?? Date.now
  const dismiss = useCallback((id: RowId) => alerts.dismiss(id), [alerts])

  // What a screen reader hears: the newest notice, politely, and at once for a severity the consumer
  // names. Two regions, both visually hidden, so the strip itself never has to be a live region. The
  // newest row is subscribed to, so a repeat folded into it is announced with its count.
  const newest = useRow(alerts.store, shown[0] ?? "")
  const assertiveSet = useMemo(() => new Set(assertive ?? []), [assertive])
  const announcement = newest ? `${newest.severity}: ${newest.title}${newest.message ? `. ${newest.message}` : ""}${newest.count > 1 ? ` (${newest.count})` : ""}` : ""
  const urgent = newest !== undefined && assertiveSet.has(newest.severity)

  return (
    <div data-slot="tradecn-alerts" data-count={ids.length} data-shown={shown.length} className={cn("flex flex-col gap-1 text-xs lining-nums tabular-nums", className)} aria-label={labels.title} role="group">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-alerts-polite>
        {urgent ? "" : announcement}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" data-alerts-assertive>
        {urgent ? announcement : ""}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground" data-alerts-empty>
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((id) => (
            <Notice key={id} store={alerts.store} id={id} actions={actionList} time={printTime} labels={labels} ttlMs={ttlMs} now={clock} onDismiss={dismiss} />
          ))}
        </ul>
      )}
      {(more > 0 || ids.length > 0) && (
        <div className="flex items-center gap-2">
          {more > 0 && (
            <Button type="button" variant="ghost" size="sm" className={cn("h-6 px-1.5 text-xs", NUMERIC_CLASS)} data-alerts-more={more} onClick={() => setOpen(true)}>
              {fill(labels.more, more)}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-1.5 text-xs" onClick={() => alerts.clear()}>
            {labels.clearAll}
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{labels.listTitle}</DialogTitle>
            <DialogDescription>{labels.listDescription}</DialogDescription>
          </DialogHeader>
          <div className="h-80">
            <AlertList alerts={alerts} columns={listColumns} preset={listPreset} actions={actionList} labels={labels} />
          </div>
        </DialogContent>
      </Dialog>
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
