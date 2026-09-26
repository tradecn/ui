# PriceChart

Line and candlestick charts with composable readings, legends, and keyboard navigation.

## Usage

```tsx
import { useState } from "react"
import type { InstrumentConvention } from "@/lib/format"
import { barId, type Bar } from "@/lib/price-series"
import { createRowStore } from "@/lib/row-store"
import {
  PriceChart,
  PriceChartHeader,
  PriceChartLast,
  PriceChartChange,
  PriceChartReadout,
  PriceChartPlot,
  PriceChartEmpty,
} from "@/components/ui/price-chart"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const start = Date.parse("2026-09-22T14:00:00Z")
const minute = 60_000
const bars: Bar[] = [
  { time: start, open: 110.5, high: 110.53125, low: 110.484375, close: 110.515625, volume: 200 },
  { time: start + minute, open: 110.515625, high: 110.53125, low: 110.46875, close: 110.484375, volume: 100 },
  { time: start + 2 * minute, open: 110.484375, high: 110.546875, low: 110.484375, close: 110.53125, volume: 300 },
  { time: start + 3 * minute, open: 110.53125, high: 110.5625, low: 110.515625, close: 110.546875, volume: 200 },
  { time: start + 4 * minute, open: 110.546875, high: 110.546875, low: 110.5, close: 110.515625, volume: 400 },
  { time: start + 5 * minute, open: 110.515625, high: 110.578125, low: 110.515625, close: 110.5625, volume: 100 },
]

function SampleChart() {
  const [store] = useState(() => {
    const store = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    store.applyDeltas({ upsert: bars })
    return store
  })
  return (
    <div className="w-xl max-w-full">
      <PriceChart store={store} convention={ZN} label="ZN sample, one-minute bars" zone="America/Chicago" baseline={110.5} className="h-72">
        <PriceChartHeader>
          <PriceChartLast />
          <PriceChartChange />
          <PriceChartReadout />
        </PriceChartHeader>
        <PriceChartPlot>
          <PriceChartEmpty />
        </PriceChartPlot>
      </PriceChart>
    </div>
  )
}
```

Keep the store stable across renders and key each bar by its start time with `barId`.

