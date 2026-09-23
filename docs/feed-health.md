# FeedHealth

A strip that shows each feed's connection state, the age of its data, and a staleness tier.

## Usage

```tsx
import { FeedHealth, type FeedDescriptor } from "@/components/ui/feed-health"
```

```tsx
<FeedHealth
  thresholds={{ agingMs: 2000, staleMs: 10_000 }}
  feeds={[
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt, dropped },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt, seq, gap },
    { id: "vpn", label: "VPN", state: "connecting", lane: "ordered", lastMessageAt: null },
  ]}
/>
```

## API Reference

### Props

`FeedHealthProps` accepts these inputs:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `feeds` | `FeedDescriptor[]` | Required | Feeds in display order. Use distinct, stable ids. |
| `thresholds` | `StalenessThresholds` | `PROVISIONAL_THRESHOLDS` | Age boundaries in milliseconds. |
| `session` | `SessionCalendar` | `alwaysOpen` | Calendar shared by all feeds in the strip. |
| `clock` | `Clock` | Shared one-second clock | Time source for ages, tiers, and pending-action timestamps. |
| `compact` | `boolean` | `false` | Hides the tier badge; keeps the dot, label, age, lane details, and actions. |
| `actions` | `readonly FeedAction[]` | `[]` | Available actions, in menu order. |
| `pendingMs` | `number` | `5000` | Timeout in milliseconds for a pending action. |
| `labels` | `Partial<FeedHealthLabels>` | `DEFAULT_FEED_HEALTH_LABELS` | Overrides the action button's accessible name and pending tooltip label. |
| `className` | `string` | Omitted | Classes on the outer group, named `Feed health`. |

### Feeds

Each `FeedDescriptor` supplies the connection state and message metadata. The component displays them; it does not connect, detect gaps, or replay messages.

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Identity for rendering, pending actions, and announcements. |
| `label` | `string` | Yes | Visible feed name. |
| `state` | `FeedState` | Yes | `"connected"`, `"connecting"`, `"disconnected"`, or `"unknown"`; sets the state dot. |
| `lane` | `FeedLane` | Yes | `"coalesced"` or `"ordered"`; selects lane details. |
| `lastMessageAt` | `number \| null` | Yes | Last message time in milliseconds since the epoch; `null` means no timestamp. |
| `dropped` | `number` | No | Cumulative dropped count for a coalesced lane; defaults to zero in the tooltip and appears inline when nonzero. |
| `seq` | `number` | No | Last applied sequence, shown in an ordered lane's tooltip when supplied. |
| `gap` | `{ since: number; replaying: boolean } \| null` | No | Open gap; `since` is milliseconds since the epoch. Omit or pass `null` for none. |
| `allowedActions` | `readonly string[]` | No | Action ids currently allowed on this feed; omission or an empty list allows none. |

### Tiers

`stalenessTier(feed, now, thresholds, session)` returns the first matching tier below. It is a pure helper for using the same tier elsewhere, such as graying out a grid; its threshold and session defaults match the component.

| Condition, in precedence order | Tier |
|---|---|
| `state` is `"disconnected"`, whatever the session | `offline` |
| Session status is `"closed"` or `"holiday"` | `closed` |
| `lastMessageAt` is `null` | `aging` |
| `now - lastMessageAt < agingMs` | `live` |
| `now - lastMessageAt < staleMs` | `aging` |
| Otherwise | `stale` |

At the boundaries, age equal to `agingMs` is aging and age equal to `staleMs` is stale. `"connecting"` and `"unknown"` use the same age rules as `"connected"`, so either can have a live tier. A null timestamp stays aging while the session is active. Drops and gaps do not change the tier.

### Lanes

Coalesced lanes report intentional drops of stale ticks. Ordered lanes carry messages that must not be dropped; they report an open gap's age, with a spinner when `gap.replaying` is true. The tooltip also shows connection state, tier, and last-message time. It shows gap status whenever `gap` is supplied, even on a coalesced lane.

To map a [`row-store`](row-store.md)'s `useStoreMeta` into a descriptor, use `lane`, `dropped`, `lastBatchAt` as `lastMessageAt`, and `seq ?? undefined`. Supply the feed's identity, label, and connection state yourself. Store metadata has only a boolean `gap`; track its opening time and replay state in your feed integration to build `{ since, replaying }`.

