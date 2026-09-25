# FeedHealth

Display connection state, data age and lane health. Pass feeds to the root and compose their readings, tooltips and controls from public parts.

## Usage

```tsx
import {
  FeedHealth,
  FeedHealthList,
  FeedHealthItem,
  FeedHealthIndicator,
  FeedHealthTier,
  FeedAge,
  FeedHealthTooltipTrigger,
  FeedHealthTooltipContent,
  FeedHealthDetails,
  FeedHealthAnnouncer,
  type FeedDescriptor,
} from "@/components/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"
```

```tsx
const feeds: FeedDescriptor[] = [
  {
    id: "md",
    label: "Market data",
    state: "connected",
    lane: "coalesced",
    lastMessageAt: Date.now(),
  },
]

export function MarketDataHealth() {
  return (
    <FeedHealth feeds={feeds} className="w-fit max-w-full">
      <FeedHealthList className="flex-wrap">
        {(feed) => (
          <FeedHealthItem feed={feed}>
            <Tooltip>
              <FeedHealthTooltipTrigger>
                <span className="font-medium">{feed.label}</span>
                <FeedHealthIndicator className="order-first" />
                <FeedHealthTier />
                <FeedAge feed={feed} />
              </FeedHealthTooltipTrigger>
              <FeedHealthTooltipContent>
                <FeedHealthDetails />
              </FeedHealthTooltipContent>
            </Tooltip>
          </FeedHealthItem>
        )}
      </FeedHealthList>
      <FeedHealthAnnouncer />
    </FeedHealth>
  )
}
```


The sample timestamp is set at module load. Its connected feed becomes aging after two seconds and stale after ten, on the next clock tick. Replace descriptors as real messages arrive; this component does not connect feeds or publish messages.

## Composition

```text
FeedHealth (feeds)
├── FeedHealthList (children(feed, index))
│   └── FeedHealthItem
│       ├── Tooltip (optional)
│       │   ├── FeedHealthTooltipTrigger
│       │   │   ├── Caller label and FeedHealthIndicator
│       │   │   ├── FeedHealthTier and FeedAge
│       │   │   └── FeedHealthLane and FeedHealthPending
│       │   └── FeedHealthTooltipContent
│       │       └── FeedHealthDetails
│       └── Caller controls using useFeedActions
├── FeedHealthEmpty (optional caller content)
└── FeedHealthAnnouncer (one per collection)
```

## Empty collection

Toggle Include market data to switch between no feeds and an offline feed. `FeedHealthEmpty` shows your message for `feeds={[]}`. The checkbox stays mounted so focus survives either change.

<!-- demo: feed-health-empty -->

## Lanes and compact display

Install `separator` for this layout. This example shows coalesced drops and an ordered gap, with a fixed clock for the gap age. Close RFQ gap removes the report. Compact hides the tier badge with `sr-only`, keeping its word available to assistive technology.

<!-- demo: feed-health-lanes -->

## Actions and replies

Install `dropdown-menu`. Reconnect receives a simulated reply after 1.2 seconds and becomes Resubscribe. Resubscribing advances the sequence without changing connection state, then removes all actions. Reopen the menu while it is pending to try empty-menu dismissal. Disconnect RFQ resets the sample.

<!-- demo: feed-health-actions -->

## A card with inline controls

Install `button`. This layout puts metadata inline, application fields in the details, and actions and navigation in the footer. Pending buttons use `aria-disabled` to keep focus; removing a focused button returns focus to the heading. Resubscribe remains available in this recipe.

<!-- demo: feed-health-card -->

## API Reference

Parts forward their underlying element's props, refs, `className` and events. Children are caller-owned except where a part supplies defaults below; the list takes a callback and the announcer excludes children.

### Group and item

`FeedHealth` and `FeedHealthItem` render divs. The root supplies options and the tooltip provider; nested roots inherit omitted options but own their collections.

