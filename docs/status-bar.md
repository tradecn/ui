# status-bar

The strip at the bottom of every terminal: which environment this is, what time it is where the markets are, who is signed in, and your own readouts in the slots between.

## Usage

```tsx
import { StatusBar } from "@/components/ui/status-bar"
```

```tsx
<StatusBar
  environment={{ label: "PRODUCTION", tone: "destructive" }}
  clocks={[{ label: "New York", zone: "America/New_York" }, { label: "London", zone: "Europe/London" }, { label: "Tokyo", zone: "Asia/Tokyo" }]}
  user={session.user}
  left={<FeedHealth feeds={feeds} compact />}
  right={<PerfMonitor compact />}
/>
```

## Composition

One row, in this order: the environment badge, your `left`, your `center` (which takes the room), the clocks, the user, your `right`. A slot left out takes no space. The bar imports none of the items that usually sit in it, so its install stays small and what sits in it is your choice; the demo puts [`feed-health`](feed-health.md) and [`perf-monitor`](perf-monitor.md) in their compact forms there.

## API Reference

### The environment is a safety feature

`environment` is `{ label, tone }`: the word (`PRODUCTION`, `UAT`, `DEV`) printed as it is, first on the bar, in a badge painted by its tone. The word is what says which screen this is; the tone is the hint that makes production read at a glance from across a desk. The tones are the token names, `up`, `down`, `flat`, `stale`, `expiring`, `primary`, and `destructive`, and `STATUS_TONE_CLASS` has the class for each. The root carries `data-environment` for a stylesheet or a test.

### The clocks

`clocks` is a list of `{ label, zone, seconds, hourCycle }`: a word and an IANA zone, seconds on by default, a 24-hour clock by default. Every readout ticks on the shared one-second clock from [`countdown`](countdown.md)'s `lib/clock.ts`, so three clocks cost one timer, and a `clock` of your own replaces it. The time is a `<time>` in lining, tabular figures with the instant in `dateTime`, and the zone is the readout's `title`. A zone the runtime does not know prints the null token instead of throwing; `formatClock` and `clockFormat` are the functions underneath.

### The user

`user` is a string, printed as given, with `Signed in as` for a screen reader and in the `title`. Who is signed in comes from your session; the bar has no idea.

### Labels

Every word is in `labels`, a partial of `DEFAULT_STATUS_BAR_LABELS`: the bar's name, the environment word a screen reader hears before the badge, the user's prefix, and the clocks group's name.

### What it does not do

It reads no feed, counts no frame, and knows no session: those are the items you put in its slots. It fixes nothing to the window either; place it where your layout's bottom is.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants, if you do not have them; the environment badge draws from them.
