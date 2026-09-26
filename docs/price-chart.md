# PriceChart

An intraday chart of one instrument: a line or candles over a store of bars, a crosshair moved by the pointer or arrow keys, the time axis in the venue's zone, and the last price with its signed change.

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

This fixed sample contains six one-minute bars from September 22, 2026, starting at 09:00 in Chicago. The line joins their closes; `baseline` is the sample previous close. Move the pointer over the plot, or focus it and use the arrow keys, to inspect a bar's close and volume. Home and End reach the first and last bars.

Keep the store stable across renders and key each bar by its start time with `barId`. This example loads complete bars with `upsert`; the [incoming-ticks example](#incoming-ticks) shows how a feed can build them.

## Composition

`PriceChart` shares the store snapshot and cursor. Compose one `PriceChartPlot` for the canvas and keyboard controls, then place the optional readings and legend wherever your layout needs them. `PriceChartHeader` is a plain layout container. You can use your own elements for application headings, actions and legend rows.

## Sidebar and footer

This layout moves the prices and legend into an aside and the readout into a footer. The legend reverses the overlay order; each `PriceChartOverlaySwatch` still resolves its color by overlay id. `usePriceChart` supplies custom content from the same snapshot without another store subscription.

<!-- demo: price-chart-layout -->

## Candles

Set `kind="candles"` for a candle per bar: the body from open to close, the wick from low to high. These six fixed ES bars span five-minute intervals and include rising, falling and unchanged closes relative to their opens. Each candle's color compares its own close with its open. The crosshair readout prints all four prices and volume.

<!-- demo: price-chart-candles -->

## Overlays

`overlays` supplies one value per bar, with a label and a chart token for each line. This example reuses the opening chart's six bars. The three-bar close average leaves the first two values missing until there is enough history. Bar VWAP weights each bar's typical price, `(high + low + close) / 3`, by its volume; it covers this sample only, rather than a full trading session or every individual trade.

Keep overlay functions pure and their definitions stable. Compose the legend explicitly: the caller owns its rows, labels, order and any extra content. A named swatch identifies each overlay, but matching a label to its plotted line still depends on color.

<!-- demo: price-chart-overlays -->

## Incoming ticks

The Apply next tick batch button stands in for a batch from a trade feed. `foldTicks` builds five-minute bars and returns deltas to apply to the store. The first batch opens and extends one bar, then opens the next. The second batch extends that second bar. The third contains a late print for the first bar: its low and volume change, while its close stays at the later print's price. Focus the plot and press Home to inspect that corrected bar.

The last state remains visible, with at most two bars. Clear bars returns to the empty chart so you can replay the batches. There is no background publisher. In a feed integration, call the same fold/apply pair for each received batch and choose a retention policy for old bars. A print for a missing historical bar inserts it; the chart sorts bars for display.

<!-- demo: price-chart-ticks -->

## API Reference

The chart draws with uPlot on a canvas after `ResizeObserver` reports a positive box size and the store has a finite bar. It reads the store through `useStoreMeta` and refreshes columns when the store or its batch version changes. React can combine several synchronous batches into one render. Size changes resize the plot; clearing the bars or unmounting destroys it.

Changing `kind`, `crosshair`, `lastLine`, `zone`, the serialized convention, or the overlays' ids, colors, widths, or order remakes the plot. Colors are read from your tokens when the plot is created and when `<html>`'s `class`, `style`, `data-theme`, or `data-accessibility` changes. A changed `--tradecn-font-mono` stack also remakes the plot because its axis font is fixed at creation.

Changing only `baseline` updates the readout without recalculating the price scale, so a new reference outside the current range can stay offscreen. A data update or plot recreation recalculates the scale.

### Props

`PriceChartProps` extends the root div's props and requires `children`. The root owns `role="group"`, `aria-label`, and chart data attributes; other div props, refs and handlers pass through. Mount one plot per root. Omitting a reading or legend omits only that presentation; the plot keeps its accessible summary and cursor value.

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
| `overlays` | `readonly PriceChartOverlay[]` | None | Lines over the bars; compose their legend separately. |
| `crosshair` | `boolean` | `true` | The crosshair, from the pointer and the keys. Off, the plot is an image. |
| `lastLine` | `boolean` | `true` | The dashed line and the tag at the last close. |
| `height` | `number` | Omitted | Root height in px, overriding `style.height`. Otherwise, `h-64` unless styled differently. |
| `labels` | `Partial<PriceChartLabels>` | `DEFAULT_PRICE_CHART_LABELS` | Override the words listed below. |
| `onCursor` | `(bar: Bar \| null) => void` | None | Receives the selected bar or `null` on cursor interaction and pointer-driven index changes. Data clamping is silent; see [Keyboard](#keyboard). |
| `className` | `string` | None | Classes on the root. |
| `style` | `CSSProperties` | None | Inline styles on the root. |

### Public parts

Parts accept the native props and ref of the element below. They preserve their `data-chart-*` markers and merge `className`. Coordinated parts and `usePriceChart` must be inside `PriceChart`; `PriceChartHeader` can stand alone.

| Part | Element | Content and behavior |
|---|---|---|
| `PriceChartHeader` | `div` | Your children in a wrapping row. No store or cursor subscription. |
| `PriceChartLast` | `span` | Last close, or `labels.noData`; direction color and numeric font follow the convention. |
| `PriceChartChange` | `span` | Signed price and percentage change. Renders nothing with no bars. |
| `PriceChartReadout` | `span` | Selected bar's formatted time, prices and optional volume; blank with no selection. Defaults to `ml-auto` for a header row; use `ml-0` in other layouts. |
| `PriceChartPlot` | `div` | Canvas, resize/theme observers and keyboard crosshair. Accepts children for an empty state. |
| `PriceChartEmpty` | `div` | `labels.noData`, shown only with no finite bars and positioned over the plot. Custom children replace only the visible text; the plot's accessible name uses `labels.noData`. |
| `PriceChartLegend` | `ul` | Requires caller-owned children, usually `li` rows. Defaults its accessible name to `labels.overlays`; no automatic rows or hiding. |
| `PriceChartOverlaySwatch` | `span` | Requires `overlayId: string`. Decorative swatch resolved from the plot's overlay order and color; unknown ids render nothing. |

Last, Change, Readout and Empty use their default text only when `children` is `undefined`. Supply children to replace it, including `null` to leave the element empty. Numeric readings retain their convention's font when moved outside the header. Plot owns its slider/image role, accessible name, tab stop and value attributes. Its `onKeyDown`, `onFocus` and `onBlur` call your handler first; `preventDefault()` cancels its built-in behavior for that event.

`usePriceChart()` returns `PriceChartState`: `bars` (finite, time-sorted bars), `summary` (`SeriesSummary` from price-series), `cursor` (selected index clamped to the current bars, or null when unselected or empty), `bar` (the selected bar or null), `readout` (formatted cursor text), `overlays`, `convention` and merged `labels`. Treat these shared readings as read-only. The hook adds no subscription or effect; repeated readouts share the root's one store subscription. Keep data updates on the store and cursor interaction on the plot.

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

The helpers are in `price-series.ts`, with no React runtime dependency, so a feed layer or a worker can fold bars without the component. Use a positive finite `intervalMs` in milliseconds; the helpers do not validate it. `foldTicks` skips ticks with non-finite `at` or `price`, while `foldTick` expects valid inputs. Each `convention` parameter accepts `PriceConvention | InstrumentConvention`.

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

`foldTicks` returns a `DeltaBatch<Bar>`; apply it to the store as in the example. It sorts a frame's ticks by time before folding. A late print corrects its bar's high, low, and volume; an earlier print moves its open, and a print at or after its latest timestamp moves its close. A whole bar without `firstAt` or `lastAt` keeps its open, but the first tick folded into it can replace its close.

`columnsOf` returns `BarColumns`: the filtered bars and arrays for `time`, `open`, `high`, `low`, `close`, and `volume`. It sorts on each call if the store's order is not chronological; it does not reorder the store. Invalid or absent volume becomes `null` in the volume column. `summarize` returns a `SeriesSummary`, measuring percent change as `change / Math.abs(reference) * 100`; a zero reference gives `null`. Empty input returns the exported `EMPTY_COLUMNS` or `EMPTY_SUMMARY` respectively, with a flat summary and no first or last bar.

### Overlays

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | The key. |
| `label` | `string` | Required | The line name; use it in your legend rows. |
| `values` | `(bars: readonly Bar[]) => readonly (number \| null)[]` | Required | One value per bar in time order; null leaves a gap. |
| `color` | `number` | Its place in the list, starting at 1 | Chart token index. Supply an integer; values outside 1–8 are clamped to that range. |
| `width` | `number` | `1` | Line width in CSS px. |

`CHART_TOKEN_CLASS` is the eight tokens as utilities, `bg-chart-1` to `bg-chart-8`, for a key of your own.

Keep `values` pure: it runs when the plot is created or recreated and when its data or overlay structure changes, including store batches that change only metadata. Replacing only a `values` function does not immediately recompute the line; the new function is used on the next such update. Missing or non-finite values become gaps, and extra values are ignored.

### The readout

`PriceChartLast` prints the last close in the direction's color, and `PriceChartChange` prints the change from the reference with its sign in the convention (`+0-02` for a fraction, `+1.25` for a decimal) and in percent. `PriceChartReadout` prints the selected bar: the time in the zone, the close for a line or all four prices for candles, and the volume when there is one.

Last's color alone does not tell every reader the direction. Keep `PriceChartChange` or your own sign beside it.

The direction is the last close against the reference: up, down, or flat when equal, never up. It is on the root as `data-direction`, and the plot's accessible name says it in a word with the last, the change, the range, and the count: `ZN, today: up, last 110-18, +0-02 (+0.06%), low 110-15, high 110-19, 3 bars`.

### Keyboard

With the crosshair on and at least one finite bar, the plot is a horizontal `slider` over the bars. Focus selects the last bar if no bar is selected; an existing pointer selection stays selected. With no bars or `crosshair={false}`, the plot is an `img` without a tab stop.

| Key | Action |
|---|---|
| Left / Down | Back one bar. |
| Right / Up | Forward one bar. |
| PageDown / PageUp | Move ten bars. |
| Home / End | The first and the last bar. |
| Escape | Put the crosshair away. Leaving does too. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the chart, such as a hotkey registry. |

The pointer moves the crosshair too, and the readout and `onCursor` follow whichever moved it last. Root handlers run around the plot and see each event after the plot handles it: a claimed key arrives with `defaultPrevented` set, every other key clean.

A keyboard-selected crosshair follows its current index as data updates. If bars are removed, it clamps to the last remaining bar without a new `onCursor` call. Ordinary data updates keep a pointer-controlled crosshair at its pixel coordinates, so a scale change can select a different index and call `onCursor`. Updating the bar at an unchanged index changes the readout without a callback. It is not called simply because the component mounted, and unmount does not send `null`.

Recreating the plot restores the selected bar without calling `onCursor`, including when the pointer selected it. The crosshair then follows that index until the next pointer movement takes control again.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-kind` | The root | `line` or `candles`. |
| `data-direction` | The root | The last close against the reference. |
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

The accessible name's words `last`, `low`, and `high` are fixed English text. `locale` changes the readout's clock; it does not translate those words or change the axis locale.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them, plus `chart-1` to `chart-8`. The item palette adapts [Okabe and Ito's palette](https://jfly.uni-koeln.de/color/): orange, sky blue, bluish green, yellow, blue, vermilion, reddish purple, and your foreground for black, with lightness adjusted for each mode.

A shadcn project already carries the first five chart tokens, which an install leaves alone. Each tradecn theme sets all eight in its own palette. An overlay uses your palette's value at that slot; its legend label names the line. The axis and the tag use your `--tradecn-font-mono` stack for tabular canvas text.

### What it does not do

Zoom, pan, indicators, a volume pane, or a second instrument on the same axis. It aggregates nothing: `foldTicks` is the one interval you give it, and a different interval is a different store. It decides nothing about the session: pass the venue's zone and the previous close, and it prints them.
