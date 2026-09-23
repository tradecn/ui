# StatusBar

Show the environment, market clocks, signed-in user, and your own readouts in a terminal's bottom bar.

## Usage

```tsx
import { FeedHealth } from "@/components/ui/feed-health"
import { PerfMonitor } from "@/components/ui/perf-monitor"
import { StatusBar } from "@/components/ui/status-bar"
```

The application supplies `feeds` and `session.user`, a string to display. Install `feed-health` and `perf-monitor` separately for these slots.

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

The order is environment badge, `left`, `center`, clocks, user, `right`. The bar wraps onto more lines when space runs out. The center wrapper always remains as a flexible spacer, even without content. The left and right wrappers disappear only when their props are `undefined`; passing `null` or `false` leaves an empty wrapper.

The bar imports none of the items in its slots. The example puts [`feed-health`](feed-health.md) and [`perf-monitor`](perf-monitor.md) there in their compact forms.

## API Reference

### StatusBar props

All props are optional. `StatusBarProps` accepts the following inputs; it does not forward arbitrary HTML attributes or accept a `children` prop.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `environment` | `StatusBarEnvironment` | Omitted | Environment badge, first on the bar. |
| `clocks` | `StatusBarClock[]` | Omitted | Clock readouts in array order; an empty array hides the group. |
| `user` | `string` | Omitted | Signed-in user text; an empty string hides it. |
| `left` | `ReactNode` | `undefined` | Content before the center spacer. |
| `center` | `ReactNode` | `undefined` | Centered content in the flexible spacer. |
| `right` | `ReactNode` | `undefined` | Content after the user. |
| `clock` | `Clock` | Shared one-second clock | Time source for every clock readout. |
| `labels` | `Partial<StatusBarLabels>` | `DEFAULT_STATUS_BAR_LABELS` | Overrides for the built-in labels. |
| `className` | `string` | Omitted | Classes merged onto the root. |

The root is a `div` with `role="group"`, named by `labels.title`, and `data-slot="tradecn-status-bar"`. It does not create a live region or announce each clock tick.

### The environment is a safety feature

The word identifies the environment; its tone helps production stand out at a glance. `StatusBarEnvironment` has two fields:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `label` | `string` | Required | Text printed as given, such as `PRODUCTION`, `UAT`, or `DEV`. |
| `tone` | `StatusTone` | Omitted | Badge colors; no status-tone classes are added when omitted. |

`StatusTone` is `"up" | "down" | "flat" | "stale" | "expiring" | "primary" | "destructive"`. `STATUS_TONE_CLASS: Record<StatusTone, string>` exports the text and background classes for each tone.

The badge uses the outline variant, with `labels.environment` in its `title` and a screen-reader prefix such as `Environment: `. The root carries `data-environment`; the badge carries `data-status-environment` and, when supplied, `data-tone`.

### The clocks

Each entry is a `StatusBarClock`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `label` | `string` | Required | Visible label beside the time, such as `New York`. |
| `zone` | `string` | Required | IANA time zone, such as `America/New_York`. |
| `seconds` | `boolean` | `true` | Include seconds in the displayed time. |
| `hourCycle` | `"h23" \| "h12"` | `"h23"` | Use a 24-hour or 12-hour clock. |

Every readout subscribes to the shared one-second clock from [`countdown`](countdown.md)'s `lib/clock.ts`, so three clocks use one timer. The timer runs while it has subscribers. Setting `seconds: false` on a clock entry changes formatting, not the tick rate. No clock readouts means no subscriptions from the bar.

The `clock` prop replaces that source. Its `Clock` interface has `now(): number`, returning the last tick's epoch milliseconds, and `subscribe(callback: () => void): () => void`, returning an unsubscribe function. Keep `now()` stable between ticks and supply a valid timestamp within JavaScript's date range.

The nonempty clocks group is named by `labels.clocks`. Each time uses a `<time>` element with lining, tabular figures and the instant's ISO timestamp in `dateTime`; its wrapper's `title` contains the zone. Formatting uses the runtime's default locale. An unknown zone prints `NULL_TOKEN` (`–`). Keep each label/zone pair unique: the pair is the readout's React key.

#### Clock helpers

Both helpers are exported from `@/components/ui/status-bar`.

| Helper | Returns | Behavior |
|---|---|---|
| `clockFormat(zone: string, seconds = true, hourCycle: "h23" \| "h12" = "h23")` | `Intl.DateTimeFormat \| null` | Caches the formatter by zone, seconds, and hour cycle. Caches `null` if formatter construction fails, including an unknown zone. |
| `formatClock(ms: number, clock: StatusBarClock)` | `string` | Formats epoch milliseconds using the entry's zone and options; `label` does not affect the result. Returns `NULL_TOKEN` when no formatter is available. |

The unknown-zone fallback does not validate timestamps. `formatClock` can throw for an invalid timestamp with a valid zone, and a readout's ISO `dateTime` requires a valid timestamp regardless of zone.

### The user

`user` is printed as given, with `labels.user` as a screen-reader prefix and in the `title`, for example `Signed in as jdoe`. The value comes from your session; the bar performs no session lookup.

### Labels

`labels` overrides these fields of `StatusBarLabels`. Omitted fields retain their values from `DEFAULT_STATUS_BAR_LABELS`; environment, clock, user, and slot content come from their own props.

| Field | Type | Default | Used for |
|---|---|---|---|
| `title` | `string` | `"Status"` | Bar's accessible name. |
| `environment` | `string` | `"Environment"` | Badge's title and screen-reader prefix. |
| `user` | `string` | `"Signed in as"` | User's title and screen-reader prefix. |
| `clocks` | `string` | `"Clocks"` | Clocks group's accessible name. |

### What it does not do

Your application owns environment, session, and feed state; the bar displays the props you supply. Items in its slots own their own behavior. It reads no feed and counts no frames. It does not fix itself to the window; place it at the bottom of your layout.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if you do not already have them. The environment badge uses those pairs; `primary` and `destructive` use the corresponding shadcn tokens with a translucent background.
