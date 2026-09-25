# FeedHealth

Compose feed readings from public parts. You own the rows, labels, tooltips, controls and collection order; each item keeps its tier current, and a separate announcer reports transitions.

## Usage

```tsx
import { useState } from "react"
import { FeedHealth, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthAnnouncer, type FeedDescriptor } from "@/components/ui/feed-health"
import { Tooltip } from "@/components/ui/tooltip"

function MarketDataHealth() {
  const [lastMessageAt, setLastMessageAt] = useState(Date.now)
  const feed: FeedDescriptor = { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt }
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setLastMessageAt(Date.now())}>Receive a message</button>
      </div>
      <FeedHealth thresholds={{ agingMs: 2000, staleMs: 10_000 }} className="w-fit max-w-full flex-wrap">
        <FeedHealthItem feed={feed}>
          <Tooltip>
            <FeedHealthTooltipTrigger>
              <span className="font-medium">{feed.label}</span><FeedHealthIndicator className="order-first" />
              <FeedHealthTier />
              <FeedAge feed={feed} />
            </FeedHealthTooltipTrigger>
            <FeedHealthTooltipContent><FeedHealthDetails /></FeedHealthTooltipContent>
          </Tooltip>
        </FeedHealthItem>
        <FeedHealthAnnouncer feeds={[feed]} />
      </FeedHealth>
    </>
  )
}
```

The connection stays connected while its data ages. Without another message, the tier becomes aging at two seconds and stale at ten seconds, on the shared clock's next tick. Receive a message supplies a new timestamp and makes it live again.

These thresholds are sample values. Agree real boundaries with the people using the data, then pass both values. The component reads descriptors from your integration; it does not connect or publish messages. The clock starts and stops with subscribers.

`FeedHealthItem` accepts your JSX. Use `FeedHealthTooltipTrigger` and `FeedHealthTooltipContent` together inside your shadcn `Tooltip` for a keyboard-accessible description. `FeedHealth` supplies the tooltip provider. Put one `FeedHealthAnnouncer` in the collection, including when you show the same feeds in several places.

## Composition

```text
FeedHealth
├── FeedHealthItem (one per feed)
│   ├── Tooltip (optional)
│   │   ├── FeedHealthTooltipTrigger
│   │   │   ├── Caller label and FeedHealthIndicator
│   │   │   ├── FeedHealthTier and FeedAge
│   │   │   └── FeedHealthLane and FeedHealthPending
│   │   └── FeedHealthTooltipContent
│   │       └── FeedHealthDetails
│   └── Caller controls using useFeedActions
└── FeedHealthAnnouncer (one per collection)
```

Place readings, details and controls in your own layout. The card below keeps metadata inline and puts buttons in its footer. Put the visible label first in the trigger's children so its accessible name starts with that label; `order-first` keeps the indicator visually first.

## Lanes and compact display

Install `separator` for this composition. The caller maps the feeds in order and adds separators between them.

Coalesced market data reports seven dropped updates. The ordered RFQ feed reports sequence 42 in its tooltip and a three-second gap while replay is in progress. Close RFQ gap removes the report; open it to restore the sample. Drops and gaps do not change either feed's live tier.

The clock is fixed at a sample instant so the readings stay comparable. Compact applies `sr-only` to the tier badge, preserving its word for assistive technology. The state indicator also includes its connection state as text. Hover or focus a feed to read its tooltip.

<!-- demo: feed-health-lanes -->

## Actions and replies

Install `dropdown-menu` for this composition. `useFeedActions` returns the currently allowed actions, pending state, a pending label and `run(actionId)`. You choose the menu, labels and placement.

Open Actions: RFQ and choose Reconnect. The feed stays offline while pending. A simulated reply arrives after 1.2 seconds, marks it connected and supplies a timestamp. The allowed action then becomes Resubscribe, which advances the sequence without changing the connection state. Its reply removes all allowed actions. The recipe retains a focused or open menu trigger through that update; an open menu shows a disabled “No actions available.” item and closing it returns focus to the feed reading. Reopen the menu while Resubscribe is pending to try that path.

The request returns a promise, so pending clears even when the reply leaves the state unchanged. Disconnect RFQ resets the sample and is disabled while a reply is pending. The reply timer is cleared on unmount. Return the server request's promise in your integration and update the descriptor from its response; report failures yourself.