Use `upsert` to load complete bars, or [build bars from incoming ticks](#incoming-ticks).

## Composition

Use the following composition to build a `PriceChart`:

```text
PriceChart
├── PriceChartHeader
│   ├── PriceChartLast
│   ├── PriceChartChange
│   └── PriceChartReadout
├── PriceChartPlot
│   └── PriceChartEmpty
└── PriceChartLegend
    └── PriceChartOverlaySwatch
```

Mount one `PriceChartPlot` per root. Move or omit the readings, header, and legend to fit your layout.

Use your own elements for headings, actions, and legend rows.

## Sidebar and footer

Place the readings and legend in an aside and the readout in a footer.

Use `usePriceChart` to add custom content.

<!-- demo: price-chart-layout -->

## Candles

Use `kind="candles"` to display open, high, low, and close prices.

Each candle's color compares its close with its open.

<!-- demo: price-chart-candles -->

## Overlays

Use `overlays` to add lines and `PriceChartLegend` to render their labels.

The example's bar VWAP uses prices and volumes from the displayed sample, not a full trading session.

<!-- demo: price-chart-overlays -->

## Incoming ticks

Use `foldTicks` to fold trade batches into bars.

Select **Apply next tick batch** three times. Focus the plot and press Home to inspect the late correction.

<!-- demo: price-chart-ticks -->

## API Reference

### Props

`PriceChartProps` extends the native `div` props and requires `children`.

The root sets `role="group"`, `aria-label`, and chart data attributes. Other props, refs, and handlers pass through.

The plot keeps its accessible summary and cursor value when you omit visible readings or the legend.

For v1 integrations, see the [migration guide](migrating-v1-to-v2.md#pricechart).

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `children` | `ReactNode` | Required | Your plot, readings, legend and application content. |
| `store` | `RowStore<Bar>` | Required | Bars keyed by `barId(time)`. |
| `convention` | `PriceConvention \| InstrumentConvention` | Required | Prints every price and sets the axis grid. |
| `label` | `string` | Required | Accessible name of the chart. |
| `kind` | `"line" \| "candles"` | `"line"` | A line through the closes, or a candle per bar. |
| `baseline` | `number \| null` | `null` | A finite previous close: the change is measured from it and it is drawn as a dashed line. Otherwise, the change is from the first bar's open. |
| `zone` | `string` | The runtime's | A runtime-supported IANA zone for the time axis and readout: the venue's. |
| `locale` | `string` | `en-US` | Locale of the readout's clock. |
| `overlays` | `readonly PriceChartOverlay[]` | None | Lines over the bars. Compose their legend separately. |
| `crosshair` | `boolean` | `true` | The crosshair, from the pointer and the keys. Off, the plot is an image. |
| `lastLine` | `boolean` | `true` | The dashed line and the tag at the last close. |
| `height` | `number` | Omitted | Root height in px, overriding `style.height`. Otherwise, `h-64` unless styled differently. |
| `labels` | `Partial<PriceChartLabels>` | `DEFAULT_PRICE_CHART_LABELS` | Override the words listed below. |
| `onCursor` | `(bar: Bar \| null) => void` | None | Receives the selected bar or `null` on cursor interaction and pointer-driven index changes. Data clamping is silent. See [Keyboard](#keyboard). |
| `className` | `string` | None | Classes on the root. |
| `style` | `CSSProperties` | None | Inline styles on the root. |

### Public parts

Each part accepts its element's native props and ref. Use `className` to extend its styles.

Place the parts and `usePriceChart` inside `PriceChart`. `PriceChartHeader` can also be used on its own.

| Part | Element | Content and behavior |
|---|---|---|
| `PriceChartHeader` | `div` | Your children in a wrapping row. No store or cursor subscription. |
| `PriceChartLast` | `span` | Last close, or `labels.noData`. Direction color and numeric font follow the convention. |
| `PriceChartChange` | `span` | Signed price and percentage change. Renders nothing with no bars. |
| `PriceChartReadout` | `span` | Selected bar's formatted time, prices and optional volume. Blank with no selection. Defaults to `ml-auto` for a header row. Use `ml-0` in other layouts. |
| `PriceChartPlot` | `div` | Canvas, resize/theme observers and keyboard crosshair. Accepts children for an empty state. |
| `PriceChartEmpty` | `div` | `labels.noData`, shown only with no finite bars and positioned over the plot. Custom children replace only the visible text. The plot's accessible name uses `labels.noData`. |
| `PriceChartLegend` | `ul` | Requires caller-owned children, usually `li` rows. Defaults its accessible name to `labels.overlays`. No automatic rows or hiding. |
| `PriceChartOverlaySwatch` | `span` | Requires `overlayId: string`. Decorative swatch resolved from the plot's overlay order and color. Unknown ids render nothing. |

Pass children to `PriceChartLast`, `PriceChartChange`, `PriceChartReadout`, or `PriceChartEmpty` to replace the default text. Use `undefined` for the default or `null` for no content.

Numeric readings keep their convention's font outside the header. Each part keeps its `data-chart-*` markers.

`PriceChartPlot` sets its role, accessible name, tab stop, and value attributes.

Its `onKeyDown`, `onFocus`, and `onBlur` call your handler first. Call `preventDefault()` to cancel the built-in behavior for that event.

### usePriceChart

Use `usePriceChart()` for custom readings. It returns the following read-only `PriceChartState`:

| Field | Type | Description |
|---|---|---|
| `bars` | `readonly Bar[]` | Finite bars, sorted by time. |
| `summary` | `SeriesSummary` | Summary from `price-series.ts`. |
| `cursor` | `number \| null` | Selected index clamped to the current bars. `null` when unselected or empty. |
| `bar` | `Bar \| null` | Selected bar, or `null`. |
| `readout` | `string` | Formatted cursor text. |
| `overlays` | `readonly PriceChartOverlay[]` | Overlay definitions from the root. |
| `convention` | `PriceConvention \| InstrumentConvention` | Price or instrument convention from the root. |
| `labels` | `PriceChartLabels` | Labels with defaults and overrides merged. |

The hook adds no subscription or effect. All readings share the root's one store subscription.

Update data through the store and move the cursor through the plot.

### Plot lifecycle

`PriceChartPlot` draws with uPlot on a canvas. It waits for a positive `ResizeObserver` size and at least one finite bar.

| Change | Behavior |
|---|---|
| Box size | Resizes the existing plot. |
| `kind`, `crosshair`, `lastLine`, `zone`, or serialized `convention` | Recreates the plot. |
| Overlay ids, colors, widths, or order | Recreates the plot. |
| `baseline` alone | Updates the readings without recalculating the price scale. An out-of-range reference can stay offscreen until data updates or the plot is recreated. |
| Theme or mode | Repaints the colors. |
| `--tradecn-font-mono` stack | Recreates the plot to update its axis font. |
| Empty store or unmount | Destroys the plot. |

### Bars

| Field | Type | Required | Purpose |
|---|---|---|---|
| `time` | `number` | Yes | When the bar opened, ms since the epoch; the row id is `barId(time)`. |
| `open` / `high` / `low` / `close` | `number` | Yes | The bar's prices. The chart skips a bar if its time or any of these prices is not finite. |
| `volume` | `number \| null` | No | Size traded in the bar; printed in the readout when present. |
| `firstAt` / `lastAt` | `number` | No | When the earliest and the latest prints folded into the bar happened. `foldTick` writes them; a bar you pass whole has neither. |

`PriceTick` is the input to `foldTick` and `foldTicks`:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `at` | `number` | Yes | Print time in ms since the epoch. |
| `price` | `number` | Yes | The traded price. |
| `size` | `number \| null` | No | Traded size; absent, null, and non-finite sizes add no volume. |

Use the helpers in `price-series.ts` to build bars in a feed layer or worker without React.

Pass a positive, finite `intervalMs` in milliseconds. The helpers do not validate it.

`foldTicks` skips ticks with non-finite `at` or `price`. `foldTick` expects valid inputs.

Each `convention` parameter accepts `PriceConvention | InstrumentConvention`.

| Function | Returns | Purpose |
|---|---|---|
| `barId(time: number)` | `RowId` | The time as a string, the store's row id. |
| `barStart(at: number, intervalMs: number)` | `number` | Bar start in epoch ms, on the interval grid aligned to the epoch. |
| `foldTick(bar: Bar \| undefined, tick: PriceTick, intervalMs: number)` | `Bar` | Open or extend the tick's bar. |
| `foldTicks(store: RowStore<Bar>, ticks: readonly PriceTick[], intervalMs: number)` | `DeltaBatch<Bar>` | One upsert per bar touched; does not apply the batch. |
| `columnsOf(store: RowStore<Bar>)` | `BarColumns` | Finite bars and one array per field, in time order. |
| `summarize(columns: BarColumns, baseline?: number \| null)` | `SeriesSummary` | Count, first and last bar, low, high, reference, change, percent, and direction. |
| `directionBetween(from: number, to: number)` | `Direction` | `"up"`, `"down"`, or `"flat"` by comparing `to` with `from`. |
| `priceOf(convention)` | `PriceConvention` | Extract an instrument's price convention, or return a bare one. |
| `priceStep(convention)` | `number` | Positive instrument tick when supplied; otherwise the fraction denominator's step, tick convention's tick, or decimal convention's last place. |
| `priceIncrements(convention)` | `number[]` | Axis steps from the convention's grid up: doubling for fractions, 1/2/5 per decade otherwise. |
| `priceDecimals(convention)` | `number` | Decimal places, a tick convention's derived places, or `0` for a fraction. |
| `formatChange(change: number \| null \| undefined, convention)` | `string` | Signed change in the convention: `+0-02+`, `−0.50`; zero has no sign and missing/non-finite values print `–`. |
| `timeFormatter(zone?: string, locale?: string, seconds?: boolean)` | `(ms: number) => string` | A 24-hour clock reading, with seconds by default and locale `en-US`. An unknown zone falls back to the runtime's. |
| `dayFormatter(zone?: string, locale?: string)` | `(ms: number) => string` | A month/day formatter with the same locale and zone defaults. Used on the axis when its span exceeds one day. |

Apply the `DeltaBatch<Bar>` returned by `foldTicks` to your store for each received batch. Choose a retention policy for older bars.

`foldTicks` sorts each batch by time before folding. A tick for a missing historical bar inserts it.

Late ticks update the bar's high, low, and volume. Earlier ticks update its open, and ticks at or after its latest timestamp update its close.

A whole bar without `firstAt` keeps its open. Without `lastAt`, its first folded tick replaces its close.

`columnsOf` returns `BarColumns` with the filtered bars and arrays for `time`, `open`, `high`, `low`, `close`, and `volume`.

Bars are sorted by time on each call if needed, without reordering the store. Invalid or absent volume becomes `null` in the volume column.

`summarize` calculates percentage change as `change / Math.abs(reference) * 100`. A zero reference gives `null`.

Empty input returns `EMPTY_COLUMNS` and `EMPTY_SUMMARY` respectively. The summary has a flat direction and no first or last bar.

### Overlays

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | The key. |
| `label` | `string` | Required | The line name. Use it in your legend rows. |
| `values` | `(bars: readonly Bar[]) => readonly (number \| null)[]` | Required | One value per bar in time order; null leaves a gap. |
| `color` | `number` | Its place in the list, starting at 1 | Chart token index. Supply an integer; values outside 1–8 are clamped to that range. |
| `width` | `number` | `1` | Line width in CSS px. |

Use `CHART_TOKEN_CLASS` for a custom key. It contains `bg-chart-1` through `bg-chart-8`.

Use `PriceChartOverlaySwatch` to keep each legend row's color when you reorder rows. Matching a label to its plotted line still depends on color.

Keep `values` pure and overlay definitions stable. Values are recalculated when the plot is created or recreated, or its data or overlay structure changes.

Batches that change only metadata also recalculate values. Replacing only a `values` function takes effect on the next such update.

Return `null` to leave a gap. Missing and non-finite values also leave gaps, and extra values are ignored.

### The readout

Use `PriceChartLast` to display the last close in the direction's color.

Use `PriceChartChange` for the signed change and percentage from the reference. It follows the convention, such as `+0-02` for fractions or `+1.25` for decimals.

Use `PriceChartReadout` for the selected bar's time, prices, and optional volume. It shows the close for a line, or all four prices for candles.

Keep `PriceChartChange` or your own sign beside `PriceChartLast`. Color alone does not tell every reader the direction.

The last close determines direction against the reference. Equal prices are `flat`.

The root, `PriceChartLast`, and `PriceChartChange` carry `data-direction`.

The plot's accessible name includes the direction, last price, change, range, and bar count:

```text
ZN, today: up, last 110-18, +0-02 (+0.06%), low 110-15, high 110-19, 3 bars
```

### Keyboard

With a crosshair and at least one finite bar, the plot is a horizontal `slider`.

Focus selects the last bar unless a bar is already selected. With no bars or `crosshair={false}`, the plot is an `img` without a tab stop.

| Key | Action |
|---|---|
| Left / Down | Back one bar. |
| Right / Up | Forward one bar. |
| PageDown / PageUp | Move ten bars. |
| Home / End | The first and the last bar. |
| Escape | Clear the crosshair. Blur also clears it. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the chart, such as a hotkey registry. |

Use the pointer or keyboard to move the crosshair. The readout and `onCursor` follow the most recent input.

Root bubbling handlers receive events after the plot handles them. Handled keys have `defaultPrevented` set, leaving other keys available to application hotkeys.

Keyboard selection follows its index as data updates.

If bars remain and the index is out of range, it clamps to the last bar without calling `onCursor`. Appended bars keep the clamped index.

Data updates keep a pointer-controlled crosshair at its pixel coordinates. A scale change can select a different index and call `onCursor`.

Updating a bar at the same index changes the readout without a callback. Mounting does not call `onCursor`, and unmounting does not send `null`.

Recreating the plot restores the selected bar silently, including pointer selections. The crosshair follows the selected index until the pointer takes control again.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-kind` | The root | `line` or `candles`. |
| `data-direction` | The root, Last and Change | The last close against the reference. |
| `data-empty` | The root | No finite bars to display. |
| `data-slot="tradecn-price-chart"` | The root | Component marker. |
| `data-chart-header` | Header | Caller-owned header content. |
| `data-chart-last`, `data-chart-change`, `data-chart-readout` | Each reading | The three readings, wherever placed. |
| `data-chart-plot` | The plot box | Where the canvas lives. |
| `data-chart-empty` | The plot box's placeholder | No finite bars to display. |
| `data-chart-legend` | Legend | Caller-owned rows. |
| `data-chart-swatch` | Overlay swatch | The plot token for its overlay id. |

### Labels

`labels` merges partial overrides into `DEFAULT_PRICE_CHART_LABELS`:

| Label | Default | Where |
|---|---|---|
| `noData` | `No data` | Last, Empty and the plot name when there are no finite bars |
| `open` / `high` / `low` / `close` | `O` / `H` / `L` / `C` | The candle readout |
| `volume` | `V` | Volume in either readout |
| `overlays` | `Overlays` | The legend's name |
| `up` / `down` / `flat` | `up` / `down` / `flat` | The direction word in the accessible name |
| `bars` | `bars` | The count in the accessible name |

Use `locale` to change the readout's clock format. It does not change the axis locale or translate the fixed words `last`, `low`, and `high` in the accessible name.

### Tokens

The install adds missing `up`, `down`, and `flat` tokens with their soft variants, plus `chart-1` through `chart-8`.

The item palette adapts [Okabe and Ito's palette](https://jfly.uni-koeln.de/color/) with lightness adjusted for each mode. It uses orange, sky blue, bluish green, yellow, blue, vermilion, reddish purple, and your foreground for black.

Existing shadcn chart tokens are preserved during installation. Each tradecn theme sets all eight chart tokens.

Overlays use your palette's value at their assigned slot. Use legend labels to name the lines.

Set `--tradecn-font-mono` to change the axis and last-price tag's tabular canvas font.

### What it does not do

The chart does not provide zoom, pan, indicators, a volume pane, or multiple instruments on one axis.

Use `foldTicks` to aggregate one interval and a separate store for each additional interval.

Pass the venue's `zone` and previous close as `baseline`. The chart does not determine trading sessions.
