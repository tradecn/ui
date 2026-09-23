# DepthLadder

A price ladder centered on the market: bid and ask sizes per tick, the desk's own size marked, flashes when market sizes change, and a click that stages a price and a side.

## Usage

```tsx
import { DepthLadder, levelId, tickIndexOf, type DepthLevel } from "@/components/ui/depth-ladder"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const book = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })

// once per frame, from your book feed
book.applyDeltas({
  upsert: [{ tick: tickIndexOf(110.484375, ZN.tick), bidSize: 220, myBid: 25 }],
  remove: [levelId(tickIndexOf(110.46875, ZN.tick))],
})

<DepthLadder store={book} convention={ZN} mid={market.mid} label="ZN ladder" onStage={({ price, side }) => ticket.stage({ price, side })} />
```

Key levels by tick index, not by price: `tickIndexOf` rounds a price to the grid, and `levelId` is the row id the store and the ladder agree on.

## API Reference

The ladder defines `2 × depth + 1` rungs around a center and mounts the visible rungs plus overscan. Each mounted rung subscribes to its own level through `useRow`, so a store batch that changes one price updates that rung without rendering its neighbors.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<DepthLevel>` | Required | Levels keyed by `levelId(tick)`. |
| `convention` | `InstrumentConvention` | Required | Prints prices and sets the tick size. |
| `mid` | `number \| null \| undefined` | Required | The market's mid, as a price. Null, undefined, or nonfinite before the first finite mid shows the empty state. |
| `label` | `string` | Required | Accessible name of the ladder. |
| `depth` | `number` | `200` | Ticks above and below the center. |
| `rowHeight` | `number` | `22` | Rung height in px. |
| `overscan` | `number` | `8` | Extra rungs rendered beyond the viewport. |
| `onStage` | `(stage: LadderStage) => void` | None | Receive a click or Enter on a size cell. |
| `formatSize` | `(size: number) => string` | `formatQuantity` | Print market and own sizes. Keep it stable between renders. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `labels` | `Partial<DepthLadderLabels>` | `DEFAULT_DEPTH_LADDER_LABELS` | Override the words listed below. |
| `emptyState` | `ReactNode` | `labels.noMarket` | Content before the first finite mid. |
| `className` | `string` | None | Classes on the root. |
| `initialRect` | `{ width: number; height: number }` | None | Viewport size in px before measurement, for tests or server rendering. |

### Levels

| Field | Type | Required | Purpose |
|---|---|---|---|
| `tick` | `number` | Yes | The price as a count of ticks from zero; the row id is `levelId(tick)`. |
| `bidSize` | `number \| null` | No | Size on the bid. |
| `askSize` | `number \| null` | No | Size on the offer. |
| `myBid` | `number \| null` | No | The desk's own size on the bid; marks the rung `data-mine`. |
| `myAsk` | `number \| null` | No | The desk's own size on the offer. |

Absent, null, zero, and nonfinite sizes print nothing and do not mark own size. Finite nonzero sizes, including negative values, pass to `formatSize`. Its default, `formatQuantity`, rounds to whole numbers with en-US grouping. Prices use `convention.price`; the ladder does not switch to `quoteBasis` or scale sizes by `quantityUnit`. See [format](format.md) for the conventions.

Three helpers convert between prices and ticks:

| Function | Return type | Result |
|---|---|---|
| `levelId(tick: number)` | `string` | The tick as a string, the store's row id. |
| `tickIndexOf(price: number, tickSize: number)` | `number` | `Math.round(price / tickSize)`; `99.515625` on `1 / 64` is `6369`. |
| `priceAtTick(tick: number, tickSize: number)` | `number` | `roundToTick(tick * tickSize, tickSize)`; `6369` on `1 / 64` is `99.515625`. |

Use integer tick indices and a finite positive tick size. The helpers do not validate these inputs; `priceAtTick` inherits `roundToTick`'s cleanup precision of at most eight decimal places.

A rung with no level prints its price and empty size cells. The ladder looks up levels by id, ignores store order, and never writes or removes a level. Aggregate each price before feeding the [row store](row-store.md); upserting the same id replaces the level.

### The center

Prices run high to low. While following, the ladder centers `tickIndexOf(mid, convention.tick)` when that tick changes, within the scrollable bounds. The mid rung carries `data-mid` and is described as `Mid`. The root carries `data-following="true"`.

A pointer press or wheel event in the scrolling body, a scroll away from the centered offset, or an arrow or page key stops following. The anchored price range stays fixed while the market moves. With a finite mid, a `Recenter` button appears over the bottom edge; pressing it, or Home, centers the range on the current mid and follows again.

The range starts at the first finite mid and rebuilds around a mid that drifts more than half the depth while following. It stays fixed while held.

A missing or nonfinite mid after the ladder is built leaves the prices up, removes the mid mark, and hides Recenter. Home does nothing until a finite mid returns.

### Staging

A click on a bid cell calls `onStage` with `side: "buy"`, a click on an ask cell with `side: "sell"`, at that rung's price:

| Field | Type | Purpose |
|---|---|---|
| `price` | `number` | `priceAtTick(tick, convention.tick)`. |
| `side` | `"buy" \| "sell"` | The bid column buys, the ask column sells. |
| `tick` | `number` | The rung's tick index. |
| `level` | `DepthLevel \| undefined` | The store's level at that price, if any. |

An empty size cell stages too, with `level: undefined` when the store has no level. A click on a price cell moves the focus and stages nothing. The ladder sends nothing; a ticket or your application decides what a staged price becomes.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-side="bid" \| "ask"` | Size cells | The side the size rests on. Bid sizes print in `up` and ask sizes in `down`, under headers that name them. |
| `data-mine="bid" \| "ask" \| "both"` | Rungs | The desk has size on this rung. The own size prints in a `primary` chip before the market's, followed by `yours` for a screen reader. |
| `data-mid` | One rung | The market's mid. |
| `data-focused` and `data-focused-col` | A rung and a cell | The keyboard focus. |
| `data-direction` | Size cells | `up` or `down` between nonzero market sizes; `flat` when changing to or from blank. |

