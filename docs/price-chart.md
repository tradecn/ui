# PriceChart

An intraday chart of one instrument: a line or candles over a store of bars, a crosshair moved by the pointer or arrow keys, the time axis in the venue's zone, and the last price with its signed change.

## Usage

```tsx
import { PriceChart } from "@/components/ui/price-chart"
import { barId, foldTicks, type Bar } from "@/lib/price-series"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const bars = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })

// once per frame, from your trade feed: the ticks fold into the open one-minute bar
bars.applyDeltas(foldTicks(bars, ticks, 60_000))

<PriceChart store={bars} convention={ZN} label="ZN, today" zone="America/Chicago" baseline={previousClose} />
```

Keep the store stable across renders. Key bars by their start time with `barId`, and let `foldTicks` open and extend them: a frame of prints becomes one upsert per bar touched. A late print updates its existing bar; a print for a missing historical bar inserts it, and the chart sorts the bars for display. To load a `Bar[]` named `wholeBars`, use `bars.applyDeltas({ upsert: wholeBars })`.

## Candles

Set `kind="candles"` for a candle per bar: the body from the open to the close, the wick from the low to the high. Each candle's color compares its own close with its open. The readout under the crosshair prints all four, and the volume when the bars carry one.

<!-- demo: price-chart-candles -->

## Overlays

`overlays` draws lines over the bars, one value per bar from a function of the bars, each in a chart token and named in a legend under the plot, because a color alone says nothing about what a line is.

<!-- demo: price-chart-overlays -->

## API Reference

The chart draws with uPlot on a canvas after `ResizeObserver` reports a positive box size and the store has a finite bar. It reads the store through `useStoreMeta` and refreshes columns when the store or its batch version changes. React can combine several synchronous batches into one render. Size changes resize the plot; clearing the bars or unmounting destroys it.

Changing `kind`, `crosshair`, `lastLine`, `zone`, the serialized convention, or the overlays' ids, colors, widths, or order remakes the plot. Colors are read from your tokens when the plot is created and when `<html>`'s `class`, `style`, `data-theme`, or `data-accessibility` changes. A changed `--tradecn-font-mono` stack also remakes the plot because its axis font is fixed at creation.

Changing only `baseline` updates the readout without recalculating the price scale, so a new reference outside the current range can stay offscreen. A data update or plot recreation recalculates the scale.

### Props

`PriceChartProps` extends the root div's props except `children`. The component owns the root's `role="group"`, `aria-label`, and chart data attributes; other div props and handlers pass through.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<Bar>` | Required | Bars keyed by `barId(time)`. |
| `convention` | `PriceConvention \| InstrumentConvention` | Required | Prints every price and sets the axis grid. |
| `label` | `string` | Required | Accessible name of the chart. |
| `kind` | `"line" \| "candles"` | `"line"` | A line through the closes, or a candle per bar. |
| `baseline` | `number \| null` | `null` | A finite previous close: the change is measured from it and it is drawn as a dashed line. Otherwise, the change is from the first bar's open. |
| `zone` | `string` | The runtime's | A runtime-supported IANA zone for the time axis and readout: the venue's. |
| `locale` | `string` | `en-US` | Locale of the readout's clock. |
| `overlays` | `readonly PriceChartOverlay[]` | None | Lines over the bars, named in a legend. |
| `crosshair` | `boolean` | `true` | The crosshair, from the pointer and the keys. Off, the plot is an image. |
| `lastLine` | `boolean` | `true` | The dashed line and the tag at the last close. |
| `height` | `number` | Omitted | Root height in px, overriding `style.height`. Otherwise, `h-64` unless styled differently. |
| `labels` | `Partial<PriceChartLabels>` | `DEFAULT_PRICE_CHART_LABELS` | Override the words listed below. |
| `onCursor` | `(bar: Bar \| null) => void` | None | Called when the selected bar index changes or is cleared; receives the bar or `null`. |
| `className` | `string` | None | Classes on the root. |
| `style` | `CSSProperties` | None | Inline styles on the root. |

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
| `label` | `string` | Required | The word in the legend. |
| `values` | `(bars: readonly Bar[]) => readonly (number \| null)[]` | Required | One value per bar in time order; null leaves a gap. |
| `color` | `number` | Its place in the list, starting at 1 | Chart token index. Supply an integer; values outside 1–8 are clamped to that range. |
| `width` | `number` | `1` | Line width in CSS px. |

`CHART_TOKEN_CLASS` is the eight tokens as utilities, `bg-chart-1` to `bg-chart-8`, for a key of your own.

Keep `values` pure: it runs when the plot is created or recreated and when its data or overlay structure changes, including store batches that change only metadata. Replacing only a `values` function does not immediately recompute the line; the new function is used on the next such update. Missing or non-finite values become gaps, and extra values are ignored.

### The readout

The header prints the last close in the direction's color, then the change from the reference with its sign in the convention (`+0-02` for a fraction, `+1.25` for a decimal) and in percent. Under the crosshair it prints the bar: the time in the zone, the close for a line or all four prices for candles, and the volume when there is one.

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

The pointer moves the crosshair too, and the readout and `onCursor` follow whichever moved it last. Your own `onKeyDown`, `onFocus`, and the rest go on the root, around the plot, and see every key after it: a claimed key arrives with `defaultPrevented` set, every other key clean.

`onCursor` follows index changes, not changes to the bar at that index. Updating a selected bar or inserting bars before it can change the readout without a callback. It is not called simply because the component mounted, and unmount does not send `null`.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-kind` | The root | `line` or `candles`. |
| `data-direction` | The root | The last close against the reference. |
| `data-empty` | The root | No finite bars to display. |
| `data-slot="tradecn-price-chart"` | The root | Component marker. |
| `data-chart-header` | The header | Last price, change, and cursor readout. |
| `data-chart-last`, `data-chart-change`, `data-chart-readout` | The header | The three readings, for a test or a style. |
| `data-chart-plot` | The plot box | Where the canvas lives. |
| `data-chart-empty` | The plot box's placeholder | No finite bars to display. |
| `data-chart-legend` | The legend | One item per overlay. |

### Labels

`labels` merges partial overrides into `DEFAULT_PRICE_CHART_LABELS`:

| Label | Default | Where |
|---|---|---|
| `noData` | `No data` | The header and plot when there are no finite bars |
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
