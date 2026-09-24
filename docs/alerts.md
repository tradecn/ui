# Alerts

Compose notices from a container, list, header, body, and actions. You own the data and markup; optional hooks connect notices to the shared alert store without prescribing their layout.

## Usage

```tsx
import { useState } from "react"
import { Alerts, AlertsList, AlertsEmpty, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertDismiss } from "@/components/ui/alerts"

const initial = [
  { id: "fill", severity: "fill", title: "Order filled", message: "5mm UST at 99-16+" },
  { id: "feed", severity: "info", title: "Feed connected", message: "Market data is available." },
]

function Notices() {
  const [notices, setNotices] = useState(initial)
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setNotices(initial)}>Restore notices</button>
      </div>
      <Alerts className="w-lg max-w-full">
        <AlertsList>
          {notices.map((notice) => (
            <AlertItem key={notice.id}>
              <AlertHeader>
                <AlertSeverity>{notice.severity}</AlertSeverity>
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDismiss aria-label={`Dismiss: ${notice.title}`} onClick={() => setNotices((rows) => rows.filter((row) => row.id !== notice.id))} />
              </AlertHeader>
              <AlertBody>{notice.message}</AlertBody>
            </AlertItem>
          ))}
        </AlertsList>
        {notices.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
      </Alerts>
    </>
  )
}
```

This example uses local state. Dismiss either notice, then choose **Restore notices** to replay. `Alerts` renders its children; it does not create notices, buttons, announcements, or a dialog.

## Composition

| Part | Purpose |
|---|---|
| `Alerts` | The outer group. |
| `AlertsList` | A semantic list whose children you supply. |
| `AlertItem` | One notice, with optional tone decoration. |
| `AlertHeader`, `AlertTitle` | Header layout and title content. |
| `AlertBody` | Text, links, or other application content. |
| `AlertSeverity` | Your severity word, optionally colored by tone. |
| `AlertActions` | Layout for your controls. |
| `AlertAction` | A button gated by an alert's `allowedActions`. |
| `AlertDismiss` | A button whose click handler you supply. |
| `AlertsEmpty` | Empty-state content, rendered when you choose. |
| `AlertsAnnouncer` | Live regions for one selected store notice. |
| `AlertHistory` | An optional grid for your panel, dialog, or sheet. |

Map your collection into `AlertItem` children. Place, omit, or reorder the other parts as needed. `AlertBody` supports rich content and wraps by default. Use an accessible link or button for interactive content, and pair tone with a severity word or another non-color cue.

For a live store, use `useRowIds(useAlertView(alerts))` to read newest-first IDs, then map them into your own row component. Call `useAlert(alerts, id)` inside that row so a notice update rerenders its subscriber. The store still coalesces repeated keys and enforces its cap; see [alert-store](alert-store.md).

## Allowed actions and repeated notices

This layout moves severity after the title and puts actions below a multiline body. Each row subscribes through `useAlert`; repeating a notice updates its count even when its position stays the same. The action handlers record the request and dismiss the notice explicitly. Replace them with your application handlers.

Choose **Receive slow feed** or **Receive rejection** to restore or repeat a notice. `AlertAction` renders only when its action ID appears in `allowedActions`. One `AlertsAnnouncer` announces the first displayed notice, using the assertive region for critical notices.

<!-- demo: alerts-actions -->

## History in your own dialog

This example displays two notices and places the rest in a caller-owned dialog. You decide the slice, overflow button, clear control, and history height. The overflow button uses `DialogTrigger` so closing the dialog returns focus to it. Install shadcn's `dialog` component separately before copying this example; it is no longer part of the Alerts installation. `AlertHistory` also works in an always-open panel with a height.

<!-- demo: alerts-history -->

## Forwarding new notices

`useToastBridge` forwards new IDs after subscribing. The seeded notice is skipped. Choose **Receive slow notice** once to forward it, then again to increase its repeat count without another callback. After **Clear all**, receiving it creates a new notice and forwards it again.

The readout records the callback count and last title. Supply your own toast adapter in an application. This example uses that adapter's feedback instead of mounting a second announcement path.

<!-- demo: alerts-bridge -->

## API Reference

### Migrating from the assembled strip

This is a breaking interface change. Replace `<Alerts alerts={store} ... />` with `<Alerts>...</Alerts>` and compose its contents. The existing alert-store interface is unchanged.

