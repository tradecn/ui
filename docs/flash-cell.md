# FlashCell

A cell that flashes on change, colored up, down, or flat, as a fill or an inset ring.

## Usage

```tsx
import { FlashCell } from "@/components/ui/flash-cell"
```

```tsx
<FlashCell value={quote.px}>{format.price(quote.px)}</FlashCell>
<FlashCell value={level.size} variant="ring" />
```

## API Reference

- Direction is a tri-state. A rise flashes `up`, a fall `down`, and zero or a non-numeric change flashes `flat`. Zero is never up.
- The flash is a Web Animations API animation on the cell's own element, from the soft token to transparent (or an inset ring from the solid token). Nothing remounts, so a burst of ticks costs a cancel and a new animation per tick, not a reconcile. A new tick cancels the running flash and starts over.
- The previous value lives outside React. By default each cell keeps its own; a grid passes a shared `createFlashMemory()` and a `cellKey` per row and column, so a virtualized row that scrolls out and back within the window resumes its flash at the right point instead of losing it or restarting.
- The window defaults to 900 ms. `data-direction` is set on the element for its duration, so CSS and tests can see it.
- Under `prefers-reduced-motion` there is no animation: the cell shows the static color for the window, then clears.
- Color is never the only channel. Pair it with `formatSigned` (which prints `+` and the minus sign) or `directionClass(dir)` for `text-up`/`text-down`/`text-flat`.

`flashOnEqual` flashes flat when the same value arrives again; pass `revision` (the row object or a store version) so the hook can tell it arrived. `disabled` turns the hook off. `compare` replaces the numeric comparison for values that are not numbers.

### The hook

`useFlash(ref, value, options)` from `@/hooks/use-flash` flashes your own element, with `createFlashMemory`, `directionOf`, and `directionClass` beside it.

### Tokens

The install adds the market tokens to your stylesheet, `up`, `down`, `flat`, and their `-soft` variants, usable as `text-up`, `bg-down-soft`, and so on. Your own values survive a later install.