<!-- demo: feed-health-actions -->

## A card with inline controls

Install `button` for this layout. The same item and action hook support a card: metadata stays visible, application fields join the details, and action buttons sit in the footer. The caller also supplies a navigation link. There is no tooltip or menu in this composition.

The card uses `aria-disabled` while pending so its focused button stays focusable; the hook blocks duplicate execution. A stable callback ref moves focus to the card heading when a focused action is removed. If the action remains or the user moves focus elsewhere, focus stays there. The simulated reply replaces Reconnect with Resubscribe; later resubscriptions keep that button. Give each feed one action-hook owner and pass its result to multiple views when they should share pending state. Mount one announcer for those views.

<!-- demo: feed-health-card -->

## API Reference

### Group and item

Both accept native `div` props, children, refs, classes and events. The options below belong to `FeedHealth`; items inherit them from their group. A nested group inherits omitted options from its parent. The root has no collection state and does not subscribe to the clock.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `children` | `ReactNode` | — | Your rows, readings, application content and announcer. |
| `thresholds` | `StalenessThresholds` | `PROVISIONAL_THRESHOLDS` | Age boundaries in milliseconds. |
| `session` | `SessionCalendar` | `alwaysOpen` | Session used for tiering. |
| `clock` | `Clock` | Shared clock | Time source for tiers and descendant readings. |
| `className` | `string` | — | Extends the default inline layout. Use grid or column classes for another arrangement. |

`FeedHealth` renders a group named `Feed health`; supply `aria-label` or `aria-labelledby` to name it yourself. It inherits the caller’s text size and supplies no rows, separators, empty state, controls or announcements. Map collections with stable feed ids as keys, and keep any empty-state text at the call site.

`FeedHealthItem` requires `feed: FeedDescriptor` and optionally accepts `pending: PendingFeedAction | null`. Its `data-feed`, `data-state`, `data-tier` and `data-pending` attributes describe that item. It sets the reading text size but does not tint caller content. Tier colors belong to `FeedHealthTier` and `FeedHealthTooltipTrigger`. Mount it inside `FeedHealth` when using tooltips so either primitive base receives its provider.

### Readings

These parts read the nearest item's descriptor and tier. They accept children and the underlying element's props and ref. `FeedHealthIndicator`, `FeedHealthTier`, `FeedHealthLane`, `FeedHealthPending` and `FeedAge` use their default content only when `children` is omitted or `undefined`; explicit `null` or `false` replaces that content with nothing. `FeedHealthDetails` always renders its metadata and appends any children. When replacing indicator or tier content, supply a non-color cue elsewhere in the composition.

| Part | Element and content |
|---|---|
| `FeedHealthIndicator` | `span`. Connection dot and a screen-reader state word. Custom children replace the word; retain a non-color cue. |
| `FeedHealthTier` | Your `Badge`. Tier word. `className="sr-only"` gives a compact display without removing the accessible word. |
| `FeedHealthLane` | `span`. Nonzero coalesced drops or an ordered gap's age, replay spinner and accessible replay/open word. With omitted children, no data renders nothing. Custom children replace the reading. |
| `FeedHealthDetails` | `dl`. State, tier, last-message time and lane metadata. Children append `dt`/`dd` pairs. |
| `FeedHealthPending` | `span`. Spinner and action id while the item's `pending` is present. Pass the hook's `pendingLabel` as children to use the action label. |
| `FeedHealthTooltipTrigger` | Your `TooltipTrigger`. Caller children, focus style and a description link to `FeedHealthTooltipContent`. |
| `FeedHealthTooltipContent` | Your `TooltipContent`. Caller children with the matching id and tooltip role. |

The trigger/content pair belongs inside your shadcn `Tooltip`. Keep their generated description link and id paired if you override native attributes. The caller decides whether to include a tooltip at all. Pending metadata is caller-owned: append its label to `FeedHealthDetails` when your layout needs it.

### FeedAge