### Thresholds and the session

`StalenessThresholds` requires `agingMs` and `staleMs`, both numbers in milliseconds. `PROVISIONAL_THRESHOLDS` is `{ agingMs: 2000, staleMs: 10_000 }`. These are placeholders: choose thresholds with the people who use the data. Supply the whole object with `0 <= agingMs < staleMs`; the component does not validate or reorder it.

`SessionCalendar` needs one method: `status(now: number)`, returning `"open"`, `"closed"`, `"pre"`, `"post"`, or `"holiday"`. `now` is milliseconds since the epoch. Pre- and post-session feeds still age normally; only closed and holiday suppress staleness, and neither overrides a disconnection. Real exchange calendars are yours to supply; [`session-calendar`](session-calendar.md) builds one from sessions, holidays, and early closes in the venue's zone.

### Actions

Use `FeedAction` for operations such as pause, resume, reconnect, and resubscribe:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Matches the feed's `allowedActions`. Use distinct action ids. |
| `label` | `string` | Yes | Menu text and pending-action label. |
| `run` | `(feed: FeedDescriptor) => void \| Promise<unknown>` | Yes | Receives the descriptor used for the press. A returned promise clears pending on resolution or rejection. |
| `destructive` | `boolean` | No | Adds destructive text color; does not add confirmation. |

`feedActionsFor(feed, actions)` filters actions against `allowedActions`, preserving your action order and labels, as [`blotter`](blotter.md) and the tickets do. The feed gets a menu on your `dropdown-menu` only when at least one action matches. Missing actions or missing allowed ids means no menu.

A press shows a spinner and the action label, then disables that feed's menu items while pending. Other feeds remain usable. Pending clears when the feed's `state` changes, the feed is removed, the returned promise settles, `run` throws, or the timeout expires. Returning `void` alone does not clear it. Changing `pendingMs` does not reschedule an existing timeout; the timeout uses `setTimeout`, independently of clock ticks.

Pending indicates a request, not success. The component catches synchronous errors and promise rejections without displaying an error; report failures in your integration. A press does not change the tier, which still follows the feed, session, and clock.

Pending actions are identified by feed id and the clock's cached timestamp. If a cleared action's timer or promise settles after a newer action starts on the same id before the clock advances, it can clear the newer pending mark. Removing and re-adding that id does not prevent this.

`labels.actions` defaults to `"Actions: {feed}"`, with `{feed}` replaced by the feed label. `labels.pending` defaults to `"Pending"` in the tooltip. These overrides do not translate tier names, other tooltip labels, or the outer group's name.

### The clock

Feed items, ages, and the announcer subscribe to the clock. The default shared one-second interval runs while it has subscribers and stops after the last unsubscribe; it is shared with other ticking components. Clock ticks do not re-render the strip or its parent.

`createClock(intervalMs = 1000, source = Date.now)` is exported here for custom clocks and tests. A `Clock` provides `now(): number` and `subscribe(cb): () => void`, which returns an unsubscribe function. The created clock caches its timestamp between ticks and also refreshes it when its first subscriber arrives after inactivity. Use epoch milliseconds to match feed timestamps.

`FeedAge` displays an age on its own:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `feed` | `FeedDescriptor` | Required | Supplies the last-message timestamp. |
| `clock` | `Clock` | Shared one-second clock | Time source for the age. |
| `className` | `string` | Omitted | Classes on the age span. |

Ages clamp future timestamps to zero and are hidden from assistive technology. `formatAge(ms)` formats milliseconds as `now` below one second, then whole seconds, minutes, or hours (`12s`, `3m`, `2h`); null or nonfinite input displays `–`.

The polite live region initializes empty. It updates when a feed changes tier or a new feed is added, combining simultaneous changes into one message. A clock that refreshes an old timestamp on subscription can cause a tier change and announcement during mounting. Aging and stale announcements include the age at that transition, such as "Market data stale, 10s". Plain age ticks, label changes, and removals do not create a new message, so the spoken age does not keep counting.

### Tokens

The install adds the `stale` and `up` tokens to your stylesheet if you do not have them.
