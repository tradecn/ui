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

## FeedHealth

FeedHealth keeps the required `feeds` collection prop and now requires caller-owned children. Render public items through `FeedHealthList`, compose their readings, and mount one announcer per collection. The [current reference](feed-health.md) includes complete menu and card recipes.

| Previous interface | Current interface |
|---|---|
| `<FeedHealth feeds={feeds} />` | `<FeedHealth feeds={feeds}><FeedHealthList>{(feed) => <FeedHealthItem feed={feed}>…</FeedHealthItem>}</FeedHealthList><FeedHealthAnnouncer /></FeedHealth>`. The list keys each row by `feed.id`. |
| Automatic label, dot, badge, age and lane report | Caller label plus `FeedHealthIndicator`, `FeedHealthTier`, `FeedAge` and `FeedHealthLane`. |
| Automatic tooltip | Caller `Tooltip` containing `FeedHealthTooltipTrigger` and `FeedHealthTooltipContent`; place `FeedHealthDetails` in the content or write your own. |
| Empty collection | Pass `feeds={[]}` and optionally compose `<FeedHealthEmpty>No feeds configured.</FeedHealthEmpty>` beside the list. The caller supplies the content. |
| Automatic separators and order | The `FeedHealthList` callback receives `(feed, index)` in collection order. Add `Separator` where needed; install `separator` for that layout. |
| `compact` | Apply `className="sr-only"` to `FeedHealthTier` to preserve its accessible word. |
| Root `actions` and `pendingMs` | `useFeedActions(feed, actions, { pendingMs })` in the caller's row component. The timeout still defaults to `5000` ms. Map returned actions into a menu or buttons and call `run(action.id)`. |
| Automatic menu and pending marker | Caller controls, `pending` passed to the item, and `<FeedHealthPending>{pendingLabel}</FeedHealthPending>` wherever needed. Install `dropdown-menu` or `button` for those controls. |
| `labels`, `FeedHealthLabels`, `DEFAULT_FEED_HEALTH_LABELS` | Removed. Supply your menu's accessible name and pending metadata label directly in JSX. |
| Trigger `data-feed`, `data-state`, `data-tier`, `data-pending` | These attributes now live on the `FeedHealthItem` div. Replace selectors such as `button[data-feed]` with `[data-feed]` for the item, or `[data-feed] [data-slot="tooltip-trigger"]` for its reading button. |
| Automatic `data-feed-actions` and `data-feed-action` | Caller-owned attributes. Add them to your menu trigger and action controls when your selectors use them; the menu recipe shows both. |
| `FeedAction.destructive` styling | The hook preserves this metadata; apply `text-destructive` or your control's destructive variant yourself. |
| Automatic tier announcements | Explicit `FeedHealthAnnouncer` inherits `feeds` from the root; mount once even when rendering multiple lists of the same feeds. Pass `feeds` explicitly for a standalone announcer. |
| `thresholds`, `session`, `clock` | Remain on the group; items inherit them, and a standalone announcer accepts them explicitly. A hook outside the group needs its custom clock explicitly. |

The former action-button name default was `"Actions: {feed}"`; the pending tooltip heading was `"Pending"`. Preserve or translate those strings in your caller JSX.

`FeedDescriptor`, `FeedAction`, `PendingFeedAction`, tier helpers, thresholds, session types and clock exports remain available. `FeedAge` retains its required `feed` and optional `clock`; it now forwards native span props and refs and inherits the nearest group's clock when present.

Keep feed ids unique and stable; `FeedHealthList` supplies their React keys. Direct item JSX remains available for a single-feed layout; its root still needs `feeds={[feed]}` so the announcer receives the collection. Move collection limits, empty-state content and application navigation into the caller. Preserve the original action guarantees in your controls: filter by the hook's returned actions, mark controls disabled while pending (`aria-disabled` preserves inline-button focus), show its pending label and report request failures yourself. For menus, use `useFeedActionMenu({ hasActions, fallbackRef })` and attach its returned props as in the menu recipe. It retains a focused/open trigger through permission loss and dismissal, preserving explicit focus destinations and recovering lost focus to your fallback. The card moves focus to its heading when a focused action disappears. Keep the fallback mounted when data or permissions change.

Pending now belongs to one hook instance per feed. Share its result between views when they should coordinate; visual items create no request timers. State/id changes, effect cleanup (including Activity or Suspense hiding), timeout and promise settlement clear pending. Request identity prevents an old completion from clearing a newer request made at the same clock timestamp.

The live region is now atomic, so each batched transition is read as one message. The status indicator includes a state word, and compact recipes retain the tier word for assistive technology. The trigger/content pair explicitly links its tooltip description in either supported primitive base. These replace the old compact color-only cue and the missing description relationship observed in the Base UI tooltip.