| Previous interface | Replacement |
|---|---|
| `Alerts.alerts` | Read IDs with `useRowIds(useAlertView(store))`; subscribe to each notice with `useAlert(store, id)`. Plain arrays also work. |
| `visible` and implicit newest-first rendering | Slice or order the IDs at the call site, then map them into your row component. |
| `actions: AlertAction[]` | Compose `AlertAction` buttons with children, an `alert`, an `action` ID, and `onAction`. The old `AlertAction` data type is removed. |
| `ttlMs`, `now` | Pass them to `useAlert(store, id, options)` in the displayed row. |
| `assertive` | Pass it to one `AlertsAnnouncer`, along with the store and selected ID. |
| `time`, repeat-count formatting | Render your own `time` or `span` wherever needed. Apply lining and tabular figures to numeric text. |
| `labels` on the strip | Supply children and accessible names directly. |
| Automatic dismiss, clear-all, empty state, and overflow | Compose the controls and conditional content at the call site. `AlertDismiss` needs your handler. |
| `listColumns`, `listPreset`, implicit dialog | Pass `columns` and `preset` to `AlertHistory` in your own container. Install Dialog or Sheet separately when used. |
| `AlertList` / `AlertListProps` | Renamed to `AlertHistory` / `AlertHistoryProps`; `AlertsList` is the new children-based list. The unused grid `actions` prop is removed. |
| `AlertsLabels`, `DEFAULT_ALERTS_LABELS` | Replaced by `AlertHistoryLabels`, `DEFAULT_ALERT_HISTORY_LABELS` for the grid. Its `title` names the grid and `noticeTitle` names the title column. Other strip/dialog labels become your content. |
| `data-slot="tradecn-alert-list"` | History uses `tradecn-alert-history`; the new list uses `tradecn-alerts-list`. |
| Generated `data-alert-*`, counts, and strip controls | Add application selectors at the call site. Public pieces carry their own `data-slot`; the action, severity, and announcer markers listed below remain available. |

`Alerts` no longer accepts the old `AlertsProps` interface; its props are native `div` props. Messages and titles wrap instead of truncating by default. The tone decorates the item's start border instead of inserting an internal bar. The root still uses `data-slot="tradecn-alerts"`.

### Presentation parts

All presentation parts accept their underlying element's props, including `children`, `className`, events, and `ref`. The styling classes are defaults you can extend at each part. None reads an alert store or chooses content.

| Part | Underlying element | Defaults and additional props |
|---|---|---|
| `Alerts` | `div` | `role="group"`, `aria-label="Notices"`; override to name your collection. |
| `AlertsList` | `ul` | `role="list"`; supply `AlertItem` children. |
| `AlertItem` | `li` | Optional `tone: AlertTone`; sets `data-tone` and a colored start border. |
| `AlertHeader` | `div` | Wrapping header layout. |
| `AlertTitle` | `div` | Flexible, wrapping title. |
| `AlertBody` | `div` | Wrapping content; accepts block elements and links. |
| `AlertActions` | `div` | Wrapping controls. |
| `AlertsEmpty` | `p` | Muted text; visibility and content belong to you. |
| `AlertSeverity` | Your `Badge` | Optional `tone: AlertTone`; default `variant="outline"`; `data-alert-severity` marker. |
| `AlertDismiss` | Your `Button` | `type="button"`, `variant="ghost"`, `size="sm"`, `aria-label="Dismiss"`, and a × child. Supply `onClick`; set a notice-specific accessible name. |

Each piece has a `data-slot` matching its kebab-case name with the `tradecn-` prefix, such as `tradecn-alert-header`.

### AlertAction

