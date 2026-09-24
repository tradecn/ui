# Sparkline

A compact SVG history for a grid cell, with direction, gaps, and an optional crosshair.

## Usage

```tsx
import { Sparkline } from "@/components/ui/sparkline"

const prices = [99.5, 99.52, 99.51, 99.56, 99.54, 99.55]

function PriceHistory() {
  return <Sparkline values={prices} label="ABC, 10:00–10:05" width={160} height={40} format={(value) => value.toFixed(2)} />
}
```

Supply both dimensions when the surrounding cell has a known size. These six readings are one minute apart. The accessible name reports direction, last price, low, and high using the supplied decimal formatter. No extra formatter installation is needed.

## Gaps and a baseline

Missing readings keep their places on the time axis. This fixed series has gaps at 10:02 and 10:04, leaving the 10:03 reading as a dot. Each connected run gets its own area fill.

The dashed line is the previous close, 99.60. Although the last reading is above the first, it is below that baseline, so the automatic direction is down. The caption states the comparison as well.

<!-- demo: sparkline-baseline -->

## Responsive crosshair

Omit both dimensions and size the box with classes to let Sparkline measure it. **Narrow chart** changes the wrapper's width; the chart remains capped at the available preview width. The shared alignment controls choose which edge stays fixed while the width changes.

Move the pointer over the chart, or focus it and use the arrow keys, Home, End, and Escape. The crosshair names the original sample minute and price. There is no 10:02 reading, so navigation skips from 10:01 to 10:03. These readings stay fixed while you inspect them.

<!-- demo: sparkline-interactive -->

## API Reference

`SparklineProps` extends the root div's props except `children`.

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `values` | `readonly (number \| null \| undefined)[]` | Required | Readings in order; non-finite or missing readings leave gaps. |
| `label` | `string` | Required | Accessible name, such as `ZN, last 30 minutes`. |
| `direction` | `"auto" \| "up" \| "down" \| "flat" \| "none"` | `"auto"` | Compare readings automatically or choose the color explicitly. Exported as `SparklineDirection`. |
| `baseline` | `number` | Omitted | Comparison level and dashed line, such as a previous close. Use a finite number. |
| `width`, `height` | `number` each | Omitted | Fixed dimensions in pixels only when both are supplied; otherwise the component measures its box. |
| `area` | `boolean` | `true` | Tint beneath each unbroken run of two or more readings. |
| `interactive` | `boolean` | `false` | Enable a pointer and keyboard crosshair when measured or fixed geometry has finite readings. |
| `format` | `(value: number) => string` | `String(value)` | Format the summary and crosshair value. |
| `pointLabel` | `(index: number) => string` | Omitted | Prefix the crosshair value with a label for the reading's original index in `values`. |
| `className` | `string` | Omitted | Merge classes with the root's defaults, including its responsive size. |
| `style` | `CSSProperties` | Omitted | Style the root; fixed `width` and `height` take precedence over the same style properties. |

Replace the `values` array when readings change so the memoized geometry recalculates. The root has `data-slot="tradecn-sparkline"`, `data-direction`, and `data-empty` when there are no finite readings. Caller-supplied `role`, `tabIndex`, and ARIA props can override the generated defaults; the component owns its root ref and those three data attributes.

### What it says

With `direction="auto"`, the color compares the last finite reading with the first, or with `baseline` when supplied. Zero change is `flat`, using the same `directionOf` as the flash cell. An explicit `up`, `down`, or `flat` overrides that comparison. `none` uses the foreground color and omits the direction word from the summary.

In image mode, the accessible name includes the label, direction, last reading, low, and high: `ZN today: up, last 99-17, low 99-16, high 99-17`. Values pass through `format`, so use the formatter your grid uses. Low and high describe the finite readings, excluding the baseline. The inner SVG is hidden from assistive technology.

### Gaps

`null`, `undefined`, `NaN`, and infinities break the line. Each reading keeps the x position of its original array index; gaps do not pull later readings left. Indices are evenly spaced, so supply samples at the intervals you want to show. A run containing one reading is a dot, with no area fill. A one-element array places its dot at the horizontal center.

The scale spans the finite readings and a finite `baseline`, when present. A constant series sits at the vertical center only when the baseline is absent or equal to that value. Otherwise the baseline expands the range. The dashed baseline stays within that range when there is data; the area fill closes to the plot's bottom, not to the baseline.

