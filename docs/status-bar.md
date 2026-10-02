# StatusBar

Display environment, market clocks, and account readings in your layout.

## Usage

```tsx
import { StatusBar, StatusBarEnvironmentBadge, StatusBarClocks, StatusBarClockReadout, StatusBarUser } from "@/components/ui/status-bar"

export default function StatusBarDemo() {
  return (
    <div className="w-xl max-w-full">
      <StatusBar data-environment="PRODUCTION">
        <StatusBarEnvironmentBadge label="PRODUCTION" tone="destructive" />
        <div className="min-w-4 flex-1" data-status-slot="center" />
        <StatusBarClocks>
          <StatusBarClockReadout label="New York" zone="America/New_York" />
        </StatusBarClocks>
        <StatusBarUser user="jdoe" />
      </StatusBar>
    </div>
  )
}
```

Place the bar at the bottom of your layout. The spacer pushes the clocks and user to the right, and the bar wraps when space runs out.

## Composition

Use the following composition to build a `StatusBar`:

```text
StatusBar
├── StatusBarEnvironmentBadge
├── Your content and spacer
├── StatusBarClocks
│   └── StatusBarClockReadout
└── StatusBarUser
```

Arrange or omit the parts as needed. Each reading also works outside the bar. Only `StatusBarClockReadout` subscribes to time updates.

## Account Card

Use the same readings in a grid, with the user first and the environment after the clocks.

<!-- demo: status-bar-card -->

## Feed and frame health

Install [`feed-health`](feed-health.md) and [`perf-monitor`](perf-monitor.md), then save the complete [PerfMonitor Usage example](perf-monitor.md#usage) as `perf-monitor.tsx` beside this example to supply `FrameReadings`.

Choose **Receive message** to refresh the feed timestamp. Its default thresholds mark it aging after two seconds and stale after ten. The compact feed keeps its tier word available to screen readers and in its tooltip.

The frame monitor measures while mounted. Its bounded width lets readings wrap within the bar on narrow screens.

<!-- demo: status-bar-slots -->

## API Reference

### StatusBar props

`StatusBar` forwards native div props, events and refs. `children` is required and may be conditional content, including `null` or `false`.

| Prop | Type | Default |
|---|---|---|
| `children` | `ReactNode` | Required |
| `aria-label` | `string` | `"Status"` |
| `className` | `string` | — |

The root has `role="group"` and `data-slot="tradecn-status-bar"`. Use `aria-label` or `aria-labelledby` to name it. It creates no live region and does not announce each clock tick. Native controls supplied as children retain their usual keyboard behavior.

### The environment is a safety feature

`StatusBarEnvironmentBadge` displays the environment as a word and a tone. It forwards native span props and refs to the installed outline Badge.

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | Required |
| `tone` | `StatusTone` | — |
| `prefix` | `string` | `"Environment"` |

The prefix appears in screen-reader text and supplies the default `title`. The badge carries `data-status-environment` and, when supplied, `data-tone`. Set `data-environment` on the root yourself if your selectors use it, as in Usage.

`StatusTone` is `"up" | "down" | "flat" | "stale" | "expiring" | "primary" | "destructive"`. `STATUS_TONE_CLASS: Record<StatusTone, string>` exports the text and background classes for each tone. Omitting the tone adds no status-tone classes.

The `StatusBarEnvironment` descriptor type retains its `label` and optional `tone` fields. Spread it onto `StatusBarEnvironmentBadge` when storing environment options as data.

### The clocks

`StatusBarClocks` groups your readings. It forwards native div props and refs, requires `children`, and defaults to `role="group"`, `aria-label="Clocks"` and `data-status-slot="clocks"`. Supply the collection order and keys yourself; omit the group when your collection is empty.

`StatusBarClockReadout` forwards native span props and refs:

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | Required |
| `zone` | `string` | Required IANA time zone |
| `seconds` | `boolean` | `true` |
| `hourCycle` | `"h23" \| "h12"` | `"h23"` |
| `source` | `Clock` | Shared one-second clock |

Each readout shows its label beside a `<time>` element with lining, tabular figures and the instant's ISO timestamp in `dateTime`. The wrapper's default `title` is the zone. Formatting uses the runtime's default locale; an unknown zone prints `NULL_TOKEN` (`–`).

Every readout subscribes locally through `useNow`. Three readings using the default source share one timer, which stops after its last subscriber leaves. Setting `seconds={false}` changes the visible format, while the ISO timestamp still updates on the source cadence, once a second by default. A bar without clock readings creates no clock subscriptions.

Pass `source` to each readout to use a custom clock, and keep its identity stable: a new `source` object resubscribes the readout. Its `Clock` interface has `now(): number`, returning the last tick's epoch milliseconds, and `subscribe(callback: () => void): () => void`, returning cleanup. Keep `now()` stable between ticks and supply valid timestamps within JavaScript's date range.

The `StatusBarClock` descriptor type retains `label`, `zone`, `seconds` and `hourCycle`. When mapping descriptors, use a stable key such as a unique label/zone pair and spread each descriptor onto `StatusBarClockReadout`.

#### Clock helpers

Both helpers are exported from `@/components/ui/status-bar`.

| Helper | Returns | Behavior |
|---|---|---|
| `clockFormat(zone: string, seconds = true, hourCycle: "h23" \| "h12" = "h23")` | `Intl.DateTimeFormat \| null` | Caches the formatter by zone, seconds, and hour cycle. Caches `null` if construction fails, including an unknown zone. |
| `formatClock(ms: number, clock: StatusBarClock)` | `string` | Formats epoch milliseconds using the descriptor's zone and options; `label` does not affect the result. Returns `NULL_TOKEN` when no formatter is available. |

The unknown-zone fallback does not validate timestamps. `formatClock` can throw for an invalid timestamp with a valid zone, and a readout's ISO `dateTime` requires a valid timestamp regardless of zone.

### The user

`StatusBarUser` prints a required `user: string` with `prefix`, defaulting to `"Signed in as"`, in screen-reader text and the default `title`. It forwards native span props and refs and carries `data-status-user`.

The application supplies session state and decides when to hide the reading. Render it conditionally when the user may be missing.

### Labels

Use native `aria-label` or `aria-labelledby` on the groups, and `prefix` on the environment and user readings. Visible environment, clock and user text comes from the corresponding parts.

`DEFAULT_STATUS_BAR_LABELS` and the `StatusBarLabels` type remain available:

| Field | Default | Used by |
|---|---|---|
| `title` | `"Status"` | Root's default accessible name |
| `environment` | `"Environment"` | Environment prefix and default title |
| `user` | `"Signed in as"` | User prefix and default title prefix |
| `clocks` | `"Clocks"` | Clock group's default accessible name |

### What it does not do

The application owns environment, session and feed state. Content inside the bar owns its own behavior; the bar reads no feed and counts no frames. It does not fix itself to the window.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if you do not already have them, along with the shared font tokens and the hyperlegible remap. The environment badge uses those pairs; `primary` and `destructive` use the corresponding shadcn tokens with a translucent background.