`AlertAction` accepts Button props, including children and a ref, except `onClick`. It renders only when `alert.allowedActions` contains `action`. Missing or empty permissions render nothing. It defaults to `type="button"`, `variant="outline"`, and `size="sm"`, with `data-alert-action` set to the action ID.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alert` | `Alert` | Required | Current notice, normally supplied by `useAlert`. |
| `action` | `string` | Required | ID checked against `allowedActions`. |
| `onAction` | `(alert: Alert) => void` | Required | Called with the rendered notice when clicked. |
| `children` | `ReactNode` | Unset | Button content, including its visible label. |
| Button props | `ComponentProps<typeof Button>` excluding `onClick` | See above | Styling, disabled state, accessible naming, and other native behavior. |

The callback does not dismiss the notice. Send requests and call `alerts.dismiss(id)` explicitly when appropriate. UI permissions do not replace server authorization.

### useAlert

`useAlert(alerts, id, options?)` returns the current `Alert`, or `undefined` when the ID is absent. The row subscribes to that ID; switching the store or ID replaces its subscription.

| Input | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Store to subscribe to. |
| `id` | `RowId` | Required | Notice ID. |
| `options.ttlMs` | `number` | Off | Automatic dismissal while this hook is mounted. |
| `options.now` | `() => number` | `Date.now` | Clock in milliseconds since the epoch, on the same basis as the store. |

Expiry waits `max(0, alert.at + ttlMs - now())` milliseconds. A repeat with a new `at` reschedules it. Any nonempty `allowedActions` disables expiry, including action IDs for which you render no button. Removing those permissions enables the remaining timer, or schedules immediate dismissal if already overdue. Unmounting, changing stores or IDs, or disabling TTL cancels the old timer.

Timers belong to the hook invocation. Put TTL on the displayed notice row only. Hidden notices and history-only rows have no timer unless your application mounts another expiry-enabled hook for them. When displaying one notice in several places, choose one owner for automatic dismissal; omit TTL from the other subscriptions.

### AlertsAnnouncer

Mount one announcer for the collection. It keeps two visually hidden regions: polite `role="status"` and assertive `role="alert"`. Only one contains the selected notice's announcement, including severity, title, optional message, and repeat count above one. It does not take focus or open UI.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Store to subscribe to. |
| `id` | `RowId \| null` | Required | Notice to announce; usually the first displayed ID. Null leaves both regions empty. |
| `assertive` | `readonly string[]` | `[]` | Severities announced assertively. |

The announcer follows the selected row, including repeats; it is not a queue of every arrival. Its region markers are `data-alerts-polite` and `data-alerts-assertive`. Avoid duplicate announcements when a toast adapter already announces the same notices.

### The whole list

`AlertHistory` is an optional DataGrid presentation, ordered newest first by `at`, then `seq`. Give its container a height. It does not supply action or dismiss controls, create a dialog, or start TTL timers. Its default `blotter` preset adjusts scroll position when notices arrive above the first visible row.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Shared store. |
| `columns` | `ColumnDef<Alert>[]` | `alertColumns({ labels })` | Add, remove, reorder, or replace grid columns. |
| `preset` | `DataGridPreset` | `"blotter"` | Grid behavior and presentation. |
| `label` | `string` | `labels.title` | Accessible grid name. |
| `labels` | `Partial<AlertHistoryLabels>` | `DEFAULT_ALERT_HISTORY_LABELS` | Empty state, grid name, and default column labels. |
| `renderContextMenu` | `(rows: Alert[], ids: RowId[]) => ReactNode` | Unset | Caller-composed context menu. |
| `className` | `string` | Unset | History wrapper classes. |

`alertColumns({ time?, labels? })` returns time, severity, title, message, and count columns. `time` accepts `(ms: number) => string` and defaults to local 24-hour time with seconds. Pass labels explicitly when constructing custom columns. `useAlertView(alerts)` returns a `RowView<Alert>`, recreates it when the store changes, and disposes it on cleanup. Read it through `useRowIds` from the installed `use-row-store` hooks.

| History label | Default |
|---|---|
| `title` | `All notices` |
| `empty` | `No notices.` |
| `time` | `Time` |
| `severity` | `Severity` |
| `noticeTitle` | `Title` |
| `message` | `Message` |
| `count` | `Count` |

### The toast bridge

`useToastBridge(alerts, toast)` returns `void` and imports no toast package. Pass your own toast adapter.

| Argument | Type | Purpose |
|---|---|---|
| `alerts` | `AlertStore` | Required store. |
| `toast` | `((alert: Alert) => void) \| null \| undefined` | Callback for newly observed IDs, or no callback. |

Existing IDs are skipped on subscription. Newly observed IDs are forwarded oldest first within a batch; a repeat folded into an existing ID does not toast again. Removed IDs are forgotten, so a later reused ID can toast. A null or undefined callback still marks IDs seen; enabling it later does not replay them. Changing stores starts a new subscription, and unmounting unsubscribes.

### Tokens

`AlertTone` accepts `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`. `ALERT_TONE_BAR` and `ALERT_TONE_TEXT` remain exported for custom decoration. Item tone colors its start border; severity tone colors its text independently, so pass the tone to both when desired. Include a non-color cue in custom compositions. The install adds the five trading tokens and their soft variants if absent; `primary` and `destructive` come from your theme.
