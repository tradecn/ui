# Countdown

Time left until a deadline, with ticking digits and a shrinking bar. Both stop at zero.

## Usage

```tsx
import { useState } from "react"
import { Countdown } from "@/components/ui/countdown"

function InquiryCountdown() {
  const [receivedAt] = useState(() => Date.now())
  return <Countdown expiresAt={receivedAt + 30_000} startsAt={receivedAt} label="Inquiry Q-104" />
}
```

This example starts a thirty-second timer on mount. In an application, pass the inquiry's received and expiry timestamps from the server, in milliseconds since the epoch. The preview's native buttons extend or restart its sample deadline; the countdown itself only displays it.

## Compact

Set `compact` for the digits alone, inline and without the bar, and give each its own `label`, since the row's name is not part of the timer's. In a grid or stack that does the speaking, pass `announce={false}` too. When a row runs out here, the demo hands it a fresh deadline.

<!-- demo: countdown-compact -->

## Thresholds

`thresholds.soonMs` sets how far out the `soon` tier begins, when the digits and the bar turn `expiring`. The same deadline under the default and under a desk that counts the last thirty seconds as soon; the demo starts it over at zero.

<!-- demo: countdown-thresholds -->

## Expired

A countdown mounted past its deadline reads `0:00`, holds an empty bar, and calls `onExpire` once; the demo counts the calls. It is a display event, not a verdict ([what it does not do](#what-it-does-not-do)).

<!-- demo: countdown-expired -->

## API Reference

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number` | Required | Deadline timestamp. `NaN` reads as over; `Infinity` is a wait with no end. |
| `startsAt` | `number` | First render, freshly sampled | Start timestamp used to size the bar. A value that is not a finite time is ignored. |
| `thresholds` | `CountdownThresholds` | `{ soonMs: 10_000 }` | When the `soon` tier begins. |
| `clock` | `Clock` | `sharedClock()` | Clock for updates and test timing. |
| `label` | `string` | `"Time left"` | Names the timer, with the time left, and leads its announcements. |
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

`formatRemaining(ms)` rounds up to whole seconds: `1:30`, `0:09`, `0:00`, or `1:02:03` past an hour. It never shows zero while time remains, and prints `–` for `Infinity`.

### The bar

Pass `startsAt` so the full bar represents the time from start to expiry. Without it, the bar starts full on first render if time remains, even for a countdown restored partway through.

One linear Web Animation shrinks the bar to zero, with no JavaScript work per frame. Changing `expiresAt` cancels and restarts it. Under `prefers-reduced-motion`, as read on mount, or in a browser without Web Animations, the bar steps with the digits instead. A deadline that isn't a finite time holds the bar still: empty for `NaN`, full for `Infinity`.

### The clock

Countdowns and [`feed-health`](feed-health.md) share one timer: `sharedClock()` from `@/lib/clock`, ticking once a second. Each countdown subscribes independently; ticks don't re-render its parents.

The clock's `now()` returns its last tick, which refreshes while anything subscribes. On a clock with `sample`, as `createClock` makes, a countdown samples the time source when it is first drawn and is never behind that moment, so one mounted after the clock sat idle shows the real time left from its first frame and announces nothing as the clock catches up. That moment stays when `clock` changes; change the countdown's `key` to start it again. Pass a faster `clock` for finer timing, or `createClock(1000, () => t)` for tests. `createClock` ticks once a second for an interval that is not a positive number of milliseconds up to 2³¹ − 1, the most a timer holds.

Render countdowns on the client. The shared clock advances only while something in a browser subscribes, so server-rendered digits, tiers, and `data-tier` go stale and mismatch on hydration.

### What it says

A polite live region announces tier changes, such as "Inquiry 0:10" and "Inquiry 0:00", without speaking on every tick. Set `announce={false}` when the containing grid or stack handles announcements.

The timer's accessible name is its label and the time left, so the time is read wherever the name is. A grid row named by its cells would change its name at every tick, so name such rows with the grid's `getRowLabel`, as `rfq-stack` does; the grid reads the focused row's cells, the timer's name among them, once focus rests on the row.

### What it does not do

`onExpire` is a display event. Use the server's status to decide whether an inquiry has expired. The component only displays time left; it doesn't count up or past zero.

### Tokens

The `soon` tier uses `expiring` and `expiring-soft`. Installation adds missing tokens; theme items set their values.