`FeedAge` also works outside an item. It accepts native span props and a ref. Its clock falls back to the group’s clock, then the shared one-second clock. The age is hidden from assistive technology by default; the announcer handles tier changes instead of counting aloud.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `feed` | `FeedDescriptor` | Required | Supplies the last-message timestamp. |
| `clock` | `Clock` | Inherited | Time source for the age. |
| `children` | `ReactNode` | Formatted age | Optional replacement content. |
| `className` | `string` | — | Classes on the span. |

Future timestamps clamp to zero. `formatAge(ms)` returns `now` below one second, then whole seconds, minutes or hours (`12s`, `3m`, `2h`). Null and nonfinite input display `–`.

### Feeds

Each `FeedDescriptor` supplies the connection state and message metadata. The component displays them; it does not connect, detect gaps, or replay messages.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Identity for rendering, pending actions, and announcements. |
| `label` | `string` | Required | Visible feed name. |
| `state` | `FeedState` | Required | `"connected"`, `"connecting"`, `"disconnected"`, or `"unknown"`; sets the state indicator. |
| `lane` | `FeedLane` | Required | `"coalesced"` or `"ordered"`; selects lane details. |
| `lastMessageAt` | `number \| null` | Required | Last message time in milliseconds since the epoch; `null` means no timestamp. |
| `dropped` | `number` | — | Cumulative dropped count for a coalesced lane; defaults to zero in FeedHealthDetails and appears in FeedHealthLane when nonzero. |
| `seq` | `number` | — | Last applied sequence, shown in FeedHealthDetails for an ordered lane when supplied. |
| `gap` | `{ since: number; replaying: boolean } \| null` | — | Open gap; `since` is milliseconds since the epoch. Omit or pass `null` for none. |
| `allowedActions` | `readonly string[]` | — | Action ids currently allowed on this feed; omission or an empty list allows none. |

### Tiers

`stalenessTier(feed, now, thresholds, session)` returns the first matching tier below. It is a pure helper for using the same tier elsewhere, such as graying out a grid; its threshold and session defaults match the component.

| Tier | Condition, in precedence order |
|---|---|
| `offline` | `state` is `"disconnected"`, whatever the session |
| `closed` | Session status is `"closed"` or `"holiday"` |
| `aging` | `lastMessageAt` is `null` |
| `live` | `now - lastMessageAt < agingMs` |
| `aging` | `now - lastMessageAt < staleMs` |
| `stale` | Otherwise |

At the boundaries, age equal to `agingMs` is aging and age equal to `staleMs` is stale. `"connecting"` and `"unknown"` use the same age rules as `"connected"`, so either can have a live tier. A null timestamp stays aging while the session is active. Drops and gaps do not change the tier.

### Lanes

Coalesced lanes report intentional drops of stale ticks. Ordered lanes carry messages that must not be dropped; they report an open gap's age, with a spinner when `gap.replaying` is true. `FeedHealthDetails` shows connection state, tier, last-message time and lane metadata. It shows gap status whenever `gap` is supplied, even on a coalesced lane. Put it in a tooltip or inline, append fields as children, or replace it with your own markup.

To map a [`row-store`](row-store.md)'s `useStoreMeta` into a descriptor, use `lane`, `dropped`, `lastBatchAt` as `lastMessageAt`, and `seq ?? undefined`. Supply the feed's identity, label, and connection state yourself. Store metadata has only a boolean `gap`; track its opening time and replay state in your feed integration to build `{ since, replaying }`.

### Thresholds and the session

`StalenessThresholds` requires `agingMs` and `staleMs`, both numbers in milliseconds. `PROVISIONAL_THRESHOLDS` is `{ agingMs: 2000, staleMs: 10_000 }`. These are placeholders: choose thresholds with the people who use the data. Supply the whole object with `0 <= agingMs < staleMs`; the component does not validate or reorder it.

`SessionCalendar` needs one method: `status(now: number)`, returning `"open"`, `"closed"`, `"pre"`, `"post"`, or `"holiday"`. `now` is milliseconds since the epoch. Pre- and post-session feeds still age normally; only closed and holiday suppress staleness, and neither overrides a disconnection. Real exchange calendars are yours to supply; [`session-calendar`](session-calendar.md) builds one from sessions, holidays, and early closes in the venue's zone.

### Actions

