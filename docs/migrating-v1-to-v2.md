# Migrating from v1 to v2

Use this guide to update v1 integrations for the v2 API. Component reference pages describe current usage and behavior.

## Alerts

In v2, `Alerts` is a container whose children you compose. Replace `<Alerts alerts={store} ... />` with `<Alerts>...</Alerts>` and compose its contents. The existing alert-store interface is unchanged.

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
| Generated `data-alert-*`, counts, and strip controls | Add application selectors at the call site. Public pieces carry their own `data-slot`; the action, severity, and announcer markers documented in the [Alerts reference](alerts.md) remain available. |

`Alerts` no longer accepts the old `AlertsProps` interface; its props are native `div` props. Messages and titles wrap instead of truncating by default. The tone decorates the item's start border instead of inserting an internal bar. The root still uses `data-slot="tradecn-alerts"`.

See [Alerts](alerts.md) for composition examples and the current API, and [alert-store](alert-store.md) for store behavior.
