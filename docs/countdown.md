# countdown

Time left until a deadline, with ticking digits and a shrinking bar. Both stop at zero.

## Usage

```tsx
import { Countdown } from "@/components/ui/countdown"
```

```tsx
<Countdown expiresAt={inquiry.expiresAt} startsAt={inquiry.receivedAt} label={`Inquiry ${inquiry.id}`} />

<Countdown expiresAt={row.expiresAt} compact announce={false} />
```

Pass timestamps in milliseconds since the epoch.

## API Reference

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number` | Required | Deadline timestamp. |
| `startsAt` | `number` | First render | Start timestamp used to size the bar. |
| `thresholds` | `CountdownThresholds` | `{ soonMs: 10_000 }` | When the `soon` tier begins. |
| `clock` | `Clock` | `sharedClock()` | Clock for updates and test timing. |
| `label` | `string` | `"Time left"` | Accessible timer name and announcement label. |
| `compact` | `boolean` | `false` | Inline digits without a bar. |
| `announce` | `boolean` | `true` | Announce tier changes to screen readers. |
| `onExpire` | `() => void` | None | Called on expiry, including an already-expired mount. Can fire again after the deadline is extended. |
| `className` | `string` | None | CSS classes for the root timer element. |

### Tiers

The root's `data-tier` tracks the time left:

| Tier | Time left |
|---|---|
| `plenty` | Above `thresholds.soonMs` |
| `soon` | At or below `thresholds.soonMs`, but above zero |
| `expired` | Zero or less |

The default, `PROVISIONAL_COUNTDOWN_THRESHOLDS`, is a placeholder. Set `thresholds.soonMs` with the people using the screen. For row colors or sorting, `countdownTier(remainingMs, thresholds)` gives the same tier without rendering a component.

`formatRemaining(ms)` rounds up to whole seconds: `1:30`, `0:09`, `0:00`, or `1:02:03` past an hour. It never shows zero while time remains.

### The bar

Pass `startsAt` so the full bar represents the time from start to expiry. Without it, the bar starts full on first render if time remains, even for a countdown restored partway through.

One linear Web Animation shrinks the bar to zero, with no JavaScript work per frame. Changing `expiresAt` cancels and restarts it. Under `prefers-reduced-motion`, the bar steps with the digits instead.

### The clock

Countdowns and [`feed-health`](feed-health.md) share one timer: `sharedClock()` from `@/lib/clock`, ticking once a second. Each countdown subscribes independently; ticks don't re-render its parents.

The clock's `now()` returns its last tick, so a newly rendered countdown can initially read up to a second behind. Pass a faster `clock` for finer timing, or `createClock(1000, () => t)` for tests.

### What it says

A polite live region announces tier changes, such as "Inquiry 0:10" and "Inquiry 0:00", without speaking on every tick. Set `announce={false}` when the containing grid or stack handles announcements.

### What it does not do

`onExpire` is a display event. Use the server's status to decide whether an inquiry has expired. The component only displays time left; it doesn't count up or past zero.

### Tokens

The `soon` tier uses `expiring` and `expiring-soft`. Installation adds missing tokens; theme items set their values.
