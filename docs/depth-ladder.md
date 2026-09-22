# DepthLadder

A price ladder centered on the market: bid and ask sizes per tick, the desk's own size marked, one flash per level change, and a click that stages a price and a side.

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

The ladder renders `2 × depth + 1` rungs around a center and virtualizes them, so the depth costs nothing on screen. Each rung subscribes to its own level through `useRow`, so a batch that changes one price re-renders one rung.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<DepthLevel>` | Required | Levels keyed by `levelId(tick)`. |
| `convention` | `InstrumentConvention` | Required | Prints prices and sets the tick size. |
| `mid` | `number \| null \| undefined` | Required | The market's mid, as a price. Null or undefined before any mid shows the empty state. |
| `label` | `string` | Required | Accessible name of the ladder. |
| `depth` | `number` | `200` | Ticks above and below the center. |
| `rowHeight` | `number` | `22` | Rung height in px. |
| `overscan` | `number` | `8` | Extra rungs rendered beyond the viewport. |
| `onStage` | `(stage: LadderStage) => void` | None | Receive a click or Enter on a size cell. |
| `formatSize` | `(size: number) => string` | `formatQuantity` | Print a size. Keep it stable between renders. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `labels` | `Partial<DepthLadderLabels>` | `DEFAULT_DEPTH_LADDER_LABELS` | Override the words listed below. |
| `emptyState` | `ReactNode` | `labels.noMarket` | Content before the first mid. |
| `className` | `string` | None | Classes on the root. |
| `initialRect` | `{ width: number; height: number }` | None | Viewport size in px before measurement, for tests or server rendering. |

### Levels

| Field | Type | Required | Purpose |
|---|---|---|---|
| `tick` | `number` | Yes | The price as a count of ticks from zero; the row id is `levelId(tick)`. |
| `bidSize` | `number \| null` | No | Size on the bid. Absent, null, or zero prints nothing. |
| `askSize` | `number \| null` | No | Size on the offer. |
| `myBid` | `number \| null` | No | The desk's own size on the bid; marks the rung `data-mine`. |
| `myAsk` | `number \| null` | No | The desk's own size on the offer. |

Three helpers convert between prices and ticks:

| Function | Returns |
|---|---|
| `levelId(tick)` | The tick as a string, the store's row id. |
| `tickIndexOf(price, tickSize)` | `Math.round(price / tickSize)`; `99.515625` on `1 / 64` is `6369`. |
| `priceAtTick(tick, tickSize)` | The price on the grid, cleaned of float noise; `6369` on `1 / 64` is `99.515625`. |

A rung with no level prints its price and empty size cells. The ladder never writes or removes a level.

### The center

Prices run high to low. While following, the rung at `tickIndexOf(mid)` stays in the middle of the viewport after every change to `mid`, carries `data-mid`, and is described as `Mid`. The root carries `data-following="true"`.

A pointer press, a wheel, a scroll, or a navigation key on the ladder stops following: the prices on screen stay where they are while the market moves, and a `Recenter` button appears over the bottom edge. Pressing it, or Home, puts the mid back in the middle and follows again. The range of rungs is built around the first mid and rebuilt around a mid that drifts more than half the depth while following; it never moves under a hand. A market that goes away after the ladder is built leaves the prices up and drops the mid mark.

### Staging

A click on a bid cell calls `onStage` with `side: "buy"`, a click on an ask cell with `side: "sell"`, at that rung's price:

| Field | Type | Purpose |
|---|---|---|
| `price` | `number` | `priceAtTick(tick, convention.tick)`. |
| `side` | `"buy" \| "sell"` | The bid column buys, the ask column sells. |
| `tick` | `number` | The rung's tick index. |
| `level` | `DepthLevel \| undefined` | The store's level at that price, if any. |

A click on a price cell moves the focus and stages nothing. The ladder sends nothing; a ticket or your application decides what a staged price becomes.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-side="bid" \| "ask"` | Size cells | The side the size rests on. Bid sizes print in `up` and ask sizes in `down`, under headers that name them. |
| `data-mine="bid" \| "ask" \| "both"` | Rungs | The desk has size on this rung. The own size prints in a `primary` chip before the market's, followed by `yours` for a screen reader. |
| `data-mid` | One rung | The market's mid. |
| `data-focused` and `data-focused-col` | A rung and a cell | The keyboard focus. |
| `data-direction` | Size cells | The flash's direction for its window: `up` when the size grew, `down` when it shrank. |

### Keyboard

With focus on the ladder:

| Key | Action |
|---|---|
| Up / Down | Move the focus one tick, starting from the mid. Stops following. |
| PageUp / PageDown | Move the focus by a viewport of rungs. |
| Left / Right | Move the focus between the bid, price, and ask columns. |
| Enter | Stage the focused size cell's price and side. |
| Home | Recenter on the mid and follow it again. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the ladder, such as a hotkey registry. |

`aria-activedescendant` names the focused rung.

### Labels

`labels` merges partial overrides into `DEFAULT_DEPTH_LADDER_LABELS`:

| Label | Default | Where |
|---|---|---|
| `bid` / `price` / `ask` | `Bid` / `Price` / `Ask` | Column headers |
| `recenter` | `Recenter` | The button shown while not following |
| `mine` | `yours` | Screen-reader text after the desk's own size |
| `mid` | `Mid` | Screen-reader description of the mid rung |
| `noMarket` | `No market` | The empty state |

### What it does not do

It does not build the book, aggregate sizes, work out the mid, or send an order. Feed the store from your book, pass the market's mid, and handle `onStage` in your ticket.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them. The bid and ask columns use the first two, and the flashes use all three.
