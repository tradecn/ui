# Alerts

Compose notices and actions with caller-owned data, markup, and layout.

## Usage

```tsx
import { Alerts, AlertsList, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity } from "@/components/ui/alerts"

export default function AlertsDemo() {
  return (
    <Alerts className="w-lg max-w-full">
      <AlertsList>
        <AlertItem>
          <AlertHeader>
            <AlertSeverity>fill</AlertSeverity>
            <AlertTitle>Order filled</AlertTitle>
          </AlertHeader>
          <AlertBody>5mm UST at 99-16+</AlertBody>
        </AlertItem>
      </AlertsList>
    </Alerts>
  )
}
```

Compose a single notice directly in JSX. `Alerts` renders its children; it does not create notices, buttons, announcements, or a dialog.

## Composition

```text
Alerts
├── AlertsAnnouncer (optional store announcements)
├── AlertsList
│   └── AlertItem
│       ├── AlertHeader
│       │   ├── AlertSeverity
│       │   ├── AlertTitle
│       │   └── AlertDismiss
│       ├── AlertBody
│       └── AlertActions
│           └── AlertActionButton
└── AlertsEmpty (when your collection is empty)
```

Map your collection into `AlertItem` children. Place, omit, or reorder the other parts as needed. `AlertBody` supports rich content and wraps by default. Use an accessible link or button for interactive content, and pair tone with a severity word or another non-color cue.

<div id="a-store-not-a-toast-each"></div>

For a live store, use `useRowIds(useAlertView(alerts))` to read newest-first IDs, then map them into your own row component. Call `useAlert(alerts, id)` inside that row so a notice update rerenders its subscriber. The store coalesces repeated keys and enforces its cap; see [alert-store](alert-store.md).

## Local collection

Map local data into notice parts and supply your own dismiss handlers. Dismiss either notice, then choose **Restore notices** to replay. When the collection is empty, render `AlertsEmpty` in place of the list. No alert store is needed.

<!-- demo: alerts-collection -->

## Allowed actions and repeated notices

This layout moves severity after the title and puts actions below a multiline body. Each row subscribes through `useAlert`; repeating a notice updates its count even when its position stays the same. The action handlers record the request and dismiss the notice explicitly. Replace them with your application handlers.

Choose **Receive slow feed** or **Receive rejection** to restore or repeat a notice. `AlertActionButton` renders only when its action ID appears in `allowedActions`. One `AlertsAnnouncer` announces the first displayed notice, using the assertive region for critical notices.

<!-- demo: alerts-actions -->

## History in your own dialog

This example displays two notices and puts the full history in a caller-owned dialog. You decide the slice, history button, clear control, and history height. The button uses `DialogTrigger` and stays mounted so closing the dialog returns focus to it even if notices expire or are cleared. It reads "History" when nothing overflows. The history passes `announceRowCount="off"`, keeping the announcer the one announcement path while the dialog is open. Install shadcn's `dialog` component separately before copying this example. `AlertHistory` also works in an always-open panel with a height.

<!-- demo: alerts-history -->

## Forwarding new notices

`useToastBridge` forwards new IDs after subscribing. The seeded notice is skipped. Choose **Receive slow notice** once to forward it, then again to increase its repeat count without another callback. After **Clear all**, receiving it creates a new notice and forwards it again.

The readout is a polite live region that announces the callback count and last title. In an application, replace this callback with your toast adapter. Mount one announcement path for new notices; an adapter that already announces them can take that role.

<!-- demo: alerts-bridge -->

## API Reference

<div id="alerts-props"></div>

