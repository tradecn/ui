# PriceChart

An intraday chart of one instrument: a line or candles over a store of bars, a crosshair the pointer and the arrow keys both move, the time axis in the venue's zone, and the last price printed with its sign.

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

Key bars by their start time with `barId`, and let `foldTicks` open and extend them: a frame of prints becomes one upsert per bar touched, and a late print corrects the bar it belongs to instead of adding a row out of order.

## Candles

Set `kind="candles"` for a candle per bar: the body from the open to the close in the direction's color, the wick from the low to the high. The readout under the crosshair prints all four, and the volume when the bars carry one.

<!-- demo: price-chart-candles -->

## Overlays

`overlays` draws lines over the bars, one value per bar from a function of the bars, each in a chart token and named in a legend under the plot, because a color alone says nothing about what a line is.

<!-- demo: price-chart-overlays -->

## API Reference

The chart is uPlot on a canvas, made once its box has a size and the store a bar, fed once per applied batch off the store's meta, and destroyed on unmount. Every color is read from your tokens when it mounts and again when `<html>`'s `class`, `style`, `data-theme`, or `data-accessibility` changes, so the picture follows your mode, your theme, and the hyperlegible remap; a change of font stack remakes the plot, since the axis font is fixed when it is made.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<Bar>` | Required | Bars keyed by `barId(time)`. |
| `convention` | `PriceConvention \| InstrumentConvention` | Required | Prints every price and sets the axis grid. |
| `label` | `string` | Required | Accessible name of the chart. |
| `kind` | `"line" \| "candles"` | `"line"` | A line through the closes, or a candle per bar. |
| `baseline` | `number \| null` | None | A previous close: the change is measured from it and it is drawn as a dashed line. Without one, the change is from the first bar's open. |
| `zone` | `string` | The runtime's | IANA zone for the time axis and the readout: the venue's. |
| `locale` | `string` | `en-US` | Locale of the readout's clock. |
| `overlays` | `PriceChartOverlay[]` | None | Lines over the bars, named in a legend. |
| `crosshair` | `boolean` | `true` | The crosshair, from the pointer and the keys. Off, the plot is an image. |
| `lastLine` | `boolean` | `true` | The dashed line and the tag at the last close. |
| `height` | `number` | Fills its box | Height in px. Without it the chart fills its box, `h-64` unless your `className` says otherwise. |
| `labels` | `Partial<PriceChartLabels>` | `DEFAULT_PRICE_CHART_LABELS` | Override the words listed below. |
| `onCursor` | `(bar: Bar \| null) => void` | None | The bar under the crosshair, or null when it leaves. |
| `className` | `string` | None | Classes on the root. |

### Bars

| Field | Type | Required | Purpose |
|---|---|---|---|
| `time` | `number` | Yes | When the bar opened, ms since the epoch; the row id is `barId(time)`. |
| `open` / `high` / `low` / `close` | `number` | Yes | The bar's prices. A bar with a value that is not a number is skipped. |
| `volume` | `number \| null` | No | Size traded in the bar; printed in the readout when present. |
| `firstAt` / `lastAt` | `number` | No | When the earliest and the latest prints folded into the bar happened. `foldTick` writes them; a bar you pass whole has neither. |

The helpers are in `price-series.ts`, with no React in it, so a feed layer or a worker can fold bars without the component:

| Function | Returns |
|---|---|
| `barId(time)` | The time as a string, the store's row id. |
| `barStart(at, intervalMs)` | The start of the bar a moment falls in. |
| `foldTick(bar, tick, intervalMs)` | The bar with the tick folded in: opened by the first tick, extended by the rest. |
| `foldTicks(store, ticks, intervalMs)` | The batch that folds a frame of ticks into the store, one upsert per bar touched. |
| `columnsOf(store)` | The store's bars as one array per field, in time order. |
| `summarize(columns, baseline?)` | Count, first and last bar, low, high, reference, change, percent, and direction. |
| `priceIncrements(convention)` | The steps the price axis may split on, from the convention's grid up. |
| `formatChange(change, convention)` | A change with its sign in the convention: `+0-02+`, `−0.50`. |
| `timeFormatter(zone, locale?, seconds?)` | A clock reading in the zone, 24-hour. An unknown zone falls back to the runtime's instead of throwing. |

`foldTicks` sorts a frame's ticks by time before folding, so a shuffled frame folds as it happened. A print that arrives after later ones corrects its bar's high, low, and volume, and moves the open or the close only when it is the earliest or the latest print the bar has seen; a bar that came in whole keeps its open. The store's order is trusted while it is by time, which a feed that appends is; a backfill that arrived out of order is sorted once, in `columnsOf`.

### Overlays

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | The key. |
| `label` | `string` | Yes | The word in the legend. |
| `values` | `(bars: readonly Bar[]) => (number \| null)[]` | Yes | One value per bar, in the bars' order; null leaves a gap. Called once per applied batch. |
| `color` | `number` | Its place in the list | Which chart token draws it, 1 to 8. |
| `width` | `number` | `1` | Line width in CSS px. |

`CHART_TOKEN_CLASS` is the eight tokens as utilities, `bg-chart-1` to `bg-chart-8`, for a key of your own.

### The readout

The header prints the last close in the direction's color, then the change from the reference with its sign in the convention (`+0-02` for a fraction, `+1.25` for a decimal) and in percent. Under the crosshair it prints the bar: the time in the zone, the close for a line or all four prices for candles, and the volume when there is one.

The direction is the last close against the reference: up, down, or flat when equal, never up. It is on the root as `data-direction`, and the plot's accessible name says it in a word with the last, the change, the range, and the count: `ZN, today: up, last 110-18, +0-02 (+0.06%), low 110-15, high 110-19, 3 bars`.

### Keyboard

With the crosshair on, the plot is a `slider` over the bars. Tab to it and the crosshair starts at the last bar.

| Key | Action |
|---|---|
| Left / Down | Back one bar. |
| Right / Up | Forward one bar. |
| PageDown / PageUp | Move ten bars. |
| Home / End | The first and the last bar. |
| Escape | Put the crosshair away. Leaving does too. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the chart, such as a hotkey registry. |

The pointer moves the crosshair too, and the readout and `onCursor` follow whichever moved it last. Your own `onKeyDown`, `onFocus`, and the rest go on the root, around the plot, and see every key after it: a claimed key arrives with `defaultPrevented` set, every other key clean.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-kind` | The root | `line` or `candles`. |
| `data-direction` | The root | The last close against the reference. |
| `data-empty` | The root | No bars yet. |
| `data-chart-last`, `data-chart-change`, `data-chart-readout` | The header | The three readings, for a test or a style. |
| `data-chart-plot` | The plot box | Where the canvas lives. |
| `data-chart-legend` | The legend | One item per overlay. |