An empty array or an array of only gaps draws no series or baseline, sets `data-empty`, and has the accessible name `<label>: no data`. It remains an image even with `interactive`. A non-finite baseline is omitted from the geometry but makes automatic direction `flat`; sanitize it before passing it.

### Size

Supply both `width` and `height` for a fixed size with no observer. This suits grid columns whose dimensions are already known. If either is omitted, both dimensions come from the measured box; a lone dimension prop does not size it.

Responsive mode defaults to `h-6 w-24`; use `className` or `style` to size the box. Instances share one `ResizeObserver`. The SVG appears after the first size notification, not on a guaranteed frame. Until then, the root is an image, automatic direction is `flat`, and the summary still reports the finite values. Without `ResizeObserver`, a newly mounted responsive sparkline never gets geometry; supply both dimensions in that environment or for server-rendered SVG.

### Crosshair

By default the root is an image with no tab stop or built-in keyboard navigation. With `interactive` and at least one geometry point, it becomes a horizontal slider named by `label`, with `tabIndex={0}`. Focus initializes an unset selection to the last finite reading.

| Input | Result |
| --- | --- |
| Left / Right | Move one finite reading backward / forward. |
| PageDown / PageUp | Move ten finite readings backward / forward. |
| Home / End | Select the first / last finite reading. |
| Escape | Hide the crosshair without moving focus. |
| Pointer move | Select the nearest finite reading by x position. |
| Pointer leave | Hide the crosshair unless the root has focus. |
| Blur | Hide the crosshair. |

Navigation skips gaps and stops at the ends. If the series shrinks, a selection beyond its end displays the last remaining point. The readout uses `format`, prefixed by `pointLabel(index)` when supplied. The slider's numeric range is `0` through `points.length - 1`, counting only finite readings; `aria-valuetext` contains the readout while a point is active and the full summary otherwise.

Caller handlers run first. Calling `preventDefault()` in `onKeyDown` cancels built-in keyboard navigation; focus, blur, and pointer handling do not check that flag. The component prevents default for its navigation keys and Escape, leaves other keys alone, and does not stop propagation. Outer grids and hotkey dispatchers should respect `defaultPrevented`.

### The geometry, on its own

`buildSparklineGeometry(values, width, height, options?)` is a pure function in `@/lib/sparkline-geometry`, with no React dependency. Use it for a canvas renderer or server-rendered SVG. It takes the same `values` type as the component, numeric dimensions, and these `SparklineOptions`:

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `padding` | `number` | `2` | Inset in pixels; negative padding clamps to zero. |
| `baseline` | `number` | Omitted | Include a finite level in the scale and calculate its y position. |

Coordinates round to two decimal places. The inner width and height each clamp to at least one pixel. The returned `SparklineGeometry` contains:

| Member | Type | Meaning |
| --- | --- | --- |
| `line` | `string` | SVG path data, one subpath per unbroken run; isolated readings use a zero-length stroke with a round cap in the component. |
| `area` | `string` | Paths for runs of at least two readings, closed to the plot's bottom. |
| `points` | `SparklinePoint[]` | Finite readings in order. Each point has numeric `index`, `value`, `x`, and `y`; `index` counts gaps in the input. |
| `min`, `max` | `number` each | Extrema of the finite readings, excluding the baseline. |
| `baselineY` | `number \| null` | Baseline y coordinate, or `null` if absent, non-finite, or there are no finite readings. |

With no finite readings, the result is `{ line: "", area: "", points: [], min: 0, max: 0, baselineY: null }`.

| Helper | Return | Behavior |
| --- | --- | --- |
| `nearestPointIndex(points: readonly SparklinePoint[], x: number)` | `number` | Binary search of points ordered by x. Returns a position in `points`, not the original reading index, or `-1` for an empty array. |
| `observeSize(element: Element, cb: (size: Size) => void)` | `() => void` | Subscribe through the shared observer; call the returned function to unobserve. `Size` has numeric `width` and `height`. Without `ResizeObserver`, the callback is never called. |

`observeSize` stores one callback per element. Registering again replaces it, and either cleanup removes the current registration. `resetSizeObserver()` is a test hook that disconnects the shared observer and clears its subscriptions.

### Tokens

The install adds the market tokens if you do not have them: `up`, `down`, `flat`, and their `-soft` variants, the same ones [`flash-cell`](flash-cell.md) uses.

### What it does not do

No axes, ticks, multiple series, zoom, or animation between values. It draws every finite reading without decimation; thin a history much longer than the box is wide before passing it in.