Previous call shapes and every removed prop are mapped in [Migrating to v2](migrating-v1-to-v2.md#alerts).

<div id="the-words-are-yours"></div>

### Presentation parts

All presentation parts accept their underlying element's props, including `children`, `className`, events, and `ref`. The styling classes are defaults you can extend at each part. None reads an alert store or chooses content.

| Part | Underlying element | Defaults and additional props |
|---|---|---|
| `Alerts` | `div` | `role="group"`; defaults to `aria-label="Notices"` unless `aria-labelledby` is supplied. Set either naming prop to name your collection. |
| `AlertsList` | `ul` | `role="list"`; supply `AlertItem` children. |
| `AlertItem` | `li` | Optional `tone: AlertTone`; sets `data-tone` and a colored start border. |
| `AlertHeader` | `div` | Wrapping header layout. |
| `AlertTitle` | `div` | Flexible, wrapping title. |
| `AlertBody` | `div` | Wrapping content; accepts block elements and links. |
| `AlertActions` | `div` | Wrapping controls. |
| `AlertsEmpty` | `p` | Muted text; visibility and content belong to you. |
| `AlertSeverity` | Your `Badge` | Optional `tone: AlertTone`; default `variant="outline"`; `data-alert-severity` marker. |
| `AlertDismiss` | Your `Button` | `type="button"`, `variant="ghost"`, `size="sm"`, and a × child. The default icon is named "Dismiss" unless `aria-labelledby` is supplied. Custom children provide their own name; explicit naming props take precedence. Supply `onClick` and a notice-specific name for icon buttons. |

Each piece has a `data-slot` matching its kebab-case name with the `tradecn-` prefix, such as `tradecn-alert-header`.

<div id="actions-are-the-server-s"></div>

### AlertActionButton

`AlertActionButton` accepts Button props, including children and a ref, except `onClick`. It renders only when `alert.allowedActions` contains `action`. Missing or empty permissions render nothing. It defaults to `type="button"`, `variant="outline"`, and `size="sm"`, with `data-alert-action` set to the action ID.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alert` | `Alert` | Required | Current notice, normally supplied by `useAlert`. |
| `action` | `string` | Required | ID checked against `allowedActions`. |
| `onAction` | `(alert: Alert) => void` | Required | Called with the rendered notice when clicked. |
| `children` | `ReactNode` | Unset | Button content, including its visible label. |
| Button props | `ComponentProps<typeof Button>` excluding `onClick` | See above | Styling, disabled state, accessible naming, and other native behavior. |

The button checks the supplied alert when it renders; it does not subscribe or re-read the store on click. Use the current row from `useAlert` for changing permissions. The callback does not dismiss the notice. Send requests and call `alerts.dismiss(id)` explicitly when appropriate. UI permissions do not replace server authorization.

<div id="dismissal"></div>

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

<div id="it-never-takes-focus"></div>

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

The history's view owns its order, so the grid renders without sort affordances, whatever the column definitions say. Under the default `blotter` preset the grid also announces its row count politely, about a second after the count stops changing, including on mount; folded repeats and arrivals into a full store leave the count unchanged and announce nothing. Pass `announceRowCount="off"` to silence it, and keep one announcement path when the history sits beside an `AlertsAnnouncer` or a toast adapter.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `alerts` | `AlertStore` | Required | Shared store. |
| `columns` | `ColumnDef<Alert>[]` | `alertColumns({ labels })` | Add, remove, reorder, or replace grid columns. |
| `preset` | `DataGridPreset` | `"blotter"` | Grid behavior and presentation. |
| `announceRowCount` | `"off" \| "debounced"` | Preset's setting | The embedded grid's row-count announcements. |
| `label` | `string` | `labels.title` | Accessible grid name. |
| `labels` | `Partial<AlertHistoryLabels>` | `DEFAULT_ALERT_HISTORY_LABELS` | Empty state, grid name, and default column labels. |
| `renderContextMenu` | `(rows: Alert[], ids: RowId[]) => ReactNode` | Unset | Caller-composed context menu. |
| `className` | `string` | Unset | History wrapper classes. |

Keep `labels` referentially stable: the default columns are rebuilt whenever it changes, and an inline object rebuilds them every render.

`alertColumns({ time?, labels? })` returns time, severity, title, message, and count columns, imported from `@/components/ui/alerts` with `Alert` and `AlertTone` coming from the installed `@/lib/alert-store`. `time` accepts `(ms: number) => string` and defaults to local 24-hour time with seconds. Pass labels explicitly when constructing custom columns. Its time, severity, title, and count columns are marked sortable for grids that build their own view: omit `view` and the grid orders rows from its `sort`. A supplied view owns its order and ignores `sort`, so derive the view you supply from your controlled sort state. `useAlertView`'s is fixed newest-first, and the history removes those affordances.

`useAlertView(alerts)` returns a `RowView<Alert>` and replaces it synchronously when the store changes. It owns the view's connection: cleanup stops feed work, and effect replay reconnects the same handle. Read it through `useRowIds` from the installed `use-row-store` hooks. Do not dispose it yourself; see [view ownership](row-store.md#views).

<div id="labels"></div>

Five v1 labels moved or fell away; [Migrating to v2](migrating-v1-to-v2.md#labels) maps each, and v1's `title` named the whole strip where the history's names its grid.

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

`AlertTone` accepts `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`. `ALERT_TONE_BAR` supplies background classes for custom bars or decoration; `ALERT_TONE_TEXT` supplies text classes. Item tone colors its start border; severity tone colors its text independently, so pass the tone to both when desired. Include a non-color cue in custom compositions. The install adds the five trading tokens and their soft variants if absent, along with the shared font tokens and the hyperlegible remap the grid columns use; `primary` and `destructive` come from your theme.