### Labels

`labels` merges partial overrides into `DEFAULT_PRICE_CHART_LABELS`:

| Label | Default | Where |
|---|---|---|
| `noData` | `No data` | The header and the plot before the first bar |
| `open` / `high` / `low` / `close` / `volume` | `O` / `H` / `L` / `C` / `V` | The candle readout |
| `overlays` | `Overlays` | The legend's name |
| `up` / `down` / `flat` | `up` / `down` / `flat` | The direction word in the accessible name |
| `bars` | `bars` | The count in the accessible name |

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them, and the chart tokens `chart-1` to `chart-8`. The items' own values follow Okabe and Ito's order, orange, sky blue, bluish green, yellow, blue, vermilion, reddish purple, and your foreground for black; a shadcn project already carries the first five in shadcn's palette, which an install leaves alone, and every theme sets all eight in its own palette, so an overlay's color is whatever your palette says at that slot, and the legend is what names it. The axis and the tag are canvas text in your `--tradecn-font-mono` stack, tabular by construction, since a canvas has no numeric variant.

### What it does not do

Zoom, pan, indicators, a volume pane, or a second instrument on the same axis. It aggregates nothing: `foldTicks` is the one interval you give it, and a different interval is a different store. It decides nothing about the session: pass the venue's zone and the previous close, and it prints them.
