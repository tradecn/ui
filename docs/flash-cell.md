# FlashCell

A cell that flashes on change, colored up, down, or flat, as a fill or an inset ring.

## Usage

```tsx
import { FlashCell } from "@/components/ui/flash-cell"
```

```tsx
<FlashCell value={quote.px}>{format.price(quote.px)}</FlashCell>
<FlashCell value={level.size} variant="ring">{level.size}</FlashCell>
```

`value` is watched, not printed. Supply the display as `children`; `format` above is your instrument formatter from [`format`](format.md). Without children, the cell is empty.

## API Reference

`FlashCellProps` extends the div's `HTMLAttributes` and `FlashOptions`, with `value` and optional `children`:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `value` | `unknown` | Required | Value whose identity and direction are watched. |
| `children` | `ReactNode` | Omitted | Content displayed inside the cell. |
| `windowMs` | `number` | `900` | Flash duration and resume window, in milliseconds. Supply a finite positive duration. |
| `variant` | `"fill" \| "ring"` | `"fill"` | Background tint or inset outline; a ring can sit around a cell that already carries a bar. |
| `compare` | `(prev: unknown, next: unknown) => number \| null` | `compareValues` | Chooses direction after a value change. |
| `flashOnEqual` | `boolean` | `false` | Flash flat when the effect runs with the same value. |
| `revision` | `unknown` | Omitted | Change its identity for a new reading whose value may be equal. |
| `memory` | `FlashMemory` | Local ref | Retain previous values and flash times across mounts. |
| `cellKey` | `string` | Omitted | Required, nonempty key when using shared memory; otherwise ignored. |
| `disabled` | `boolean` | `false` | Skip comparing, recording, and starting flashes. |
| `now` | `() => number` | `performance.now` | Clock in milliseconds; keep one time basis across shared-memory users. |
| `color` | `string` | Omitted | Accepted by the inherited type, but the component forwards it to the div, not the hook. Use `useFlash` for a custom animation color. |
| `className` | `string` | Omitted | Classes merged onto the div, including custom direction styles. |

Other div attributes and handlers are forwarded. The root carries `data-slot="tradecn-flash-cell"`, `data-variant`, `data-numeric`, and lining, tabular figures.

### Values and direction

The first observation records the value without flashing. Later changes use `Object.is`: new objects count as changed even with equal fields, while mutating the same object does not establish a new value. `compare` selects direction; it does not replace this identity check.

The default comparison subtracts `prev` from `next` when both are finite numbers. A positive difference is `up`, a negative difference is `down`, and zero or a non-numeric change is `flat`. Zero **change** is flat; a rise from `-1` to `0` is up. Numeric strings are not parsed.

For repeated equal readings, set `flashOnEqual` and change `revision`, for example to the new row object or batch version:

```tsx
<FlashCell value={quote.px} revision={quote} flashOnEqual>
  {format.price(quote.px)}
</FlashCell>
```

An unchanged value and revision do not trigger the effect on an ordinary rerender. Changing another effect input, such as `variant`, `windowMs`, or `compare`, can also trigger it; with `flashOnEqual`, that starts a new flat flash. Keep comparator identity stable when it has not changed.

In development Strict Mode, effect replay can also start a flat flash on initial mount when `flashOnEqual` is enabled.

### Timing and motion

The layout effect observes values after React commits. The hook adds no React state updates and does no feed batching; it cannot display intermediate values that never reach a committed render. For message-at-a-time feeds, batch updates before rendering, for example with [`createFrameBatcher`](row-store.md).

Each new flash cancels the previous animation on the same element and starts over without remounting it. `fill` animates the soft token to transparent; `ring` animates a one-pixel inset shadow from the solid token to transparent. Both use Web Animations with `ease-out`. `data-direction` stays set until the animation finishes, or until the fallback timer expires.

With reduced motion, or without `element.animate`, `FlashCell` shows its static direction color for the remaining window, then clears it. The reduced-motion preference is read on the first flash and cached; changing the system preference afterward does not update that cached value.

Setting `disabled` skips future effect work but does not cancel an active flash or update the remembered value. Re-enabling compares against the last recorded value. Unmounting cancels the element's animation and fallback timer.

Pair direction color with a sign or another text cue. [`formatSigned`](format.md) prints `+` or `−` for values that remain nonzero at the display precision; choose enough precision for the changes you need to show. `directionClass` adds matching text color but supplies no non-color cue. The cell adds no live announcement.

### Shared memory

Keep one `createFlashMemory()` outside the virtualized cells and give each row/column pair a distinct, stable `cellKey`. A remount with the same value resumes an unexpired flash at its elapsed time; a changed value starts a new flash. With `flashOnEqual`, even a same-value remount starts a new flat flash.

`windowMs` limits resuming a flash, not retaining its record. Records remain until forgotten or evicted. `createFlashMemory(max = 50_000)` bounds the record count and evicts the least recently set key; reads do not refresh that order. Use a positive integer capacity.

| `FlashMemory` member | Type | Behavior |
|---|---|---|
| `get` | `(key: string) => FlashRecord \| undefined` | Read a record without refreshing its eviction order. |
| `set` | `(key: string, record: FlashRecord) => void` | Store a record and make its key the newest. |
| `forget` | `(prefix: string) => void` | Remove every key starting with the prefix. Include your row/column separator to avoid matching other row ids. |
| `size` | `readonly number` | Current record count. |

`FlashRecord` contains `value: unknown`, `at: number` (last flash time, or `-Infinity` before the first flash), and `dir: Direction`. `Direction` is `"up" | "down" | "flat"`. Local memory is lost on unmount; shared memory survives as long as its owner keeps it.

### The hook

`useFlash<E extends HTMLElement>(ref: RefObject<E | null>, value: unknown, options?: FlashOptions): void` from `@/hooks/use-flash` flashes your own element. It takes `value` as its second argument and the flash options from the prop table as its third, including `color`. `children` and div attributes belong to the component.

Give your element CSS for its `data-direction` states to make the static fallback visible. In reduced motion or without Web Animations, the hook sets only the attribute; it does not apply inline color. A custom `color`, such as `var(--primary)`, changes animated keyframes only, so supply matching fallback styles yourself.

The same module exports these helpers:

| Helper | Returns | Behavior |
|---|---|---|
| `compareValues(prev: unknown, next: unknown)` | `number \| null` | Numeric difference for finite numbers; otherwise `0` for identical values and `null` for a change. |
| `directionOf(prev: unknown, next: unknown, compare = compareValues)` | `Direction` | Positive comparison → `up`; zero or `null` → `flat`; otherwise `down`. Custom comparators should return a signed number, zero, or `null`, not `NaN`. |
| `directionClass(dir: Direction \| null \| undefined)` | `string` | `text-up`, `text-down`, or `text-flat`; null and undefined map to flat. |
| `createFlashMemory(max = 50_000)` | `FlashMemory` | Create the bounded memory described above. |
| `playFlash(el: HTMLElement, dir: Direction, opts)` | `void` | Start or resume directly, without value tracking. Requires `windowMs: number` and `variant: "fill" \| "ring"`; accepts `color?: string` and `elapsed?: number` (default `0`, clamped to the window). |

`Compare` is the exported comparator type. `FILL_COLORS` and `RING_COLORS` are `Record<Direction, string>` maps to the soft and solid CSS tokens.

### Tokens

The install adds the market tokens to your stylesheet, `up`, `down`, `flat`, and their `-soft` variants, usable as `text-up`, `bg-down-soft`, and so on. Your own values survive a later install.
