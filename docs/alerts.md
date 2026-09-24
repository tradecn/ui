# Alerts

Show the newest notices with severity, repeat counts, allowed actions, and dismissal controls. The strip and full list share a capped store that folds notices with the same key into one row.

## Usage

```tsx
import { useState } from "react"
import { createAlertStore, type AlertStore } from "@/lib/alert-store"
import { Alerts } from "@/components/ui/alerts"

function restore(alerts: AlertStore) {
  alerts.clear()
  alerts.push({ severity: "info", tone: "up", title: "Feed connected" })
  alerts.push({ severity: "fill", tone: "primary", title: "Order filled", message: "5mm UST at 99-16+" })
}

function NoticeStrip() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    restore(store)
    return store
  })

  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => restore(alerts)}>Restore notices</button>
      </div>
      <Alerts alerts={alerts} className="w-lg max-w-full" />
    </>
  )
}
```

Keep the store stable and push notices from your feed. This example supplies two notices; dismiss either one or choose **Clear all**, then **Restore notices** to replay. Newer notices appear first. Severity is the word your application supplies; `tone` adds color.

The previews omit `ttlMs` so notices stay available to inspect. For automatic dismissal, see [Dismissal](#dismissal): timers apply only to mounted strip notices without allowed actions.

## Composition

| Use | Choose |
|---|---|
| A compact strip with dismissal and a full-list dialog | `Alerts` |
| A full list in your own panel | `AlertList` |
| Custom columns or your own view of the store | `alertColumns()` and `useAlertView(alerts)` |
| Toasts for new notices after subscribing | `useToastBridge(alerts, toast)` beside either component |

[`alert-store`](alert-store.md) is installed alongside the components. `AlertList` uses [`data-grid`](data-grid.md).

## Allowed actions and repeated notices

Choose **Receive slow feed** or **Receive rejection** to bring that notice to the front. Repeating its key updates the row and increments its count; both notices stay available for their actions.

The server's `allowedActions` selects the matching button. These handlers record the chosen action and explicitly dismiss its notice; replace that simulation with your service request. Critical rejections use the assertive live region, while warnings use the polite region.

<!-- demo: alerts-actions -->

## Forwarding new notices

`useToastBridge` forwards new IDs after it subscribes. The seeded notice is skipped. Choose **Receive slow notice** once to forward it, then again to grow its repeat count without another callback. After **Clear all**, receiving it again creates a new notice and forwards it.

The readout records the callback count and last title instead of opening a toast. Pass your own toast adapter in an application; the Alerts installation includes no toast package. The hook owns its subscription and unsubscribes on unmount.

<!-- demo: alerts-bridge -->

## API Reference

### Alerts props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Shared notice store. |
| `visible` | `number` | `3` | Number of newest notices shown in the strip; zero or negative hides them all. |
| `actions` | `AlertAction[]` | `[]` | Available strip actions, in display order. |
| `assertive` | `string[]` | `[]` | Severities announced through the assertive live region. |
| `ttlMs` | `number` | Off | Expiry delay in milliseconds for mounted notices without allowed actions. |
| `now` | `() => number` | `Date.now` | Clock used to calculate remaining TTL, in milliseconds since the epoch. |
| `time` | `(ms: number) => string` | Local 24-hour time with seconds | Formats strip timestamps; does not format the full list. |
| `listColumns` | `ColumnDef<Alert>[]` | `alertColumns({ labels })` | Columns in the dialog's list. |
| `listPreset` | `DataGridPreset` | `"blotter"` | Grid preset for the dialog's list. |
| `labels` | `Partial<AlertsLabels>` | `DEFAULT_ALERTS_LABELS` | Overrides the labels below. |
| `className` | `string` | Unset | Classes on the strip's outer wrapper. |

### A store, not a toast each

`createAlertStore()` uses the row store's ordered lane. A repeated `key` updates the existing row and grows its `count`. The cap defaults to 500 rows, evicting the oldest notices without allowed actions before those with actions. The strip, list, custom views, and toast bridge read the same store. See [`alert-store`](alert-store.md) for notice fields and store methods.

### The words are yours

`severity` is your string, printed unchanged: `info`, `warning`, `critical`, `fill`, or another word. Optional `tone` colors the strip's edge bar and severity text; the word carries the meaning. `title` and `message` use the supplied text, truncated in the strip with the full text in a title attribute. Counts above one appear as `×3`, using `labels.times` as the prefix.

### Actions are the server's

The strip offers only actions whose `id` appears in the notice's `allowedActions`, in the order of the `actions` prop. Missing or empty `allowedActions` offers none. The handler receives the current notice; sending requests or dismissing it is your responsibility.

All `AlertAction` fields are required:

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Matches an entry in `allowedActions`. |
| `label` | `string` | Button text. |
| `onAction` | `(alert: Alert) => void` | Runs when the button is clicked. |

### It never takes focus

Receiving a notice does not request focus or open the dialog. Two visually hidden live regions announce the newest displayed notice: `role="alert"` with `aria-live="assertive"` when its severity is in `assertive`, otherwise `role="status"` with `aria-live="polite"`. Only one region contains the announcement. It includes severity, title, message when present, and count above one; a repeat updates that count. This is the newest displayed row, not a queue of every arrival.

### Dismissal

Each strip notice has a dismiss button calling `alerts.dismiss(id)`. `Clear all` calls `alerts.clear()` and appears while the store has rows. Your hotkeys can call the same methods.

TTL timers exist only while a notice is mounted in the strip. They wait `max(0, alert.at + ttlMs - now())` milliseconds, so an already expired notice is scheduled for immediate dismissal when shown. Hidden notices and rows displayed only in `AlertList` have no timer. A repeat with a new `at` reschedules the timer. Use the same clock basis for the store's timestamps and `Alerts.now`.

Any nonempty `allowedActions` disables TTL, even when no supplied action matches. Omitting `ttlMs` disables timers; store-cap eviction can still remove notices.

### The whole list

When the store has more rows than the strip shows, `{n} more` opens `AlertList` in the installed `Dialog`. The list uses a newest-first view, ordered by `at` then `seq`. The default `blotter` preset adjusts scroll position when arrivals above the first visible row would move it. For an always-open panel, render `AlertList` inside a container with a height.

| `AlertList` prop | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Shared notice store. |
| `columns` | `ColumnDef<Alert>[]` | `alertColumns({ labels })` | Grid columns. |
| `preset` | `DataGridPreset` | `"blotter"` | Grid behavior and appearance; see [`data-grid`](data-grid.md). |
| `actions` | `AlertAction[]` | Unused | Accepted by the interface but not read or rendered. |
| `label` | `string` | `labels.listTitle` | Accessible grid name. |
| `labels` | `Partial<AlertsLabels>` | `DEFAULT_ALERTS_LABELS` | Grid name, empty state, and default column labels. |
| `renderContextMenu` | `(rows: Alert[], ids: RowId[]) => ReactNode` | Unset | Custom grid context-menu content. |
| `className` | `string` | Unset | Classes on the list's outer wrapper. |

The default columns are time, severity, title, message, and count. They contain no action or dismiss controls. Customize them with these helpers:

| Helper | Inputs | Returns |
|---|---|---|
| `alertColumns(options?)` | Optional `time: (ms: number) => string` and `labels: Partial<AlertsLabels>` | `ColumnDef<Alert>[]` to add to, remove from, or reorder. Defaults to local 24-hour time with seconds and `DEFAULT_ALERTS_LABELS`. |
| `useAlertView(alerts)` | Required `AlertStore` | `RowView<Alert>` sorted newest first; recreated when the store instance changes and disposed on cleanup. |

To change the dialog's time format, pass `listColumns={alertColumns({ time: formatTime })}`. The strip's `time` prop does not reach these columns. When supplying custom columns, pass their labels to `alertColumns` yourself.

### The toast bridge

`useToastBridge(alerts, toast)` returns `void` and imports no toast package. Pass your shadcn `sonner` adapter or another callback.

| Argument | Type | Purpose |
|---|---|---|
| `alerts` | `AlertStore` | Required store to subscribe to. |
| `toast` | `((alert: Alert) => void) \| null \| undefined` | Callback for newly observed IDs, or no callback. |

IDs already present when the effect subscribes are skipped. On each order notification, unseen IDs are forwarded oldest first by `at` then `seq`; folding a repeat into an existing row does not toast again. Removed IDs are forgotten, so a later notice reusing one can toast again. A null or undefined callback still marks new IDs as seen: enabling it later does not replay them. Changing stores starts a new subscription; unmounting unsubscribes.

### Labels

Pass `labels` to override strings in `DEFAULT_ALERTS_LABELS`:

| Label | Default | Used for |
|---|---|---|
| `title` | `Notices` | Strip's accessible group name. |
| `listTitle` | `All notices` | Dialog title and default grid name. |
| `listDescription` | `Every notice, newest first.` | Dialog description. |
| `dismiss` | `Dismiss` | Dismiss button's accessible name, followed by `: ` and the notice title. |
| `clearAll` | `Clear all` | Clear button. |
| `more` | `{n} more` | More button; the first `{n}` is replaced with the locale-formatted hidden count. |
| `times` | `×` | Prefix before repeat counts. |
| `empty` | `No notices.` | Empty strip and grid. |
| `time` | `Time` | Time column header. |
| `severity` | `Severity` | Severity column header. |
| `message` | `Message` | Message column header. |
| `count` | `Count` | Count column header. |

The title column header is hardcoded as `Title`; `labels.title` does not change it. Supply custom columns to rename it.

### Tokens

`AlertTone` accepts `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`. The exported `ALERT_TONE_BAR` and `ALERT_TONE_TEXT` maps provide the corresponding background and text classes. Without a tone, the strip uses a border-colored bar and uncolored severity text. The install adds the five trading tokens and their soft variants if absent; `primary` and `destructive` use your theme's tokens.
