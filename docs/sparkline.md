# sparkline

A line small enough for a grid cell that still says which way, how far, and between what.

## Usage

```tsx
import { Sparkline } from "@/components/ui/sparkline"
```

```tsx
<Sparkline values={row.closes} label={`${row.symbol}, last 30 minutes`} width={96} height={22} />
<Sparkline values={closes} baseline={previousClose} label="ZN today" format={price} />
<Sparkline values={closes} label="ZN today" interactive pointLabel={(i) => times[i]} className="h-12 w-full" />
```

## API Reference

### What it says

The color is a direction: `up`, `down`, or `flat`, from the last reading against the first. Zero change is flat, never up; it is the same `directionOf` the flash cell uses. Pass `baseline` (a previous close) and the comparison is against that instead, and the level is drawn as a dashed line. `direction` takes `up`, `down`, or `flat` when you already know, and `none` draws in the foreground color.

Color is never the only channel. The direction is on the element as `data-direction`, and the accessible name says it in words: `ZN today: up, last 99-17, low 99-16, high 99-17`. Those numbers go through `format`, so pass the formatter your grid uses. `label` is required for that reason: a sparkline with no name is a squiggle to a screen reader.

### Gaps

A reading that is `null`, `undefined`, `NaN`, or infinite is a gap. The line breaks there and picks up at the next reading, and every reading keeps the x of its own index. It does not close the gap up: on a time axis that would draw the afternoon where the morning was. A reading with a gap on both sides is a dot. A series that never moves is drawn through the middle of the box, not along the bottom, where it would read as sitting at its low.

`baseline` joins the scale, so it is always on the plot, even when every reading is above it.

### Size

Give it `width` and `height` and the size is fixed and nothing is observed. That is the way to use it in a grid column, where the column already knows its width and a few hundred observers would be waste.

Leave them out and it fills its box (`h-6 w-24` unless your `className` says otherwise) and redraws when the box changes. Every sparkline on the page shares one `ResizeObserver`. The line appears one frame after mount in this mode, when the first measurement arrives.

### Crosshair

`interactive` is off by default, so a sparkline in a cell is an image and takes no focus and no keys. Turn it on and it becomes a `slider`: Tab to it and the crosshair starts at the last reading. Left and Right move one reading, PageDown and PageUp move ten, Home and End jump, Escape puts it away, and so does leaving. The pointer moves it too. A readout shows the reading, through `format`, with `pointLabel(index)` in front of it when you pass one (a time). A screen reader hears the same text as the slider's value.

It walks readings, not pixels, so a gap is stepped over. It calls `preventDefault` on the keys it uses and on nothing else, so a hotkey dispatcher or a grid further out keeps every other key. Your own `onKeyDown`, `onFocus`, `onBlur`, and pointer handlers still run, first.

### The geometry, on its own

`buildSparklineGeometry(values, width, height, { padding?, baseline? })` is a pure function that returns the path data, the points, the min and max, and the baseline's y. `nearestPointIndex(points, x)` is a binary search. Both are in `sparkline-geometry.ts` with no React in it, for a canvas renderer or a server-rendered SVG.

### Tokens

The install adds the market tokens if you do not have them: `up`, `down`, `flat`, and their `-soft` variants, the same ones [`flash-cell`](flash-cell.md) uses.

### What it does not do

Axes, ticks, multiple series, or zoom. It does not decimate: it draws every reading you pass, and a history far longer than the box is wide should be thinned before it gets here. It does not animate between values.