| Root prop | Type | Default | Purpose |
|---|---|---|---|
| `feeds` | `readonly FeedDescriptor[]` | Required | Collection for lists, empty content and announcements. Use `[]` for none. |
| `children` | `ReactNode` | — | Your composition. |
| `thresholds` | `StalenessThresholds` | `PROVISIONAL_THRESHOLDS` | Age boundaries. |
| `session` | `SessionCalendar` | `alwaysOpen` | Session used for tiering. |
| `clock` | `Clock` | Shared clock | Time source. |
| `className` | `string` | — | Override the horizontal flex layout. Text size is inherited. |

Omitting `feeds` is a type error and throws at runtime. A direct single-item layout still needs `feeds={[feed]}` on the root. Filter or limit this array before passing it. The group's default name is `Feed health`; override it with `aria-label` or `aria-labelledby`.

| Item prop | Type | Default | Purpose |
|---|---|---|---|
| `feed` | `FeedDescriptor` | Required | This item's readings. |
| `pending` | `PendingFeedAction \| null` | — | Request state from `useFeedActions`. |

The item sets small text and `data-feed`, `data-state`, `data-tier`, `data-pending`. Tier colors belong to the badge and tooltip trigger, leaving application content untinted.

### FeedHealthList

Renders a div from the nearest root's feeds, keyed by `feed.id`. Keep ids unique and stable: matching ids preserve row state through reordering or replacement; removing an id unmounts its row. Put hooks in a row component returned by the callback.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `children` | `(feed: FeedDescriptor, index: number) => ReactNode` | Required | Row JSX in collection order; use the index for separators. |
| `className` | `string` | — | Arrange rows with `flex-wrap`, column or grid classes. Default is horizontal flex. |

Multiple lists may share a collection; mount one announcer outside them. An empty list still renders its container. The list owns no action state and throws outside `FeedHealth`.

### FeedHealthEmpty

A div shown only when the nearest root's collection is empty. Offline feeds are nonempty. It supplies muted small text, no default content, live region or focus management, and throws outside `FeedHealth`. Place it beside the list; an empty list never calls its row callback. Keep a focus target mounted when removing rows with focused controls or open menus.

### Readings

These parts require `FeedHealthItem`. Indicator, Tier, Lane and Pending use default text only when `children` is omitted or `undefined`; `null` or `false` suppresses that text. Keep a non-color cue when replacing indicator or tier content.

| Part | Element and content |
|---|---|
| `FeedHealthIndicator` | `span`: dot and screen-reader connection-state word. Children replace the word. |
| `FeedHealthTier` | `Badge`: tier word. Use `className="sr-only"` for compact display. |
| `FeedHealthLane` | `span`: nonzero coalesced drops or ordered gap age, replay spinner and accessible replay/open word. With omitted children, no data renders nothing. |
| `FeedHealthDetails` | `dl`: state, tier, local last-message time and lane metadata. Children append `dt`/`dd` pairs, such as a pending label. |
| `FeedHealthPending` | `span`: spinner and action id while pending. Pass `pendingLabel` as children for the action label. |
| `FeedHealthTooltipTrigger` | `TooltipTrigger`: children, tier color, focus style and description link. |
| `FeedHealthTooltipContent` | `TooltipContent`: children, matching id and tooltip role. |

Put the tooltip pair inside your shadcn `Tooltip` and `FeedHealth` provider. Preserve their matching id/description attributes when overriding props. Put the label first for its accessible name; `order-first` places the indicator visually first. Details can also be inline or replaced with your own markup.

### FeedAge

A span that also works outside an item. It defaults to `aria-hidden` so age ticks are not read aloud. Custom children replace the formatted age, including explicit `null` or `false`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `feed` | `FeedDescriptor` | Required | Last-message timestamp. |
| `clock` | `Clock` | Group, then shared clock | Time source. |
| `children` | `ReactNode` | Formatted age | Replacement content. |

Future timestamps clamp to zero. `formatAge(ms)` returns `now` below one second, then whole seconds, minutes or hours (`12s`, `3m`, `2h`); null and nonfinite input display `–`.

