# Migrating from v1 to v2

Use this guide to update v1 integrations for the v2 API. Component reference pages describe current usage and behavior.

## Alerts

In v2, `Alerts` is a container whose children you compose. Replace `<Alerts alerts={store} ... />` with `<Alerts>...</Alerts>` and compose its contents. The existing alert-store interface is unchanged.

| Previous interface | Replacement |
|---|---|
| `Alerts.alerts` | Read IDs with `useRowIds(useAlertView(store))`; subscribe to each notice with `useAlert(store, id)`. Plain arrays also work. |
| `visible` and implicit newest-first rendering | v1 displayed three notices by default. Use `useRowIds(useAlertView(store)).slice(0, 3)` to keep that limit and order; mapping every ID displays the whole store, up to its default 500-row cap. |
| `actions: AlertAction[]` | Compose `AlertActionButton` buttons with children, an `alert`, an `action` ID, and `onAction`. The old `AlertAction` data type is removed. No actions were rendered by default. |
| `ttlMs`, `now` | Pass them to `useAlert(store, id, options)` in the displayed row. Expiry remains off by default; `now` still defaults to `Date.now`. |
| `assertive` | Pass it to one `AlertsAnnouncer`, along with the store and selected ID. v1 announced the first displayed notice and defaulted to no assertive severities. `Alerts` creates no notice announcements; mount an announcer or supply an announcing toast adapter. |
| `time`, repeat-count formatting | v1 showed each notice's time, formatted locally as 24-hour hours, minutes, and seconds, plus `×{count}` above one. Render your own `time` and conditional count wherever needed; see below. |
| `labels` on the strip | Supply children and accessible names directly. |
| Automatic dismiss, clear-all, empty state, and overflow | Compose the controls and conditional content at the call site. `AlertDismiss` needs your handler. v1 named it `Dismiss: {title}`; preserve that with ``aria-label={`Dismiss: ${alert.title}`}``. The standalone icon defaults to "Dismiss". |
| `listColumns`, `listPreset`, implicit dialog | Pass `columns` and `preset` to `AlertHistory` in your own container. Install Dialog or Sheet separately when used. |
| `AlertList` / `AlertListProps` | Renamed to `AlertHistory` / `AlertHistoryProps`; `AlertsList` is the new children-based list. The unused grid `actions` prop is removed. |
| `AlertsLabels`, `DEFAULT_ALERTS_LABELS` | Replaced by `AlertHistoryLabels`, `DEFAULT_ALERT_HISTORY_LABELS` for the grid, with a different shape. Map the fields below; changing the type name alone is insufficient. |
| `data-slot="tradecn-alert-list"` | History uses `tradecn-alert-history`; the new list uses `tradecn-alerts-list`. |
| Generated `data-alert-*`, counts, and strip controls | Add application selectors at the call site. Public pieces carry their own `data-slot`; the action, severity, and announcer markers documented in the [Alerts reference](alerts.md) remain available. |

`Alerts` no longer accepts the old `AlertsProps` interface; its props are native `div` props. Messages and titles wrap instead of truncating by default. The tone decorates the item's start border instead of inserting an internal bar. The root still uses `data-slot="tradecn-alerts"`.

### Labels

The new history labels retain `empty`, `time`, `severity`, `message`, and `count`, with the same defaults: "No notices.", "Time", "Severity", "Message", and "Count". The new `noticeTitle` field defaults to "Title", which was hardcoded in v1. Map the remaining v1 labels explicitly:

| v1 label | v1 default | v2 destination |
|---|---|---|
| `title` | `Notices` | `Alerts` accessible name, still defaulting to "Notices". `AlertHistoryLabels.title` now names the grid (v1's `listTitle`). |
| `listTitle` | `All notices` | `AlertHistoryLabels.title` for the grid; supply your own dialog title separately. |
| `listDescription` | `Every notice, newest first.` | Your dialog description. Removed from history labels. |
| `dismiss` | `Dismiss` | Your dismiss button's visible text or accessible name, including the notice title when preserving v1 behavior. Removed from history labels. |
| `clearAll` | `Clear all` | Your clear button's children. Removed from history labels. |
| `more` | `{n} more` | Your overflow trigger's children. Removed from history labels. |
| `times` | `×` | Your repeat-count prefix. Removed from history labels. |

### Timestamps and counts

Keep the formatter at the call site. For the same timestamp and count display as v1, import `NUMERIC_CLASS` from the bundled format library and define the formatter once outside your row component:

```tsx
import { cn } from "cn"
import { NUMERIC_CLASS } from "@/lib/format"

const noticeTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
```

Inside the row, where `alert` comes from `useAlert(store, id)`, add these children to `AlertHeader`:

```tsx
<>
  {alert.count > 1 && <span className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)}>×{alert.count}</span>}
  <time dateTime={new Date(alert.at).toISOString()} className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)}>{noticeTime.format(alert.at)}</time>
</>
```

`NUMERIC_CLASS` selects `--tradecn-font-numeric` as well as lining and tabular figures, preserving the caller's numeric font choice. The history grid still supplies local 24-hour timestamps by default. Use `alertColumns({ time })` to override its formatter independently of the notice rows.

See [Alerts](alerts.md) for composition examples and the current API, and [alert-store](alert-store.md) for store behavior.