`useFeedActions(feed, actions, options?)` owns pending state for one feed. Mount it in your row component so one feed's actions do not rerender the whole collection. It does not subscribe to the clock. When called outside `FeedHealth`, pass a custom `clock` explicitly if the timestamps must match a custom group clock.

| Option | Type | Default | Purpose |
|---|---|---|---|
| `pendingMs` | `number` | `5000` | Timeout in milliseconds for a pending request. |
| `clock` | `Clock` | Inherited | Timestamp source. Timeout expiry uses `setTimeout`. |

| Returned value | Type | Purpose |
|---|---|---|
| `actions` | `FeedAction[]` | Allowed actions in caller order. Map them into your controls. |
| `pending` | `PendingFeedAction \| null` | Current action id, connection state at the press and `since` timestamp. Pass to the item. |
| `pendingLabel` | `string \| undefined` | Current action label, falling back to its id if the action definition disappears. |
| `run` | `(actionId: string) => void` | Runs a currently defined and permitted action unless one is already pending. |

Each `FeedAction` has these fields:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Matches `allowedActions`. Use distinct ids. |
| `label` | `string` | Required | Caller control text and pending label. |
| `run` | `(feed: FeedDescriptor) => void \| Promise<unknown>` | Required | Receives the latest committed descriptor when pressed. |
| `destructive` | `boolean` | — | Metadata for your control's styling or confirmation. The hook does not render either. |

`feedActionsFor(feed, actions)` is also available as a pure filter. It preserves action order and labels. Missing actions or missing allowed ids means no available action. The hook rechecks current permissions and action definitions inside `run`, including when a menu was opened before a feed update.

Pending clears when the feed's connection state or id changes, React cleans up the hook’s effects (including unmount, Activity hiding and Suspense hiding), the returned promise settles, `run` throws, or the timeout expires. Returning `void` alone does not clear it. Changing `pendingMs` does not reschedule an existing timeout. An older request's completion cannot clear a newer request, even when the clock timestamp is unchanged.

Clearing pending does not cancel the underlying request. To keep pending state and duplicate protection while a view is hidden, keep the hook's owner mounted outside the Activity or Suspense boundary and pass its result into the view.

A press does not change the tier. The hook catches synchronous errors and promise rejections without displaying an error; report failures in your integration. Mark controls disabled while pending. For inline buttons that should keep focus, use `aria-disabled` as in the card recipe; `run` still blocks duplicate execution. Permissions changing alone does not settle a request already sent.

The hook runs no menu or focus effects. The copyable menu recipe retains its focused/open trigger through permission loss; the card supplies a persistent heading as a focus target when a button disappears. Apply the same ownership when data or permissions change in your layout. Use stable feed keys so removing a feed unmounts its hook and releases its timeout.

### Announcements and clock

`FeedHealthAnnouncer` requires `feeds: readonly FeedDescriptor[]`. It accepts the same `thresholds`, `session` and `clock` options as the group, plus native span props and a ref. Place it in the group to inherit those options, or pass them explicitly beside the group. Use the same options as the group whose feeds it announces.

Its polite, atomic live region initializes empty. It updates when a feed changes tier or is added, combining simultaneous changes into one message. Aging and stale announcements include the age at that transition, such as “Market data stale, 10s”. Plain age ticks, label changes, reordering and removals leave the last message unchanged. A new addition or tier change inserts a fresh message node even when its words match the previous announcement. A clock that refreshes an old timestamp on subscription can cause a tier change during mounting.

Only items, ages and announcers subscribe to the clock. Ticks do not rerender the group or its parent. The shared one-second interval runs while it has subscribers and stops after the last unsubscribe; other ticking components use the same interval.

`createClock(intervalMs = 1000, source = Date.now)` is exported for custom clocks and tests. A `Clock` supplies `now(): number` and `subscribe(cb): () => void`. The created clock caches its timestamp between ticks and refreshes it when its first subscriber arrives after inactivity. Use epoch milliseconds to match feed timestamps.

### Installed primitives

The item installs `badge`, `spinner`, `tooltip` and the shared clock. Install the primitives your own layout adds: `separator` for separated rows, `dropdown-menu` for the menu recipe or `button` for the card. The `stale` and `up` tokens are added when absent.

Updating from the array-based widget? See the [FeedHealth migration guide](migrating-v1-to-v2.md#feedhealth).