### Feeds

`FeedDescriptor` describes data supplied by your integration. FeedHealth does not detect gaps or replay messages.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Identity for rows, requests and announcements. |
| `label` | `string` | Required | Feed name. |
| `state` | `FeedState` | Required | `"connected"`, `"connecting"`, `"disconnected"` or `"unknown"`. |
| `lane` | `FeedLane` | Required | `"coalesced"` or `"ordered"`. |
| `lastMessageAt` | `number \| null` | Required | Epoch milliseconds; null means no timestamp. |
| `dropped` | `number` | — | Cumulative coalesced drop count. Details default to zero; Lane shows nonzero counts. |
| `seq` | `number` | — | Last applied sequence, shown in ordered-lane details. |
| `gap` | `{ since: number; replaying: boolean } \| null` | — | Open gap; `since` is epoch milliseconds. Omit or use null for none. |
| `allowedActions` | `readonly string[]` | — | Allowed action ids; omitted or empty allows none. |

### Tiers

`stalenessTier(feed, now, thresholds?, session?)` is pure and uses the component's defaults. First matching condition wins:

| Tier | Condition |
|---|---|
| `offline` | Disconnected, regardless of session. |
| `closed` | Session is closed or holiday. |
| `aging` | No message timestamp. |
| `live` | Age < `agingMs`. |
| `aging` | Age < `staleMs`. |
| `stale` | Otherwise. |

Equality reaches the next tier. Connecting and unknown feeds follow the same age rules as connected feeds; drops and gaps do not affect tiers.

### Lanes

Coalesced lanes count dropped stale ticks; ordered lanes must not drop messages and report gap age and replay status. Details show gap status whenever `gap` exists, even for a coalesced lane.

For [`row-store`](row-store.md)'s `useStoreMeta`, map `lane`, `dropped`, `lastBatchAt` → `lastMessageAt`, and `seq ?? undefined`. Supply identity, label and connection state. Its boolean `gap` needs an opening timestamp and replay state from your integration.

### Thresholds and the session

`StalenessThresholds` requires both numeric millisecond values: `agingMs` and `staleMs`. `PROVISIONAL_THRESHOLDS` is `{ agingMs: 2000, staleMs: 10_000 }`. Agree real boundaries with users and supply `0 <= agingMs < staleMs`; the component does not validate or reorder them.

`SessionCalendar.status(now)` receives epoch milliseconds and returns `"open"`, `"closed"`, `"pre"`, `"post"` or `"holiday"`. Pre/post still age normally. [`session-calendar`](session-calendar.md) builds calendars from sessions, holidays and early closes in the venue's zone.

### Actions

`useFeedActions(feed, actions, options?)` takes a `FeedDescriptor` and `readonly FeedAction[]`. It owns pending state without subscribing to the clock. Use one owner per feed and share its result between views. Outside the group, pass its custom clock explicitly.

| Option | Type | Default | Purpose |
|---|---|---|---|
| `pendingMs` | `number` | `5000` | Timeout in milliseconds; changes affect future presses. |
| `clock` | `Clock` | Group, then shared clock | Press timestamp. Timeout uses `setTimeout`. |

| Returned value | Type | Purpose |
|---|---|---|
| `actions` | `FeedAction[]` | Allowed actions in caller order. |
| `pending` | `PendingFeedAction \| null` | Action id, connection state at press and `since` timestamp; pass to the item. |
| `pendingLabel` | `string \| undefined` | Action label, or id if its definition disappeared. |
| `run` | `(actionId: string) => void` | Rechecks definitions and permissions; blocks duplicate presses while pending. |

| FeedAction field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Distinct id matching `allowedActions`. |
| `label` | `string` | Required | Control text and pending label. |
| `run` | `(feed: FeedDescriptor) => void \| Promise<unknown>` | Required | Receives the latest committed descriptor. |
| `destructive` | `boolean` | — | Metadata for caller styling or confirmation. |

`feedActionsFor(feed, actions)` is the pure filter, preserving order and labels. Missing actions or allowed ids yields none.

