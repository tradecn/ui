# Migrating from v1 to v2

Use this guide to update v1 integrations for the v2 API. Component reference pages describe current usage and behavior.

v2 requires React 19. Upgrade React and React DOM together before migrating components. TypeScript projects also need the matching React 19 types.

## Row store

Replace render-time `store.createView(...)`, including calls inside `useMemo` or lazy state, with `useView(store, stableOptions)`. The hook returns the correct sorted and filtered view during that render, including when options change from `null`. Keep options at module scope or memoize them. See the complete [sorted table example](row-store.md#sorted-and-filtered-views).

| v1 contract | v2 contract |
|---|---|
| `useView` replaces its result in an effect | Store, options and `null` transitions select the new result synchronously. |
| Hook cleanup calls terminal `dispose()` | Cleanup releases the connection. Feed work and timers stop, and effect replay reconnects the same handle. `isDisposed()` remains `false` unless explicitly disposed. |
| Custom `RowStore` supplies `createView` | Every structural `RowStore` must also supply pure `prepareView`, including stores passed only to row-reading consumers. |
| Imperative `createView` and caller-supplied `RowView` | Retained. Create outside render and dispose when your application finishes with it. Borrowing grids do not dispose supplied views. |

`useAlertView` and `useRfqStackView` use the same connection lifecycle. Remove cleanup that disposes their returned handles. Observe your component's own lifecycle when you need an unmount signal, rather than polling `isDisposed()`.

### Custom stores

`prepareView(options)` must return a current `PreparedRowView<T>` without registering with the store, subscribing upstream or starting timers. Do not alias it to an eager `createView`. Its `connect()` method acquires a connection and returns an idempotent release function. The final release removes registration and timers, and a later connection refreshes the same handle. Explicit `dispose()` remains terminal.

Detached `getIds()` reads must stay current without notifying listeners. `subscribe()` registers only a local listener, and `touch()` records a hold without starting a detached timer. On connection, notify any change since the last published snapshot and resume only the remaining hold duration. Keep sorting, filtering, stable snapshot identity and publication before row notifications consistent with your store.

If your adapter delegates to `createRowStore`, forward the prepared-view protocol too. This complete wrapper retains the adapter as `view.store`:

```ts
import type { RowStore } from "@/lib/row-store"

export function adaptRowStore<T>(source: RowStore<T>): RowStore<T> {
  const store: RowStore<T> = {
    getRowId: (row) => source.getRowId(row),
    getRow: (id) => source.getRow(id),
    getIds: () => source.getIds(),
    getMeta: () => source.getMeta(),
    subscribeRow: (id, listener) => source.subscribeRow(id, listener),
    subscribeOrder: (listener) => source.subscribeOrder(listener),
    subscribeMeta: (listener) => source.subscribeMeta(listener),
    applyDeltas: (batch) => source.applyDeltas(batch),
    clear: () => source.clear(),
    prepareView(options) {
      const view = source.prepareView(options)
      return {
        store,
        getIds: () => view.getIds(),
        subscribe: (listener) => view.subscribe(listener),
        connect: () => view.connect(),
        touch: () => view.touch(),
        isHeld: () => view.isHeld(),
        dispose: () => view.dispose(),
        isDisposed: () => view.isDisposed(),
      }
    },
    createView(options) {
      const view = store.prepareView(options)
      view.connect()
      return view
    },
  }
  return store
}
```

The wrapper requires an updated source store. If you implement storage and ordering yourself, implement the same pure preparation and reversible connection contract before using the updated hooks. `RowView` itself retains its existing methods.

## Prices and parsing

`parsePrice` snaps a plain decimal typed into a fraction convention onto the printable grid — half or eighth ticks — so the parsed value is the price its formatted text shows. v1 accepted fraction decimals without snapping. Every reader of a parsed price moves with it: `onValueChange` from a quote field, a ticket's described draft and `run`, an RFQ quote, QuotePanel's `onEdit`, and a grid-rule threshold parsed with `parsePrice`. A saved rule whose decimal threshold sits off the grid matches on the snapped price after upgrading — `gt "99.7"` in 32nds compares against `99.703125` — and `describeRule` prints each readable string value through the column's `format` on any column that has both `parse` and `format` — automatically, descriptions and tooltips alike, labeled or not, so a grid whose price column already paired `format` with `parse` sees `gte "100"` read as `Price at or above 100-00` where v1 kept the typed text; a format that reads its row keeps the typed words, since descriptions call it without one, and an unreadable value stays as typed too. For a fraction convention, a negative tie snaps away from zero as it prints and a value from 1e21 — where whole parts take exponent form — parses as `null`, where v1 returned the number and let the formatter print text that could not be read back. Decimal and tick prices round-trip wherever their scaling stays finite — a tick price whose scaling overflows parses as `null` instead of `Infinity` — tick ties keep `roundToTick`'s toward-zero rounding for negatives, and zero is plain zero everywhere.

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

## CommandPalette

`CommandPalette` now requires caller-owned children and coordinates behavior without inserting UI. Replace self-closing calls with a `CommandPaletteDialog` or inline `CommandPaletteContent`, then compose the input, list, empty message, groups and items. See the complete [ordinary](command-palette.md#usage) and [inline](command-palette.md#inline-commands) examples.

| Previous interface | Current interface |
|---|---|
| `<CommandPalette actions={actions} />` | Required root children. For a modal, compose Dialog → Content → Input and List. For `variant="go-bar"`, compose Content directly. |
| Private action and symbol groups | `CommandPaletteResults` with a group callback, or `useCommandPalette().groups` for direct ordering and filtering. Use your shadcn `CommandGroup`. |
| Automatic row title, subtitle, badge and shortcuts | `CommandPaletteItem row={row}` with caller children. Render `row.title`, optional `row.subtitle` and `row.badge`, and `CommandPaletteKeys keys={row.keys}` where needed. Use the shadcn `CommandShortcut` for trailing content. |
| Automatic secondary hint | Compose `CommandPaletteSecondary` with caller text and optional `CommandPaletteKeys keys="shift+enter"`. Shift+Enter behavior remains shared. Secondary replaces the primary callback. |
| Automatic five-recent limit | Groups expose all eligible recents; use `group.id === "recent" ? group.rows.slice(0, 5) : group.rows` to preserve the previous display cap. The registry still defaults to storing eight. |
| Root `className` | Move to `CommandPaletteDialog` for modal styling or `CommandPaletteContent` for inline styling. The root has no DOM node. |
| `labels.empty`, `labels.searching` | Removed from `CommandPaletteLabels`. Supply Empty children; read `loading` from `useCommandPalette()` to choose text. The previous defaults were `No results` and `Searching…`. |
| Other labels, actions, symbols, grammar, hotkey and open props | Retained on the root with their previous defaults. `variant` selects behavior; it no longer creates a dialog or input. |
| Automatically installed `badge` | Removed from installation dependencies. Render a styled span as in the examples, or install `badge` separately. |
| Go-bar search continuing after blur | Search now aborts when closed and restarts on reopening. Blur retains the query; selection and Escape clear it. |
| Generated selectors | `tradecn-command-palette` and `data-variant` move onto Content. Item retains `data-row`; Secondary supplies `data-secondary`. |

The action registry, recents persistence, action scoring, symbol types and primary/secondary callback shapes remain available. Keep one Content and one Input per root; share the registry between separate roots for a dialog and inline list. Group and result hooks do not duplicate requests. All symbol search belongs to Content, with cancellation on query/adapter changes, close and unmount. Keep `symbols` stable — module scope or memoized — because results are keyed on the adapter object now: v1 kept settled rows visible under a fresh adapter, while v2 hides them until the current adapter answers, so an inline adapter under a re-rendering parent falls back to its searching state on every render.

Keep meaningful row text, shortcut hints, focusable application controls and status announcements in your composition. Public parts retain keyboard selection, captured hotkey scopes, live remaps, early dialog input, inline focus retention, closure and recent updates. Use Item or the hook's `select`, rather than calling a row's raw callback, to keep those selection effects. Scope filtering does not replace permission checks in application actions. The migrated examples preserve the prior five-recent display cap and caller status messages.

## PriceChart

`PriceChart` now requires `children`. Root options, labels, and plotting defaults are unchanged.

Replace self-closing calls with a plot and the optional parts you need:

```tsx
import {
  PriceChart,
  PriceChartHeader,
  PriceChartLast,
  PriceChartChange,
  PriceChartReadout,
  PriceChartPlot,
  PriceChartEmpty,
  PriceChartLegend,
  PriceChartOverlaySwatch,
} from "@/components/ui/price-chart"

<PriceChart store={store} convention={convention} label="ZN, today" overlays={overlays}>
  <PriceChartHeader>
    <PriceChartLast />
    <PriceChartChange />
    <PriceChartReadout />
  </PriceChartHeader>
  <PriceChartPlot>
    <PriceChartEmpty />
  </PriceChartPlot>
  {overlays.length > 0 && (
    <PriceChartLegend>
      {overlays.map((overlay) => (
        <li key={overlay.id} className="flex items-center gap-1">
          <PriceChartOverlaySwatch overlayId={overlay.id} />
          {overlay.label}
        </li>
      ))}
    </PriceChartLegend>
  )}
</PriceChart>
```

Use your existing `store`, `convention`, and `overlays`. Keep other root options such as `zone`, `baseline`, `kind`, `height`, and `onCursor`.

Omit both the `overlays` prop and legend when you have no overlays. See the [PriceChart reference](price-chart.md) for complete examples.

| v1 ownership | v2 replacement |
|---|---|
| Automatic header and last/change/readout text | Explicit `PriceChartHeader`, `PriceChartLast`, `PriceChartChange` and `PriceChartReadout`. Move or omit them independently. |
| Automatic canvas and keyboard crosshair | Mount one `PriceChartPlot` inside the root. It retains the accessible summary even without visible readings. |
| Automatic "No data" placeholder | Place `PriceChartEmpty` inside the plot. It defaults to `labels.noData`. Children replace only the visible text. Use `labels.noData` for the plot's accessible name. |
| Automatic legend rows in overlay order | Compose `PriceChartLegend` with your rows and labels. Use `PriceChartOverlaySwatch overlayId={overlay.id}` to retain the plotted color when changing legend order. Hide an empty legend yourself. |
| Header-specific numeric font inheritance | Each public numeric reading supplies its own font and numeric variant wherever placed, following the price notation: on a yield-, discount-, or spread-quoted instrument with a fraction price, readings v1 set in the numeric family render mono. |
| Root native handlers | Retained. Plot handlers are also public and run before built-in behavior. `preventDefault()` cancels that behavior. |
| `data-chart-*` markers | Retained on their public parts. The empty placeholder is now a `div`. Replace element-specific `p[data-chart-empty]` selectors. Swatches add `data-chart-swatch`. |

`PriceChartProps`, `PriceChartKind`, `PriceChartOverlay`, `PriceChartLabels`, `DEFAULT_PRICE_CHART_LABELS`, and `CHART_TOKEN_CLASS` remain exported.

Use `usePriceChart` for custom readings without another store subscription.

`onCursor` reports cursor interaction and pointer-driven index changes. Updating the selected bar's data does not call it.

When bars remain, an out-of-range keyboard selection clamps silently to the last bar. Appended bars keep the clamped index.

Programmatic plot synchronization does not echo a callback.

Plot recreation restores the selected bar until the next pointer movement. Cursor callbacks no longer repeat under StrictMode.

The root creates no timers or live announcements.

## RulesEditor

`RulesEditor` now requires `children`. Compose the sections, fields, readings, and actions you need.

You can start with the complete [Usage example](rules-editor.md#usage), or copy [Tabs](rules-editor.md#tabs) to retain the four-tab editor.

| Previous interface | Replacement |
|---|---|
| Self-closing `RulesEditor` | Required `children` containing your composition. |
| Automatic tabs and panels | Compose installed shadcn `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent`. |
| `defaultTab`, `RulesEditorTab` type | Move initial selection to `defaultValue` on `Tabs` or your controlled tab state. The editor no longer owns a tab value or exports its type. |
| `columnState`, `onColumnStateChange` | Pass these to a composed `ColumnChooser` inside a Columns panel. Share the state with the grid. |
| Automatic rule rows | Map each source list into `RulesEditorItem` with `kind` and its source `index`. Keep highlight keys as `rule.id`. |
| Automatic condition fields | `RulesEditorColumn`, `RulesEditorOperator`, and `RulesEditorValue` for each field shape. |
| Automatic highlight properties | `RulesEditorTone`, `RulesEditorToneSwatch`, `RulesEditorTarget`, and `RulesEditorLabel`. |
| Automatic sort direction | `RulesEditorDirection` inside each sort item. |
| Automatic validation | Place `RulesEditorProblem` inside each item. |
| Match counts and filter total | `RulesEditorMatchCount` inside items and `RulesEditorFilterCount` anywhere under the root. Keep passing `store`. |
| Tab badges | `RulesEditorRuleCount` for rule lists. Render the hidden-column count from your column state. |
| Add, move, and remove controls | `RulesEditorAdd`, `RulesEditorMove`, and `RulesEditorRemove` with your button content. |
| Empty states and drag hint | Render your own content, or read the retained words from `useRulesEditor().labels`. |

Include all value fields to support every operator shape:

```tsx
<RulesEditorOperator />
<RulesEditorValue />
<RulesEditorValue field="low" />
<RulesEditorValue field="high" />
<RulesEditorValue field="values" />
```

Each value field renders only when its operator needs it. The parts retain comma drafts, column parsing, validation, and controlled edits.

`columns`, `rules`, `onRulesChange`, `store`, `labels`, and `className` remain root props.

`RulesEditorProps`, `RulesEditorLabels`, `DEFAULT_RULES_EDITOR_LABELS`, and all pure helpers remain exported.

`RulesEditorItem` is a focusable `div`. You can wrap it in `li` for a list, or place it directly in a card layout.

Update selectors for the moved markers. `data-rule-row` and `data-dragging` moved from the `li` to `RulesEditorItem`. `data-rule-id`, `data-filter-index`, and `data-sort-index` moved from the inner field wrapper to that same item element.

Moves use source indices and keep focus on the moved field when available. Drops are limited to the same rule kind in the same editor.

Fixed `rules-tab-*` and `rules-panel-*` IDs and the root's `data-tab` marker are removed. Your installed `Tabs` owns tab IDs and state. You can use role/name locators or set explicit IDs on your Tabs parts.

## HotkeyEditor

`HotkeyEditor` now requires `children`. Compose an item for one binding, or map `useHotkeyEditor().groups` into your own sections and items.

The [Usage example](hotkey-editor.md#usage) shows one shortcut. [Groups](hotkey-editor.md#groups) retains the grouped settings screen and export snapshot.

| Previous interface | Replacement |
|---|---|
| `<HotkeyEditor />` and self-closing configured calls | Required children containing your composition. The root still needs `HotkeysProvider`. |
| Automatic toolbar, groups, rows and empty state | `HotkeyEditorSearch`, caller sections mapped from `groups`, `HotkeyEditorItem bindingId={entry.id}`, and caller empty text. |
| Fixed descriptions, changed badges and control placement | Caller markup, `HotkeyEditorKeys`, `HotkeyEditorChange`, `HotkeyEditorEdit`, conditional `HotkeyEditorReset`, and `HotkeyEditorResetAll`. Actions require children. |
| Private capture, text input, errors and conflicts | `HotkeyEditorCapture`, `HotkeyEditorInput`, `HotkeyEditorProblem`, and `HotkeyEditorConflicts` inside each item. Mount the editing fields for the triggers you expose. |
| `onExport`, `onImport` | Caller controls using `useHotkeyEditor().registry.overrides()` and `registry.load(overrides)`. Import still does not notify `onChange`. Persist it separately. |
| `labels.export`, `labels.import`, `labels.resetAll`, `labels.remapped`, `labels.empty` | Removed. Supply caller text. Previous defaults were `Export`, `Import`, `Reset all`, `changed`, and `No shortcut matches.`. |
| Remaining labels, `hide`, `className` | Retained. `hide` filters the hook's groups. Direct items and the hook's full entries remain available. Native div props and refs are now forwarded. |
| Implicit ordering | Hook groups retain named groups first, then scope-derived groups, sorted by group and description. Use them in order to preserve the arrangement. |
| Private `data-hotkey-group` sections | Caller-owned sections. The Groups recipe retains these markers. Root, row, keys, capture, problem, conflicts and remapped markers remain on their corresponding parts. |
| Installed `badge` dependency | Removed. Render a styled span as in the examples, or install Badge separately. |

The `HotkeyEditorLabels` type and `DEFAULT_HOTKEY_EDITOR_LABELS` remain with the reduced fields above. `scopeWord`, `groupOf`, and `matchesQuery` are unchanged. Keep descriptions, visible changed cues, conflict text, and meaningful accessible names in custom compositions.

Keys remain visible while editing in the new recipes. v1 replaced them with the field.

Reset is now a public button that stays rendered when disabled. `entry.remapped` is also wider than v1's: it reads true while an override is stored, where v1 compared the effective keys with the defaults — so a corrupt or default-equal stored override now shows a changed badge and an enabled Reset that v1 hid. Reset all still disables when no registered entry is remapped and clears all overrides, including hidden and unknown ids.

Editing is shared within each item. Key, declaration-field, or registry changes cancel an open draft. Unrelated registry updates preserve it.

Text editing now keeps application hotkeys from firing while typing. Commit and Escape restore focus to the initiating control, falling back to the item. Blur preserves the chosen destination.

Removing a focused item falls back to search or the root. Reset moves focus to the item when the focused button is removed or disabled. Reset all moves focus to search or the root when it becomes disabled.

Each item is now a named `role="group"` with `tabIndex={-1}`. The root also has `tabIndex={-1}` for focus recovery.

Capture's default accessible name changes from `Press the new shortcut, Escape cancels, Backspace unbinds` to `Press the new shortcut`. The hint is now a linked accessible description. Update role/name locators that include the hint.

Validation now has an alert role and a linked field description. Its message clears on blur, where v1 kept it. `data-hotkey-capture`, `data-hotkey-problem`, and `data-hotkey-conflicts` retain their `"true"` values.

Use the public capture and input parts with custom controls to retain their event handling. The hooks expose editing state and operations without duplicating registry subscriptions. The registry now reads the canonical plus spellings back: a bare `+` and modifier steps ending in `++`, such as `ctrl++` and `meta++`. Version 1 stored those overrides — from typing the text `ctrl+plus` into the editor's field, or calling `remap(id, "ctrl+plus")` — and silently fell back to the default when reading them, wherever your application persisted the map; after upgrading they take effect, so reset a binding that was unintended. Malformed spellings such as `ctrl+++` still fail instead of becoming live bindings; they stay stored, read as remapped, and Reset clears them.

## LayoutManager

`LayoutManager` now requires children. Compose save fields, template readings, editing controls, and import fields explicitly. The import form's name field is named `Imported layout name` through its own `labels.importName`; it no longer shares `Layout name` with the save field, so update selectors that relied on the collision.

See the [list](layout-manager.md#usage), [card](layout-manager.md#cards), and [workspace](layout-manager.md#saving-and-restoring-a-workspace) examples for complete compositions.

| v1 | v2 |
|---|---|
| `<LayoutManager templates={templates} onTemplatesChange={setTemplates} onLoad={load} />` | Add an explicit composition. Required `children` makes the old call a type error. |
| Internal list and empty message | Render your own list, order, and empty state. Wrap each `LayoutManagerItem templateId={id}` in an `li` for list semantics. |
| Internal save toolbar | Compose `LayoutManagerSaveName`, `LayoutManagerSave`, and `LayoutManagerTaken`. |
| Fixed template row | Compose `LayoutManagerName`, `LayoutManagerRenameField`, `LayoutManagerActive`, `LayoutManagerPanelCount`, `LayoutManagerSavedAt`, and `LayoutManagerUnknownKinds`. |
| Internal row actions | Compose `LayoutManagerLoad`, `LayoutManagerRename`, `LayoutManagerDuplicate`, and `LayoutManagerDelete`. |
| Internal import form | Compose `LayoutManagerImportTrigger`, `LayoutManagerImportContent`, `LayoutManagerImportText`, `LayoutManagerImportName`, `LayoutManagerImportSubmit`, and `LayoutManagerImportProblem`. |
| Root `onExport` | Use `exportTemplate(template)` in your own control. `useLayoutManagerItem()` supplies the current template. |
| Root `onReset` | Put the callback on your own reset button. The root also excludes the native section `onReset` event to catch obsolete calls. |
| Root `labels` | All keys remain. Read `empty`, `export`, and `reset` from `useLayoutManager().labels` when composing that content. |

The data helpers, template shape, controlled callbacks, active marker, clock, and known-kind inputs remain. The root forwards section props and refs. `onLoad` keeps its workspace callback signature.

`useLayoutManager()` exposes save/import state, and `useLayoutManagerItem()` exposes template readings, editing, and confirmed actions. Readings manage their content. Use a hook for custom output.

The root retains `data-slot="tradecn-layout-manager"`. Row markers move from the internal `li` to the public item's named `div` group: `data-layout-template`, `data-active="true"`, and `data-unknown-kinds`.

Name, loaded, panel-count, unknown-kind, save, replacement-warning, import-trigger, import-submit, import-error, load, and delete markers retain their values on the corresponding parts. Put `data-layout-reset=""` on a caller reset control if you use that selector.

There is no generated list, toolbar, empty state, reset control, or export control.

Compose one save field and import editor per root, and one rename field per item. Pair the save field with its replacement warning, and the import text field with its error reading so their accessible descriptions resolve.

Template groups use the template name by default. Caller `aria-label` and `aria-labelledby` can override it.

Native button children replace visible text. Custom Load and Delete content must also show `asking` from the item hook.

Keep the unknown-kind reading when the load warning needs a visible explanation.

Confirmation still belongs to one action across the manager. It now cancels when its target disappears or the target layout changes. Equivalent copied layouts keep it.

Template names now wrap instead of truncating. Add `className="truncate"` to `LayoutManagerName` to retain truncation.

Rename cancels when the source name or layout changes. Enter and Escape preserve IME composition. Enter in either the save or rename field now prevents a surrounding form submission.

The root and items now use `tabIndex={-1}` as programmatic focus targets, outside the Tab order. Override the native prop when needed.

Rename completion returns focus to its initiating control or item. Blur preserves the destination. Removing a focused item falls back to the save field or root.

A focused Save or always-visible Add button that disables itself moves focus to the save field or root. Successful built-in imports restore the trigger when focus would otherwise be lost. Custom dialogs own their focus behavior.

## DataGrid

Grid shortcuts now run only when focus is on the grid itself. In v1, keys from header controls, selection checkboxes, and custom cell controls also ran grid commands. These controls now keep their own key behavior.

After using a control, press Shift+Tab until the grid itself has focus, or click a cell without a control, to resume grid navigation.

A parent that handles a grid shortcut should call `preventDefault()` from `onKeyDownCapture`. Its bubbling `onKeyDown` runs after the grid.

Watchlist removal keys and opt-in Blotter action keys now require focus on their own grid too. See [Watchlist removal](watchlist.md#removing) and [Blotter deletion](blotter.md#delete-cancels-nothing-by-default).

Custom controls now own their pointer interactions too. Pressing or double-clicking a button, input, editor or other interactive cell content no longer implicitly selects, focuses, edits or activates its row.

Pass the cell's explicit row id to its action. If the action should also select or focus the row, update controlled `selection` or `focusedRowId` in that handler.

For an available text-editable cell, a custom `edit.open()` button opens and focuses the text editor but does not change the logical row or chosen column. Updating `focusedRowId` in that handler restores the former incidental row focus; column shortcuts still use the previously chosen column.

Row actions now run during bubbling and honor a child's `preventDefault()` or `stopPropagation()`. In v1, row actions still ran after an earlier handler called `preventDefault()`. Parent handlers must use capture to claim the event first.

Nested grids and content portaled outside the grid no longer touch its reorder hold or pause its tail following; contained controls still do so on pointer press.

Open shadow roots use the same ownership rules. For a closed shadow root, mark its host or a containing element outside that closed root with `data-grid-interaction="control"` to retain the enclosing grid's hold and tail pause, or `data-grid-interaction="independent"` to skip that bookkeeping.

Both exclude this grid's row actions and row menu. Without a marker, the hidden content is indistinguishable from its plain host.

Row context menus now open only from plain content in a current row. Controls retain their own menus, while headers, footers and empty space no longer open the menu for the previous selection.

With `renderContextMenu`, rejected starts stop React bubbling at the grid body after child handlers run. This covers `contextmenu`, non-mouse `pointerdown`, and single-touch `touchstart` events.

Multiple-touch `touchstart` events still reach the menu to cancel a pending long press. Move an ancestor observer to capture if it needs those events.

Contained context-menu events also stop native bubbling. Rejected pointer and touch starts and events from outside portals retain native delivery. To suppress a custom control's browser menu, call `preventDefault()` in that control's `onContextMenu` handler.

See [pointer interactions](data-grid.md#pointer-interactions), including the wrapper for controls styled with `pointer-events: none`.

Resize handles now start only from an unhandled primary-button press by a primary pointer. Secondary buttons, secondary pointers and already-prevented presses do not resize.

The handle is pointer-only. Use Alt+Shift+Left or Right with the grid focused to resize the chosen column.

## DepthLadder

Replace the self-closing `DepthLadder` with an explicit composition.

The price cell's font follows the price notation now: on a yield-, discount-, or spread-quoted instrument with a fraction price, a cell v1 set in the numeric family renders mono.

The root keeps the book, formatting, virtualization, following, and keyboard inputs. Your JSX supplies the header, viewport, rows, and controls.

See [DepthLadder Usage](depth-ladder.md#usage) for a complete replacement.

| v1 interface or default | v2 replacement |
|---|---|
| `<DepthLadder store={store} convention={convention} mid={mid} label="Book" />` | `children` is required, including for calls using only these retained inputs. Compose the public parts. |
| Automatic Bid / Price / Ask header and rows | Add `DepthLadderHeader`, three `DepthLadderColumnHeader` parts, and `DepthLadderViewport` containing `DepthLadderRows`. Return one `DepthLadderRow` with bid, price, and ask cells from its render callback. |
| `emptyState` | Put the content in `DepthLadderEmpty` inside the viewport. Without children it still uses `labels.noMarket`. |
| Floating Recenter button | Add `DepthLadderRecenter`. To preserve placement, pass `className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2"`. It now uses your installed shadcn `Button` with `size="sm"`. Its height, weight, and shadow follow that style (22px instead of 26px, weight 500, and no shadow). The registry installs that dependency. |
| Own-size chip before market size | Still the default of `DepthLadderSizeCell`. Replace its children with `DepthLadderOwnSize` and `DepthLadderSize` to change the order or add content. |
| Fixed descending prices and Bid / Price / Ask order | Still the defaults. Set `order` and `columns` when changing the visual layout, and render matching headers and cells. |
| Active descendant resolved to the focused row | It resolves to the focused cell, which carries `aria-selected`. Read `focusedColumn` from the row callback or `useDepthLadderRow()`, or walk `closest("[data-tick]")` from the cell. |

Keep `store`, `convention`, `mid`, `label`, `depth`, `rowHeight`, `overscan`, `onStage`, `formatSize`, `flashWindowMs`, `labels`, `initialRect`, and `className` on the root.

Their defaults are unchanged: 200 ticks on either side, 22px rows, eight overscan rows, `formatQuantity`, and 900ms flashes.

`DepthLevel`, `LadderColumn`, `LadderStage`, `DepthLadderLabels`, `DEFAULT_DEPTH_LADDER_LABELS`, and the three tick helpers remain exported.

Mount one viewport and one rows part.

Keep the row callback, `convention`, `columns`, `labels`, and `formatSize` stable for frequent parent updates. Their object and function identities now reach every mounted row. In v1, an inline `convention` became formatted strings per rung. In v2, a new convention object re-renders every mounted row even when its values are unchanged.

Each mounted tick still has one store subscription, and each size cell owns its flash.

Custom readings use `useDepthLadderRow()` without adding subscriptions.

The initial missing market uses your empty part. A market that disappears later leaves the built prices visible.

Grid shortcuts now run only when the grid itself is the key event's target. Recenter and other nested controls keep all their native keys: Enter no longer stages the stored selection, arrows no longer move it, and Home no longer recenters from the button. Composing keys are also ignored.

A focused Recenter returns focus to the grid when it disappears or becomes disabled.

Keep the part mounted and let it manage visibility.

`aria-activedescendant` stays valid during page jumps by keeping the selected rung mounted while its tick remains in the anchored range. The descendant now names the focused cell, not the row: cells carry generated ids and, on roles that take it, `aria-selected`, so code that resolved the descendant to read the row's `data-tick` should read the cell's `data-col` and `closest("[data-tick]")`, or take `focusedColumn` from the row callback or `useDepthLadderRow()`. The root reserves its grid role, tab stop, accessible name, counts, and active descendant. `DepthLadderRow` reserves its generated `id`, and `DepthLadderSizeCell` and `DepthLadderPriceCell` reserve `id` and `aria-selected`. Use a data attribute for application row identifiers.

Recenter still retains the selected tick and column, but Enter stages nothing while that tick sits outside the anchored range — in v1 it staged the stored tick. Navigation clamps the selection back onto the ladder first.

Preserve visible side headers, own-size descriptions, and your staging status or ticket when composing another layout.

Order permissions and submission remain application-owned.

## SpreadMatrix

`SpreadMatrix` now requires children. Compose a named `SpreadMatrixTable` with native table sections, `SpreadMatrixHead`, and either matrix rows/cells or structure rows/cells.

The [Usage example](spread-matrix.md#usage) includes the complete matrix. The [curves and butterflies example](spread-matrix.md#curves-and-butterflies) supplies the structure composition.

| Previous interface | Replacement |
|---|---|
| Self-closing `<SpreadMatrix ... />` | Required children containing your table and collection markup. Calls with only retained props also require children. |
| `label` on the root | Required `label` on `SpreadMatrixTable`. Native `aria-label` and `aria-labelledby` props are reserved. |
| `instruments` selected rows and default columns | Map your row instruments into `SpreadMatrixRow` and your columns into `SpreadMatrixCell`. Keep root `instruments` for structure metadata. |
| `columns` | Map the selected columns into headers and cells. For structure metadata, pass `[...instruments, ...columns]` to the root to preserve the old last-column-wins lookup. |
| `structures` | Map into `SpreadMatrixStructureRow`, with `SpreadMatrixStructureCell` and optional `SpreadMatrixLegs`. An empty array previously showed the structures headers; retain those headers in your composition or supply an empty state. |
| `labels`, `SpreadMatrixLabels`, `DEFAULT_SPREAD_MATRIX_LABELS` | Caller-owned headings, captions and unit text. These props and exports are removed. |
| String-only `format` | Retained and widened to `ReactNode`. It is called by `SpreadMatrixValue`, the default cell reading. |
| Root `data-mode` | Caller-owned. A root can contain both matrix and structure tables. |
| Generated `data-unit` and header `data-column` | Add these selectors to your headings if you use them. Cell and row data marks remain. |

Keep the previous labels by writing Instrument, Structure, Legs, Spread, ticks and bp in their corresponding headers.

The matrix caption was "Each cell is the row less the column." followed by the unit and a period; the structures caption was "Spread: bp." or "Spread: ticks.".

Use `scope="row"` on row headers, keep column headers in the same order as cells, and give each table a name. `SpreadMatrixHead` defaults to column scope.

The root retains the `ticks` basis, the price/yield reader, `formatSpread`, the 900ms flash duration, scrolling classes and `tradecn-spread-matrix` slot.

Arithmetic helpers, weights, rounding, signed formatting, missing values and blank diagonal defaults are unchanged. The row's instrument supplies its tick; structure fallback ticks come from root metadata.

Keep stable instrument objects, metadata arrays, readers and formatters for update isolation.

Rows and cells retain their quote subscriptions. `SpreadMatrixValue` and the state hooks share those readings without additional subscriptions.

Custom cell children replace the default reading, including on missing and diagonal cells, so include `SpreadMatrixValue` or handle those states with `useSpreadMatrixCell`.

Flashes stay on the cell and clean up on unmount. Components add no order actions or keyboard shortcuts.

## Ticket and RfqTicket

Both tickets declare their bindings as registry defaults through [`declareDefault`](use-hotkeys.md#api-reference), replacing v1's declare-when-missing registrations.

- `unregister("ticket.send")` or `unregister("rfq.send")` does nothing while a ticket holds the default. To disable one, register the id with `keys: ""`; `remap(id, "")` also unbinds it, as a user override the hotkey editor shows and Reset undoes. Your own registration shadows the default whenever it comes — in v1.4.13 a registration made after an RFQ ticket mounted was deleted at the next inquiry — and unregistering yours brings the default back immediately.
- Shortcuts now run from the whole ticket. v1 scoped handlers to each ticket's inner box, so after clicking the heading, the market, or the padding, the keys did nothing; now they act there, bindings in outer scopes on the same combinations no longer fire from inside a ticket, and macOS Cmd+Up and Cmd+Down no longer scroll the page from one. `mod+1` through `mod+9` declare only for the quick sizes passed, so the hotkey editor lists fewer entries and `remap` of an undeclared size throws where v1 succeeded; an undeclared absent size's keys pass through untouched, and one declared anywhere is consumed inside every ticket. A disabled ticket runs no shortcuts, though its keys are still consumed. RfqTicket's step, suggestion, and quick-size keys now run only while the fields are live — an allowed action needs a quote and `disabled` is false — where v1.4.13 let step and suggestion keys move the draft under disabled fields and quick-size keys ignored allowed actions; its send key runs only an action that sends the quote — an explicit `primary: true` on a `needsQuote: false` action is skipped where v1 ran it, and the key caps move to the action the key runs — so it no longer falls back to a pass.
- Both RFQ level fields say `Not a level in this instrument's notation.` instead of naming the side, and the optional `labels.invalidLevel` carries that text; a test matching the old strings, or a complete translated label set, meets the change without a compiler prompt.
- `ticket.tsx` and `rfq-ticket.tsx` now require a `lib/hotkeys.ts` with `declareDefault`: reinstall the shared file alongside the block, and a hand-written or wrapped `HotkeyRegistry` — common in consumer tests — must implement the method or the ticket throws on mount.
- The crossed check reads the instrument's quote direction. v1 rejected any bid above its offer; now yield and discount invert by default — a rates desk whose yield quotes bid below offer declares `quoteInverted: false` on the convention — while price and spread keep the v1 reading unless the convention declares `quoteInverted: true`, as cash credit does. The default message reads `The quote is crossed.` where v1 said `The bid is above the offer.`: a test matching the old string, or a translated `crossed` label that names a direction, meets the change, and one label now serves both directions.
- `rfq.tick-up` and `rfq.tick-down` step the side the key event came from — its field or step buttons — else the first requested side; v1 compared focus against the global document, which stepped the bid from a popout or a focused step button.
- `checkQuote` treats a non-finite level as absent: a required `NaN` gets the needed message where v1.4.13's page said finiteness went unchecked, and a non-finite pair is never compared.
- When the control under focus unmounts or disables, focus parks on the ticket root without scrolling, so the fenced shortcuts stay live; v1 left focus on the body. A parent that watched for `body` to run its own recovery no longer sees it, a deliberate click elsewhere is remembered as leaving, and a window switch is not.

## PerfMonitor

`PerfMonitor` now requires children. Replace self-closing calls with the complete [Usage composition](perf-monitor.md#usage), which retains the histogram and six frame readings. The sampler and frame-statistics exports are unchanged.

| Previous interface | Replacement |
|---|---|
| Implicit histogram and frame statistics | Compose `PerfMonitorHistogram` and `PerfMonitorValue` with labels at the call site. The old order was frames, p50, p99, max, dropped, long. |
| `compact` | Omit `PerfMonitorHistogram`; retain the readings you need. |
| `lanes` and the `PerfMonitorLane` descriptor type | Map your own descriptors to the new `PerfMonitorLane` provider with `store` and required children. Use `PerfMonitorLaneValue` and `usePerfLane()` for readings. |
| `readouts` and `PerfReadout` | Render application content directly. Values can include elements and controls. |
| Private lane rows | Copy `LaneReadings` from [Measuring a grid](perf-monitor.md#measuring-a-grid), including its stated prerequisites. Preserve coalesced drops versus ordered sequence/gap, rate, and age where needed. |
| `data-perf`, `data-perf-readout`, `data-perf-lane`, `data-lane`, `data-perf-dropped`, `data-perf-seq` | Add these application selectors to your composition. The supplied recipes retain them. |

Keep `sampler`, `budgetMs`, `window`, `refreshMs`, `onReport`, `label`, and `className` on the root. Defaults remain a 600-gap window, 250ms reports, a `1000 / 60` budget, and the accessible name “Frame health.”

Root slot/frame/drop attributes and histogram marks are retained. The root remains a group; `role` cannot be overridden. `label` remains authoritative; use it instead of native ARIA naming props.

Mount one root for presentations sharing a sampler lifetime. It starts the selected sampler, stops it on replacement or unmount, and retains the initial sampler as its fallback.

Initial settings configure an owned sampler once; remount or supply a replacement to change its sampling settings. `budgetMs` still moves the histogram marker. Repeated readings share snapshots without adding samplers, report subscriptions, or callbacks.

Each lane provider subscribes once to its store and shares rate/age calculations. Keep repeated readings under that provider, and use stable keys for lane collections. Replacing its store resets the rate to zero.

Custom table layouts need native headers and labels; custom controls need accessible names. See [Custom layout](perf-monitor.md#custom-layout) for a complete example.

## Watchlist

`Watchlist` now requires children. Use the complete [Usage composition](watchlist.md#usage) to retain the add field and all three removal routes, or choose another layout from its public parts.

| Previous interface | Replacement |
|---|---|
| Self-closing `<Watchlist store={store} />` | Required children, including `WatchlistGrid` for the price grid. Retained props alone still require composition. |
| `columns`, `price`, `label`, `renderContextMenu`, `getRowProps` and other grid options on the root | Move them to `WatchlistGrid`. Keep store, add/remove callbacks, normalization, validation, selection and focus on the root. |
| Implicit add field when `onAdd` exists | Compose `WatchlistAddForm`, `WatchlistAddInput` and `WatchlistAddButton`. Omit the form to hide it; without `onAdd`, mounted controls are disabled. |
| `addPlaceholder` | `placeholder` on `WatchlistAddInput`; set an explicit accessible name when needed. |
| Automatic removal column | Add `watchlistRemoveColumn()` to your columns, or place `WatchlistRemoveButton` with explicit ids elsewhere. |
| Automatic removal menu item and separator | Compose your menu content, optional `ContextMenuSeparator`, and `WatchlistRemoveMenuItem` with the renderer's ids. |
| Custom add or bulk controls | Use `useWatchlistAdd()` inside the form and `useWatchlist()` inside the root. |

The Usage example exports `WatchlistAddControls` and `RemovableWatchlistGrid` as application recipes. Save it as `watchlist.tsx` beside consumers that import them, outside `components/ui`.

Root `className` still styles the outer container. `WatchlistGrid` adds a sizing wrapper with its own classes, ref and cancellable key handler. The root slot, preset, price formatting, normalization, duplicate lookup, validation order, controlled selection/focus and callback behavior are retained.

Delete and Backspace now request removal only when the grid itself has focus. In v1, keys from cell editors, custom controls, header controls and selection checkboxes could also request removal and prevent native text deletion. These controls, nested grids and portaled content now keep their keys. Remove workarounds that prevented these events solely to avoid row removal. `preventDefault()` also blocks native text deletion.

With `onRemove`, grid deletion keys still work without visible removal parts and use the selection or, when empty, the focused row. `WatchlistGrid.onKeyDown` still receives bubbling events before the removal handler and can cancel a grid removal request.

After using a control, press Shift+Tab until the grid itself has focus, or click a cell without a control, to resume grid commands. Use `WatchlistRemoveButton`, `WatchlistRemoveMenuItem` or `useWatchlist().remove` for removal controls elsewhere in your layout.

The root adds no row subscriptions. Form drafts remain local, and stable grid inputs preserve per-row updates. Keep shared recipes, columns and formatters stable where they feed memoized rows.

Portaled menu keys no longer change DataGrid selection, navigation or row activation. In Radix, ArrowDown inside a removal menu previously moved the underlying selection and could change the row being removed. Menu navigation now keeps its original target.

A successful add-form submission now clears both its draft and invalid state. A previously refused draft can succeed without another edit when validation changes or its symbol arrives in the store.

Menu renderers now use current props when enabled or replaced, including while a menu is open. The renderer is not passed to memoized rows.

## Blotter

`Blotter` now requires children. Replace a self-closing call with `<Blotter store={store}><BlotterGrid /></Blotter>` and add the controls your layout needs.

The complete [Usage example](blotter.md#usage) preserves the ordinary grid. [Permission-filtered actions](blotter.md#permission-filtered-actions) supplies the toolbar and menu recipes.

| Previous interface | Replacement |
|---|---|
| Root grid inputs, including `columns`, `price`, `time`, `label`, `sort`, `selectionColumn` and `deleteAction` | Move them to `BlotterGrid`. Its preset, default checkbox column and default `Blotter` accessible name remain unchanged. |
| `store`, `actions`, `onNew`, selection/focus and their callbacks | Keep them on `Blotter`. They coordinate behavior without generating controls. |
| Automatic New button | Compose `BlotterNewButton` when `useBlotter().canNew` is true to preserve the former conditional visibility. Its default text is `New order`. |
| `newLabel` | Supply children to `BlotterNewButton`, or the shared `OrderToolbar` recipe's `newLabel`. |
| Automatic selected-count reading | Compose `BlotterSelection` for the same polite root-target count, including focused-row fallback. |
| Automatic action buttons | Use one `BlotterActionScope` around mapped `BlotterActionButton` controls, or copy `OrderToolbar`. |
| Automatic permission-filtered menu and custom-items separator | Pass `renderContextMenu` to `BlotterGrid`. Wrap its ids in `BlotterActionScope` and compose `BlotterActionMenuItem`, or copy `OrderMenu`. Put custom content inside `OrderMenu`. Pass `hasCustom` when the custom renderer can return `undefined`. Explicit `null` counts as custom content by default. |
| Root `className` | Still styles the outer container. `BlotterGrid.className` styles its sizing wrapper. Give a separate wrapper a height when relocating the grid. |

The root no longer creates a toolbar when `onNew` or actions are supplied. To retain v1 visibility, render `OrderToolbar` only when `onNew` exists or `actions.length` is nonzero.

To retain v1 menu visibility, pass `undefined` for `renderContextMenu` when actions are empty and no custom renderer exists. Supplying a renderer enables the grid menu even when it returns no items.

Save the complete actions example as `blotter-actions.tsx` beside consumers that import `OrderToolbar` and `OrderMenu`, outside `components/ui`.

These application recipes preserve the former button counts, destructive button styling, menu counts and empty fallback.

Available buttons retain focus after activation. Unavailable toolbar buttons return focus to the toolbar. A revoked menu item keeps focus with a visible ring; Enter stays inert until that same action is restored or you navigate elsewhere.

An open `OrderMenu` retains its offered action positions and disables revoked items. Reopen it to see newly permitted actions. The custom picker clears a removed choice and requires reselection before submission.

DataGrid now starts fresh menu content on every opening, including a rapid reopen during the closing animation. Content state remains intact while the menu is open.

`BlotterAction`, `BlotterRow`, `BlotterSide`, `BlotterColumnOptions`, `blotterColumns` and `allowedRows` remain available. Order status and action permissions still come from the server. Commands recheck current permissions before invoking handlers.

Delete and Backspace remain opt-in, and request pending/error handling remains application-owned.

When `deleteAction` is set, these keys now run the action only from the focused grid. In v1, keys from cell editors, custom controls, header controls, selection checkboxes and nested grids could also invoke it. Remove event-prevention workarounds used only to protect text editing.

Press Shift+Tab until the grid has focus to preserve selection. Clicking a cell without a control focuses the grid and selects that row. Use action buttons, menu items or `useBlotterActions().run` elsewhere; `BlotterGrid.onKeyDown` still receives bubbling events first and can prevent the action.

The shared scope fixes stale permission readings for empty or NUL-containing ids and for updates between rendering and subscription. It subscribes once per distinct target id, cleans up when targets change, and leaves unrelated rows alone.

See [Custom layout](blotter.md#custom-layout) for a native picker using the same readings and dispatch.

## AuditTrail

`AuditTrail` now requires children. Replace a self-closing call with `<AuditTrail store={store}><AuditTrailGrid /></AuditTrail>` and add the changes section and export control your layout needs.

The complete [Usage example](audit-trail.md#usage) exports `AuditChangesTable`. Save it as `audit-trail.tsx` outside `components/ui` and import that recipe to retain the selected-event and comparison presentation.

| Previous interface | Replacement |
|---|---|
| Self-closing root, including calls with only retained props | Required children. Compose `AuditTrailGrid` for the tape and `AuditChangesTable` for the changes. |
| `store`, `view`, `columns`, `time`, `value`, `labels`, selection and its callback | Keep them on `AuditTrail`. Columns serve the grid and CSV; the view also supplies the changes pane's order. |
| `label`, `selectionColumn`, `renderContextMenu`, sorting, filtering, column state, focus and other grid inputs on the root | Move them to `AuditTrailGrid`. The tape preset, multi-selection and default accessible name remain unchanged. |
| `pane={false}` | Omit `AuditTrailChanges` or the table recipe. |
| Root `onExport` and automatic export toolbar | Compose `AuditTrailExportButton onExport={onExport}` when export is available. The callback is required on the button. |
| Fixed pane layout | Use the `AuditTrailChanges` render callback or `useAuditTrailChanges()` in a descendant. Supply your title, empty state and collection markup. |
| Root `className` | Still styles the outer container. `AuditTrailGrid.className` styles its sizing wrapper. Give a separate wrapper a height when relocating the grid. |
| Inherited `selectionMode` | Removed. The grid still uses multi-selection. |

The root forwards native div props and refs. The changes scope forwards native section props and refs, and the export button uses your installed Button's props and composition support.

Keep the same extended event type on the root and grid when providing typed row callbacks. `useAuditTrailChanges()` exposes the base event fields; your root `value` formatter still receives the full typed event.

The table recipe preserves labels, field order, numeric typography and struck-through before values. Repeated changes to the same field remain separate entries.

It now uses native column and row headers and shows full field names and values instead of truncating them. Long content can wrap or scroll inside the changes section.

`data-audit-pane` stays on `AuditTrailChanges`, and `data-audit-export` stays on `AuditTrailExportButton`. The recipe now owns `data-audit-change`, `data-audit-from` and `data-audit-to` on native table rows and cells. Update selectors that depend on the former `dl`, `dt`, `dd` or nested `span` elements, and add these markers to custom markup when your tests need them.

To retain the former toolbar and side-by-side layout, use the shared `AuditChangesTable` recipe saved above:

```tsx
import { AuditTrail, AuditTrailExportButton, AuditTrailGrid, type AuditEvent } from "@/components/ui/audit-trail"
import type { RowStore } from "@/lib/row-store"
import { AuditChangesTable } from "./audit-trail"

export function OrderHistory({ store, onExport }: { store: RowStore<AuditEvent>; onExport?: (csv: string) => void }) {
  return <div className="h-72">
    <AuditTrail store={store}>
      {onExport && <div className="flex items-center justify-end gap-2">
        <AuditTrailExportButton onExport={onExport} />
      </div>}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-2">
        <AuditTrailGrid />
        <AuditChangesTable />
      </div>
    </AuditTrail>
  </div>
}
```

When omitting the changes section from the side-by-side recipe, remove its two-column wrapper too so `AuditTrailGrid` fills the available width.

Use the responsive layout in [Usage](audit-trail.md#usage) to stack the pane below the grid on narrow screens.

Selection, default columns, time/value formatting and cumulative calculations are retained, with one wording change: the changes column reads `Fields: {n}`, where v1 printed `{n} fields` in the grid, to screen readers, and in the CSV. Pass `labels={{ fields: "{n} fields" }}` to keep the old text, or hand the same `labels` to `auditTrailColumns` when you supply `columns` — root `labels` reach only the default columns. `foldChanges`, `diffEvents`, `formatAuditValue`, `auditTrailColumns` and `DEFAULT_AUDIT_TRAIL_LABELS` remain available.

Changes and CSV still use the supplied view or raw store order, independent of grid-local sorting and filtering. Keep selected ids within that view and retain the preceding history needed for comparisons. Column-state hiding and reordering do not affect CSV.

Each changes scope owns its subscriptions and shares one reading with all descendants. Export reads current snapshots at activation, without subscribing the root or controls to store updates. Custom controls can use `useAuditTrail().select(next)` and `useAuditTrail().exportCsv()`.

## InstrumentSearch

`InstrumentSearch` now requires children. Compose the command, input and result list explicitly, and add the recognition hint where your layout needs it. Save the complete [Usage recipe](instrument-search.md#usage) as `instrument-search.tsx` outside `components/ui` before copying this migration:

```tsx
import { InstrumentSearch, InstrumentSearchContent, InstrumentSearchInput, InstrumentSearchList, InstrumentSearchHint, type InstrumentSearchProps } from "@/components/ui/instrument-search"
import { InstrumentOptions } from "./instrument-search"

export function FindInstrument(props: Omit<InstrumentSearchProps, "children">) {
  return <InstrumentSearch {...props}>
    <InstrumentSearchContent>
      <InstrumentSearchInput />
      <InstrumentSearchList><InstrumentOptions /></InstrumentSearchList>
    </InstrumentSearchContent>
    <InstrumentSearchHint />
  </InstrumentSearch>
}
```

| Previous interface | Replacement |
|---|---|
| Self-closing root, including calls with only retained props | Required children with Content, Input and List. |
| Root `autoFocus` | `InstrumentSearchInput autoFocus`. |
| `showHint={false}` | Omit `InstrumentSearchHint`. |
| `renderHit(hit, hint)` | Write Item children; read `hint` with `useInstrumentSearchState`. |
| Private loading, empty and results group | Caller-owned recipe using shared `loading`, `hits`, `labels` and `emptyMessage`. |
| Root search, query, callbacks, limits and clear behavior | Keep them on the root. |

The Usage recipe preserves server order, matched identifiers, kind badges, recognition text and default labels. The existing Command and Badge dependencies remain installed. `useInstrumentSearch`, `toSymbolAdapter`, `matchedIdentifier`, labels and all `instrument-query` helpers remain available.

Content now names its field with `label`, defaulting to `"Instrument search"`. The released field referenced an empty label.

The empty List stays mounted to provide cmdk's expanded combobox with a valid target. Results still wait for the minimum query length, and blank layout dimensions are unchanged.

Same-query cache reuse is retained for the same search function. Replacing that function now removes its old hits immediately. Synchronous throws settle as empty results like rejected promises, and selection callbacks use the current committed props even when invoked from a child layout effect.

Define `search` at module scope or memoize it with `useCallback`. Its identity is now part of the stored result's key. An inline function passed to standalone `useInstrumentSearch` restarts on every answer, so results never become visible.

Use each primitive's supported props: Content `label` names the input, List `label` names its listbox, and the root owns query edits. cmdk-owned IDs, roles, ARIA and overwritten events are excluded from the corresponding part types.

Native root props and refs are now forwarded. Input and Item keep their command semantics.

## StatusBar

`StatusBar` now requires children. Place the environment, clocks, user and application content explicitly. The complete [Usage example](status-bar.md#usage) shows the ordinary strip; this recipe retains the former slot layout and maps its labels to the parts:

```tsx
import type { ReactNode } from "react"
import type { Clock } from "@/lib/clock"
import { StatusBar, StatusBarClocks, StatusBarClockReadout, StatusBarEnvironmentBadge, StatusBarUser, DEFAULT_STATUS_BAR_LABELS, type StatusBarClock, type StatusBarEnvironment, type StatusBarLabels } from "@/components/ui/status-bar"

export function TerminalStatus({ environment, clocks = [], user, left, center, right, clock, labels: overrides, className }: {
  environment?: StatusBarEnvironment
  clocks?: StatusBarClock[]
  user?: string
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  clock?: Clock
  labels?: Partial<StatusBarLabels>
  className?: string
}) {
  const labels = { ...DEFAULT_STATUS_BAR_LABELS, ...overrides }
  return <StatusBar aria-label={labels.title} data-environment={environment?.label} className={className}>
    {environment && <StatusBarEnvironmentBadge {...environment} prefix={labels.environment} />}
    {left !== undefined && <div className="flex shrink-0 items-center gap-2" data-status-slot="left">{left}</div>}
    <div className="flex min-w-4 flex-1 items-center justify-center gap-2" data-status-slot="center">{center}</div>
    {clocks.length > 0 && <StatusBarClocks aria-label={labels.clocks}>
      {clocks.map((entry) => <StatusBarClockReadout key={`${entry.label}|${entry.zone}`} {...entry} source={clock} />)}
    </StatusBarClocks>}
    {user && <StatusBarUser user={user} prefix={labels.user} />}
    {right !== undefined && <div className="flex shrink-0 items-center gap-2" data-status-slot="right">{right}</div>}
  </StatusBar>
}
```

Install `status-bar` before copying this recipe; its installation includes `lib/clock.ts`. Save the recipe outside `components/ui`.

| Previous interface | Replacement |
|---|---|
| Self-closing root, including `<StatusBar />` and class-only calls | Required children; use `children={null}` for an intentionally empty container. |
| `environment` | `StatusBarEnvironmentBadge` with `label` and optional `tone`. |
| `clocks` | Map descriptors into `StatusBarClockReadout` inside `StatusBarClocks`. |
| `clock` | Pass `source` to each readout that uses the custom clock. |
| `user` | Conditionally render `StatusBarUser user={user}`. |
| `left`, `center`, `right` | Caller-owned content, wrappers and spacer. |
| `labels` | Group `aria-label` and environment/user `prefix`. |
| Root `className` | Retained; native props and refs are also forwarded. |

The recipe retains the original order, center spacer, nonempty clock group, truthy user condition, and left/right wrappers for any value other than `undefined`. It also retains `data-environment` and the left/center/right `data-status-slot` markers, which are now caller-owned. Public readings preserve their environment, tone, user, clock and time markers.

Explicit `undefined` values for `labels.environment` or `labels.user` now use the default prefixes. The released root let them erase prefix text and could print `undefined` in the user tooltip. Empty strings still leave the prefix text empty; set a part's native `title` to customize its tooltip.

Each clock readout retains its local subscription, including when used outside the root. Default readings share one timer; a custom source still changes formatting and timestamps on its own cadence.

Use stable keys when reordering clock descriptors. The helpers, tone classes, descriptor types and default labels remain available.

## ColumnChooser

`ColumnChooser` now requires `children`. Compose its controls inside your own Dialog.

Copy the complete [Usage example](column-chooser.md#usage) into `column-chooser.tsx` outside `components/ui`. It exports `ColumnSettingsPanel`, `ColumnSettingsDialog`, and `ColumnSettings`. The install includes the dialog primitive.

| Previous interface | Replacement |
|---|---|
| Self-closing `ColumnChooser` | Your Dialog containing a composed `ColumnChooser`. The shared `ColumnSettingsDialog` recipe retains the ordinary layout. |
| `ColumnChooserPanel`, `ColumnChooserPanelProps<T>` | `ColumnChooser`, `ColumnChooserProps<T>` with required `children`. Use the shared `ColumnSettingsPanel` recipe for the ordinary list. |
| `open`, `onOpenChange` | Move them to your Dialog. Use `DialogTrigger` for a button opener, or set the grid as the close-focus target for a menu or hotkey opener. Mount the chooser inside `DialogContent` to reset search on a completed close. |
| Dialog `className` | Move it to `DialogContent`. Root classes now style the inline group. |
| Automatic toolbar, list, empty state, and hint | Compose these around `useColumnChooser().shown` and the public parts. |
| Private row | `ColumnChooserItem columnKey={key}` with required children, inside your `li` or card. Keep keys stable. |
| Visibility, column name, frozen and rule badges, width | `ColumnChooserVisibility`, `ColumnChooserName`, `ColumnChooserFrozen`, `ColumnChooserRule`, and `ColumnChooserWidth`. |
| Reset and move controls | `ColumnChooserResetAll`, `ColumnChooserResetWidth`, and `ColumnChooserMove`, with required action content. |
| Labels for surrounding content | Read `useColumnChooser().labels` for the description, empty state, action content, and hint. |
| Full-order keyboard and button moves | Neighbors follow the search results by default. Pass `presented` for a custom collection. Pure move helpers retain full-order semantics. |
| A Tab stop on every item and control | One Tab stop for the collection. Up and Down move focus between columns, Home and End reach its edges, Space toggles visibility and Delete resets a width where the item renders the matching control, and Alt+Home or Alt+End moves a column to the edge of its side. Pass `tabIndex={0}` to a part or item to restore its own Tab stop. |
| Reset to empty state | Pass shared defaults as `baseState`. Root reset, width reset and `isDefault` use that baseline; omission retains the empty baseline. |
| Silent edits | Mount `ColumnChooserAnnouncer` once to announce accepted changes. The shared recipes include it. |

The `data-column`, `data-visible`, `data-frozen`, and `data-dragging` markers now belong to `ColumnChooserItem`, not its caller-owned `li`. Update selectors such as `li[data-column]` to `[data-column]`.

The keyboard model scales to wide grids: visibility, move, and width-reset controls default to `tabIndex={-1}`, so a hundred columns tab past as one stop instead of four hundred. The controls remain pointer targets, the same commands run on the focused item, and `useColumnChooserItem` adds `moveToEdge`. A test that tabbed to a checkbox or move button now focuses the item and sends the key instead. The default `dragHint` text names the new keys; a custom `labels.dragHint` keeps your wording.

For a minimal inline replacement, install ColumnChooser and copy the shared file first:

```tsx
import { useState } from "react"
import { ColumnSettingsPanel } from "./column-chooser"
import { EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"

const columns: ColumnDef<{ id: string }>[] = [{ key: "id", header: "RFQ", width: 80, accessor: (row) => row.id }]

export function QuoteColumns() {
  const [columnState, setColumnState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
  return <ColumnSettingsPanel columns={columns} columnState={columnState} onColumnStateChange={setColumnState} />
}
```

The pure helpers, `ChooserRow<T>`, label type, and default labels remain exported with their previous semantics. Root commands now compare effective settings: no-op commands emit nothing, and edits normalize equivalent baseline settings and remove retired keys. Definition-hidden settings are retained. Initialize `columnState` from your defaults; `baseState` is the reset target, not an overlay applied to the grid.

Pass the same `baseState` to DataGrid to align its header-menu reset with the chooser. DataGrid also uses it once to initialize uncontrolled columns. Later defaults changes leave current settings untouched until reset; existing calls without `baseState` retain the empty defaults.

For a menu opener, copy the shared file first. This complete example uses Base UI's `finalFocus` to return to the grid. The grid's wrapper supplies the DOM target; `DataGrid` has no DOM-ref prop.

```tsx
import { useRef, useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { DataGrid, EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"
import { createRowStore } from "@/lib/row-store"
import { ColumnSettingsDialog } from "./column-chooser"

type Quote = { id: string; symbol: string }
const columns: ColumnDef<Quote>[] = [{ key: "symbol", header: "Symbol", width: 120, accessor: (row) => row.symbol }]

export function QuoteColumnsFromMenu() {
  const [store] = useState(() => {
    const rows = createRowStore<Quote>({ getRowId: (row) => row.id })
    rows.applyDeltas({ upsert: [{ id: "1", symbol: "UST 10Y" }] })
    return rows
  })
  const [columnState, setColumnState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
  const [open, setOpen] = useState(false)
  const grid = useRef<HTMLDivElement>(null)
  return <>
    <div ref={grid} className="h-48">
      <DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} label="Quotes" renderContextMenu={() => <ContextMenuItem onClick={() => setOpen(true)}>Columns…</ContextMenuItem>} />
    </div>
    <ColumnSettingsDialog open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} contentProps={{ finalFocus: () => grid.current?.querySelector<HTMLElement>("[role=grid]") ?? false }} children={null} />
  </>
}
```

On Radix installs, replace `contentProps` in that example with the following close-focus handler. Without a `DialogTrigger`, Radix's default close handler has no return target and suppresses the previous-focus fallback.

```tsx
contentProps={{ onCloseAutoFocus: (event) => {
  event.preventDefault()
  grid.current?.querySelector<HTMLElement>("[role=grid]")?.focus()
} }}
```

Keep the return target mounted for dismissal. Test the context-menu close, dialog open, Escape and grid keyboard sequence with your installed primitive; trigger and menu openers have different focus ownership.

The parts add native props, refs, names, and event handlers. Supply your action content and surrounding Dialog.

Items are named groups inside your collection. A focus target that becomes hidden, disabled, or removed falls back to its item, search, or root.

Drag sessions reject foreign and cross-chooser drops, accept empty string column keys, and clear when their source disappears. These correct the released drag and focus defects.

## SessionGuard

Replace `SessionGuard` with `SessionGuardProvider` and compose its warning, dialog and actions. The old export and `SessionGuardProps` are removed: their `children` meant authentication content, whereas provider children own the whole composition.

For the ordinary layout, copy the complete [Usage example](session-guard.md#usage) into `session-guard.tsx` outside `components/ui`. It exports `SessionNotice`, which uses the public parts and the installed Dialog. The SessionGuard installation includes Button and Dialog.

| Previous interface | Replacement |
|---|---|
| `<SessionGuard expiresAt={...} onReauthenticate={...} />` | A composed `SessionGuardProvider`, or the shared `SessionNotice` recipe with a persistent `fallbackFocusRef`. |
| `SessionGuardProps` | `SessionGuardProviderProps` for coordination; `SessionNoticeProps` from the copied recipe for the ordinary layout. |
| Authentication `children` | Children inside `SessionGuardDialog`, or the shared recipe's children. Provider children now own all markup. |
| Root `className` | Classes on caller-owned layout. The shared recipe retains the old block/contents wrapper behavior. Style the warning through `SessionGuardWarning.className`. |
| Automatic warning sentence and countdown | `SessionGuardWarningText`, or custom content with `SessionGuardRemaining`. |
| Automatic buttons and failure text | `SessionGuardReauthenticate`, `SessionGuardActionLabel` and `SessionGuardError`, placed by the caller. |
| Private pending/request state | `useSessionGuard()` for custom controls sharing one request. |
| Automatic dialog heading and description | Installed `DialogTitle` and `DialogDescription` inside `SessionGuardDialog`. |
| Implicit close focus | Required `fallbackFocusRef` to a persistent focusable application control; native restoration takes precedence when it succeeds. |
| Root `data-slot="tradecn-session-guard"` | The conditional `SessionGuardWarning` owns this slot. The recipe's always-mounted wrapper retains `data-session-phase`. |
| Warning's nested `tradecn-countdown` slot | `tradecn-session-guard-remaining`; `data-tier` and `data-countdown-digits` remain. |
| `data-session-extend` / `data-session-reauthenticate` | Both actions use `data-slot="tradecn-session-guard-reauthenticate"`. Add caller-owned attributes when distinguishing warning and dialog actions. |

This complete replacement uses only installed parts. Keep the draft mounted, name the dialog and update application expiry after a successful sign-in:

```tsx
import { useRef, useState } from "react"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SessionGuardActionLabel, SessionGuardDialog, SessionGuardError, SessionGuardProvider, SessionGuardReauthenticate, SessionGuardWarning, SessionGuardWarningText, useSessionGuard } from "@/components/ui/session-guard"

export function SessionDraft({ renew }: { renew: () => Promise<number | null> }) {
  const [expiresAt, setExpiresAt] = useState<number | null>(0)
  const draft = useRef<HTMLTextAreaElement>(null)
  return <SessionGuardProvider expiresAt={expiresAt} onReauthenticate={async () => {
    const expiry = await renew()
    if (expiry === null) return false
    setExpiresAt(expiry)
    return true
  }}>
    <label>Draft<textarea ref={draft} /></label>
    <SessionGuardWarning>
      <SessionGuardWarningText />
      <SessionGuardReauthenticate><SessionGuardActionLabel /></SessionGuardReauthenticate>
      <SessionGuardError />
    </SessionGuardWarning>
    <SessionGuardDialog fallbackFocusRef={draft}>
      <DialogTitle>Your session has ended</DialogTitle>
      <DialogDescription>Sign in to continue editing this draft.</DialogDescription>
      <SignInAction />
      <SessionGuardError />
    </SessionGuardDialog>
  </SessionGuardProvider>
}

function SignInAction() {
  const { pending, labels } = useSessionGuard()
  return <SessionGuardReauthenticate>{pending ? labels.pending : labels.reauthenticate}</SessionGuardReauthenticate>
}
```

`SessionStatus`, `useSessionStatus`, `sessionStatus`, phase/status/options types and label constants keep their APIs, with one accessibility change: the readout's spoken sentence moved from an `aria-label` on a generic span into visually hidden text, read as ordinary content wherever the readout is read. A selector or query built on the old accessible name — `[aria-label^="Session:"]` or `getByLabelText("Session: …")` — no longer matches, and an exact match on the readout's visible text now sees the hidden sentence first; select the readout by `[data-session-status]` and match its text with the sentence included. `expiresAt`, `warnMs`, `clock`, `labels` and `onExpire` move to the provider with the same phase and callback semantics. Ordinary clock ticks update time readings locally.

Requests survive phase, expiry, clock and callback changes. Returning `true` alone does not renew the session; the application still updates `expiresAt`. A late refusal after recovery can set failure again.

Unmounting a provider isolates its completion from a new provider but does not cancel application work.

`SessionGuardDialog` reserves open/modal control, forced mounting, the close button and final-focus overrides. Use its native content props for styling, refs and events; use the hook when replacing the whole dialog.

Keep the fallback target outside conditional content. Surrounding drafts remain mounted, while authentication fields inside the dialog follow the installed primitive's normal close lifecycle.

## Workspace

Existing `Workspace` calls keep the title-and-close tab, panel API and version-1 saved layouts. No API migration is required.

Closing a tab with its standalone close button now dismisses the overflow popup. Refresh the installed Workspace CSS: floating groups now use the theme's base z-index of `30` instead of Dockview's fallback `999`. Put custom `--dv-overlay-z-index` values on `.dockview-theme-tradecn`, where floating containers inherit them.

You can add `tabComponent` when you want to arrange tab contents or replace its actions:

```tsx
import { Workspace, WorkspaceTab, WorkspaceTabClose, WorkspaceTabTitle } from "@/components/ui/workspace"

const PANELS = { notes: () => <p>Desk notes.</p> }

function NotesTab() {
  return <WorkspaceTab><WorkspaceTabClose>×</WorkspaceTabClose><WorkspaceTabTitle /></WorkspaceTab>
}

export function NotesWorkspace() {
  return <Workspace
    className="h-64"
    panels={PANELS}
    tabComponent={NotesTab}
    seed={(api) => { api.addPanel({ kind: "notes", title: "Notes" }) }}
  />
}
```

Keep the tab component identity stable. Put custom controls inside `WorkspaceTabActions` to retain their focus and prevent tab dragging. Use `useWorkspaceTab` to share the panel's state and commands.

Tab parts accept native props and refs, and Workspace now forwards its outer div ref.

Dockview still owns the outer tab's accessible name, selection, focus navigation and keyboard closing. Use `setTitle` to rename it. Removing a close button does not disable other close paths.

Popout tab clicks and `focusPanel` now focus the adopted panel body correctly. See the [Workspace reference](workspace.md) for composition, overflow and window limits.

## Sparkline

Existing `Sparkline` calls keep their props and markup. No API migration is required.

Up and Down now move the crosshair one reading, matching Right and Left. An interactive sparkline claims them with `preventDefault`, with or without Shift, so handlers above it that respect `defaultPrevented` no longer act on them while it has focus; a `shift+up` binding that fired from a focused version-1 sparkline no longer does.

Ctrl, Cmd, and Alt chords now pass through untouched. Version 1 claimed Left, Right, PageUp, PageDown, Home, End, and Escape even with one of those modifiers held, so an `alt+left` binding never fired from a focused sparkline; now it does.

A caller `ref` now receives the root element. Version 1 replaced it with the component's own measurement ref: an object ref stayed `null`, and a callback ref was never called.