Each mounted bid and ask cell flashes independently when its normalized market size changes. The first value, an unchanged size, and own-size-only changes do not flash. Changes on both sides flash both cells. Flash history is local to the mounted cell, so it is lost when virtualization unmounts the rung.

Flashes use a static tint for reduced motion or without Web Animations, cleared after `flashWindowMs`. See [useFlash](flash-cell.md) for the animation behavior.

### Keyboard

With focus on the ladder:

| Key | Action |
|---|---|
| Up / Down | Move the focus one tick, starting from the mid. Stops following. |
| PageUp / PageDown | Move the focus by a viewport of rungs. |
| Left / Right | Move the focus between the bid, price, and ask columns. |
| Enter | Stage the focused size cell's price and side. |
| Home | Recenter on a finite mid and follow it again. Keeps the focused tick and column. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the ladder, such as a hotkey registry. |

The root is a focusable grid with three columns. `aria-rowcount` includes the header and the full anchored range; mounted rungs report their row indices. `aria-activedescendant` names the focused tick while it remains in that range, even if scrolling has unmounted its rung.

Recenter does not reset keyboard focus. If the new range excludes the focused tick, its focus mark and `aria-activedescendant` disappear, but a focused size cell still stages that stored tick and side on Enter. Select a rung in the new range before using Enter.

### Labels

`labels` merges partial overrides into `DEFAULT_DEPTH_LADDER_LABELS`:

| Label | Default | Where |
|---|---|---|
| `bid` / `price` / `ask` | `Bid` / `Price` / `Ask` | Column headers |
| `recenter` | `Recenter` | The button shown while not following with a finite mid |
| `mine` | `yours` | Screen-reader text after the desk's own size |
| `mid` | `Mid` | Screen-reader description of the mid rung |
| `noMarket` | `No market` | The empty state |

### What it does not do

It does not build the book, aggregate sizes, work out the mid, or send an order. Feed the store from your book, pass the market's mid, and handle `onStage` in your ticket.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them. The bid and ask columns use the first two, and the flashes use all three.