Pending clears on state/id change, promise settlement, a synchronous throw, timeout or effect cleanup (unmount or Activity/Suspense hiding). Returning void or changing permissions does not clear it; an older request cannot clear a newer one. Clearing pending does not cancel the request. Keep the hook owner outside a hidden boundary to preserve pending and duplicate protection there.

The action hook does not change the tier. Errors and rejections are caught but not displayed; report failures yourself. Return your request's promise and update the descriptor from its reply.

Disable pending controls; `aria-disabled` preserves inline-button focus while the hook blocks duplicates. The hook manages no menus or focus. Use `useFeedActionMenu` for menus or a persistent fallback for disappearing buttons, as in the card. Use `feed.id` keys when mapping rows yourself.

### Action-menu focus

`useFeedActionMenu({ hasActions, fallbackRef })` needs neither FeedHealth context nor `useFeedActions` and imports no menu primitive.

| Option | Type | Default | Purpose |
|---|---|---|---|
| `hasActions` | `boolean` | Required | Usually `actions.length > 0` from `useFeedActions`. |
| `fallbackRef` | `RefObject<HTMLElement \| null>` | Required | Persistent focusable target in the same document, outside the menu. |

| Returned value | Type | Purpose |
|---|---|---|
| `mounted` | `boolean` | Render the menu while actions exist, its trigger is focused, or it is open/finishing dismissal. |
| `menuProps` | `{ open: boolean; onOpenChange(open: boolean): void }` | Spread onto `DropdownMenu`. |
| `triggerProps` | `{ ref: RefObject<HTMLButtonElement \| null>; onFocus(): void; onBlur(): void }` | Spread onto `DropdownMenuTrigger`. |
| `contentProps` | `{ ref: RefObject<HTMLDivElement \| null> }` | Spread onto `DropdownMenuContent`. |

Compose your own refs/focus handlers with the returned ones. Supply empty-menu content and disabled/destructive styling. A reading button or heading with `tabIndex={-1}` can be the fallback.

When actions disappear, a focused trigger stays until focus leaves; an open menu stays until dismissed. Deferred recovery moves lost focus, or focus still on the disappearing menu, to the fallback. It preserves deliberate destinations and does not take focus from another document. Reopening or unmounting cancels recovery. Keyboard behavior belongs to the primitive: Base moves on Tab; Radix keeps the menu open.

### Announcements and clock

`FeedHealthAnnouncer` is a span with a polite, atomic live region and no `children` prop. Mount once per collection, including when several lists display it.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `feeds` | `readonly FeedDescriptor[]` | Root collection | Override the collection; required outside a root. |
| `thresholds` | `StalenessThresholds` | Inherited | Match the readings' age boundaries. |
| `session` | `SessionCalendar` | Inherited | Match the readings' session. |
| `clock` | `Clock` | Inherited | Match the readings' time source. |

It initializes empty, then batches additions and tier changes; aging/stale messages include the age. Age-only ticks, label changes, reordering and removals leave the last message unchanged. Repeated wording still inserts a new message node. An idle clock refreshing on subscription can produce a tier change during mounting.

Only items, ages and announcers subscribe; ticks do not rerender the root, list callback or their parents. The shared one-second interval stops after its last subscriber leaves and is shared with other ticking components.

`createClock(intervalMs = 1000, source = Date.now)` returns a `Clock` with `now(): number` and `subscribe(cb): () => void`. It caches epoch milliseconds between ticks and refreshes on the first subscription after inactivity. Optional `sample(): number` reads the source without changing the snapshot or starting a timer. Action timestamps use `sample()` when available, otherwise `now()`.

### Installed primitives

Includes `badge`, `spinner`, `tooltip`, the shared clock, and missing `stale`/`up` tokens. Add `separator`, `dropdown-menu` or `button` for layouts that use them.

Updating from the closed widget? See the [FeedHealth migration guide](migrating-v1-to-v2.md#feedhealth).
