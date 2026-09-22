# countdown

Time left to a moment, as digits that tick once a second and a bar that shrinks to nothing, turning in the last seconds and stopping at zero.

## Usage

```tsx
import { Countdown } from "@/components/ui/countdown"
```

```tsx
<Countdown expiresAt={inquiry.expiresAt} startsAt={inquiry.receivedAt} label={`Inquiry ${inquiry.id}`} />

<Countdown expiresAt={row.expiresAt} compact announce={false} />
```

## API Reference

### Tiers

The tier is `plenty`, then `soon` from `thresholds.soonMs` out, then `expired` at zero, and it is on the root as `data-tier`. The default threshold is ten seconds and is named `PROVISIONAL_COUNTDOWN_THRESHOLDS` so nobody mistakes it for a decision: the people who work the screen say how many seconds count as soon, and you pass that in. `countdownTier(remainingMs, thresholds)` is the same tiering as a pure function, for a row's color or a sort.

The digits are `formatRemaining(ms)`: `1:30`, `0:09`, `0:00`, and `1:02:03` past an hour. It rounds up, so the digits never say zero while time is left, and they say zero the moment none is.

### The bar

Its full width is the time from `startsAt` to `expiresAt`. Without `startsAt` it is measured from the moment the countdown was first drawn, which is right for a thing that appeared when it began and wrong for one restored mid-life, so pass `startsAt` when you have it. The bar is one Web Animation on its own element, linear, for exactly the time left, held at zero when it ends; the compositor runs it and nothing runs per frame. A new `expiresAt` cancels it and starts another. Under `prefers-reduced-motion` there is no animation: the bar steps once a second with the digits. `compact` leaves the bar out and lays the digits inline, for a grid cell.

### The clock

The digits read one shared one-second clock, `sharedClock()` from `lib/clock`, the same interval [`feed-health`](feed-health.md) ticks on. Only the countdown itself subscribes, so a stack of forty rows is forty small leaves on one timer, and nothing above them re-renders. Pass `clock` for another rate, or a fake in a test (`createClock(1000, () => t)`). A shared clock's `now()` is the time of its last tick, so a countdown drawn between ticks can read up to a second behind for its first second; a clock of your own at a finer interval closes that.

### What it says

Each countdown is a `timer` named by `label` ("Time left" by default). It says nothing on a tick. When the tier changes it says the label and the time left, once, in a polite live region: "Inquiry 0:10" as the last seconds begin, "Inquiry 0:00" at the end. `announce={false}` removes the region, for a grid whose stack does the speaking.

### What it does not do

It does not know what it is timing or whether that thing is over. `onExpire` fires once when the digits reach zero and is a display event; the server's word, a status or a state on the thing itself, is what says an inquiry expired, and a ticket or a stack reads that, not this. It does not run past zero, count up, or format anything but time left.

### Tokens

The install adds the `expiring` and `expiring-soft` tokens if you do not have them; the last seconds draw from them, and a theme item sets them with the rest.
