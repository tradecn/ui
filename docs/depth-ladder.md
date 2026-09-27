# DepthLadder

A composable price ladder with virtual rows, size flashes, and order staging.

## Usage

```tsx
import { useState } from "react"
import { createInstrumentFormatter, type InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { DepthLadder, DepthLadderHeader, DepthLadderColumnHeader, DepthLadderViewport, DepthLadderEmpty, DepthLadderRows, DepthLadderRow, DepthLadderSizeCell, DepthLadderPriceCell, DepthLadderRecenter, levelId, tickIndexOf, type DepthLevel, type LadderStage } from "@/components/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const format = createInstrumentFormatter(ZN)
const mid = 110.5
const tick = tickIndexOf(mid, ZN.tick)

function renderLadderRow() {
  return (
    <DepthLadderRow>
      <DepthLadderSizeCell side="bid" />
      <DepthLadderPriceCell />
      <DepthLadderSizeCell side="ask" />
    </DepthLadderRow>
  )
}

function Ladder() {
  const [store] = useState(() => {
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: [
      { tick: tick - 2, bidSize: 300, myBid: 25 },
      { tick: tick - 1, bidSize: 220 },
      { tick: tick + 1, askSize: 180 },
      { tick: tick + 2, askSize: 320, myAsk: 15 },
    ] })
    return store
  })
  const [staged, setStaged] = useState<LadderStage | null>(null)
  return (
    <div className="w-72 max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-56">
        <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ladder" depth={4} onStage={setStaged}>
          <DepthLadderHeader>
            <DepthLadderColumnHeader column="bid" />
            <DepthLadderColumnHeader column="price" />
            <DepthLadderColumnHeader column="ask" />
          </DepthLadderHeader>
          <DepthLadderViewport>
            <DepthLadderEmpty />
            <DepthLadderRows>{renderLadderRow}</DepthLadderRows>
          </DepthLadderViewport>
          <DepthLadderRecenter className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2" />
        </DepthLadder>
      </div>
      <p role="status" className="text-muted-foreground">{staged ? `Staged: ${staged.side} at ${format.price(staged.price)}.` : "Nothing staged."}</p>
    </div>
  )
}
```

Key levels with `levelId(tickIndexOf(price, convention.tick))`. Click a size cell or select it with the arrows and press Enter to stage its price and side. Your application handles `onStage`.

## Composition

Compose the ladder with these parts:

```text
DepthLadder
├── DepthLadderHeader
│   ├── DepthLadderColumnHeader (bid)
│   ├── DepthLadderColumnHeader (price)
│   └── DepthLadderColumnHeader (ask)
├── DepthLadderViewport
│   ├── DepthLadderEmpty
│   └── DepthLadderRows
│       └── DepthLadderRow
│           ├── DepthLadderSizeCell (bid)
│           │   ├── DepthLadderOwnSize
│           │   └── DepthLadderSize
│           ├── DepthLadderPriceCell
│           └── DepthLadderSizeCell (ask)
│               ├── DepthLadderOwnSize
│               └── DepthLadderSize
└── DepthLadderRecenter
```

`DepthLadderRows` calls your render function for each mounted tick. Return one `DepthLadderRow` with cells in the same order as `columns`. Keep the render function, column array, convention, and formatters stable when the parent receives frequent updates.

## Book updates

Apply book deltas to update the affected rows. Only market-size changes flash.

<!-- demo: depth-ladder-updates -->

## Following the market

Use `DepthLadderRecenter` to resume following after a pointer, scroll, or navigation key holds the prices still.

<!-- demo: depth-ladder-following -->

## Custom layout

Set `columns` and `order` to match your layout, and compose size readings and controls where you need them.

<!-- demo: depth-ladder-layout -->

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
| `labels` | `Partial<DepthLadderLabels>` | [Default labels](#labels) | Override the words listed below. |
| `children` | `ReactNode` | Required | The header, viewport, rows, controls, and application content. |
| `columns` | `readonly LadderColumn[]` | `["bid", "price", "ask"]` | Visual and keyboard column order. Use a nonempty array of distinct columns. |
| `order` | `"ascending" \| "descending"` | `"descending"` | Price order from top to bottom. |
| `headerRows` | `number` | `1` | Header rows included in accessible row indices. Set to `0` when omitting the header. |
| `className` | `string` | None | Classes on the root. |
| `initialRect` | `{ width: number; height: number }` | None | Viewport size in px before measurement, for tests or server rendering. |

The root accepts native `div` props and a ref.

Give it a bounded height and mount one `DepthLadderViewport` containing one `DepthLadderRows`. Keep the viewport and rows mounted when the market is missing. `DepthLadderEmpty` handles the initial empty state.

Use a nonnegative integer `depth`, a positive `rowHeight`, and nonnegative integer `overscan`.

### Parts

| Part | Props | Default content |
|---|---|---|
| `DepthLadderHeader` | Native `div` props. | Caller-owned column headers. |
| `DepthLadderColumnHeader` | Native `div` props and required `column: LadderColumn`. | `labels[column]`. |
| `DepthLadderViewport` | Native `div` props. | Caller-owned rows and empty state. |
| `DepthLadderRows` | Native `div` props with required `children: (row: DepthLadderRowState) => ReactNode`. | One callback per mounted tick. |
| `DepthLadderRow` | Native `div` props and required `children`. | Caller-owned cells. |
| `DepthLadderSizeCell` | Native `div` props and required `side: "bid" \| "ask"`. | Own size followed by market size. |
| `DepthLadderPriceCell` | Native `div` props. | The formatted price. |
| `DepthLadderSize` | Native `span` props except `children`, and required `side`. | The formatted market size. |
| `DepthLadderOwnSize` | Native `span` props except `children`, and required `side`. | The own-size chip and `labels.mine`. Absent for a blank size. |
| `DepthLadderEmpty` | Native `div` props. | `labels.noMarket`. Only before the first finite mid. |
| `DepthLadderRecenter` | The installed shadcn `Button` props. | `labels.recenter`. Only while held with a finite mid. |

All rendered parts forward refs and accept `className`.

Native event handlers run first. `preventDefault()` cancels the corresponding ladder action. Cell clicks on nested buttons, links, and form controls keep their own behavior.

Explicit cell children replace the default readings, including `null` to suppress them.

Keep visible side labels and an own-size description in custom content so color is not the only cue.

Place Recenter in your toolbar or position it with classes as in Usage. Keep the part mounted so it can hide itself and return focus to the grid when its focused button disappears or becomes disabled.

The row height and transform, and the rows container height, are reserved for virtualization. Set `rowHeight` on the root.

Set `--depth-ladder-columns` on the root's style to customize track widths consistently across headers and rows.

Preserve generated row IDs when using the built-in keyboard navigation.

### Hooks

`useDepthLadder()` reads the root's `following`, `hasMarket`, `hasRows`, and `labels`, with `hold()`, `recenter()`, and `focus()` for custom controls.

A replacement control owns its native activation and any focus recovery when it disappears.

`recenter()` does nothing without a finite mid and retains the selected tick and column.

`useDepthLadderRow()` reads the current subscribed row inside `DepthLadderRows`.

The render callback receives the same state. Neither adds a store subscription.

| Row field | Type | Purpose |
|---|---|---|
| `tick`, `index`, `price` | `number` | Tick identity, zero-based visual index, and price. |
| `priceText` | `string` | Price formatted through the convention. |
| `level` | `DepthLevel \| undefined` | The current store row. |
| `bidSize`, `askSize`, `myBid`, `myAsk` | `number \| null` | Normalized size readings. |
| `isMid` | `boolean` | Whether this tick is the current market mid. |
| `focusedColumn` | `LadderColumn \| null` | The selected column when this row is selected. |
| `select` | `(column: LadderColumn) => void` | Hold the ladder, focus the grid, select a cell, and stage a bid or ask. |

### Levels

| Field | Type | Required | Purpose |
|---|---|---|---|
| `tick` | `number` | Yes | The price as a count of ticks from zero. The row id is `levelId(tick)`. |
| `bidSize` | `number \| null` | No | Size on the bid. |
| `askSize` | `number \| null` | No | Size on the offer. |
| `myBid` | `number \| null` | No | The desk's own size on the bid. Marks the rung `data-mine`. |
| `myAsk` | `number \| null` | No | The desk's own size on the offer. |

Absent, null, zero, and nonfinite sizes print nothing and do not mark own size.

Finite nonzero sizes, including negative values, pass to `formatSize`. Its default, `formatQuantity`, rounds to whole numbers with en-US grouping.

Prices use `convention.price`. The ladder does not switch to `quoteBasis` or scale sizes by `quantityUnit`.

See [format](format.md) for the conventions.

Three helpers convert between prices and ticks:

| Function | Return type | Result |
|---|---|---|
| `levelId(tick: number)` | `string` | The tick as a string, the store's row id. |
| `tickIndexOf(price: number, tickSize: number)` | `number` | `Math.round(price / tickSize)`. `99.515625` on `1 / 64` is `6369`. |
| `priceAtTick(tick: number, tickSize: number)` | `number` | `roundToTick(tick * tickSize, tickSize)`. `6369` on `1 / 64` is `99.515625`. |

Use integer tick indices and a finite positive tick size. The helpers do not validate these inputs. `priceAtTick` inherits `roundToTick`'s cleanup precision of at most eight decimal places.

A rung with no level prints its price and empty size cells.

The ladder looks up levels by id, ignores store order, and never writes or removes a level.

Aggregate each price before feeding the [row store](row-store.md). Upserting the same id replaces the level.

### The center

Prices run high to low by default. `order="ascending"` reverses them. While following, the ladder centers `tickIndexOf(mid, convention.tick)` when that tick changes, within the scrollable bounds.

The mid rung carries `data-mid` and is described as `Mid`. The root carries `data-following="true"`.

A pointer press or wheel event in the scrolling body, a scroll away from the centered offset, or an arrow or page key stops following. The anchored price range stays fixed while the market moves. With a finite mid, a mounted `DepthLadderRecenter` becomes visible. Pressing it, or Home, centers the range on the current mid and follows again.

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

An empty size cell stages too, with `level: undefined` when the store has no level.

A click on a price cell moves the focus and stages nothing.

The ladder sends nothing. A ticket or your application decides what a staged price becomes.

### Marks

| Attribute | Where | Meaning |
|---|---|---|
| `data-side="bid" \| "ask"` | Size cells | The side the size rests on. Bid sizes print in `up` and ask sizes in `down`, under headers that name them. |
| `data-mine="bid" \| "ask" \| "both"` | Rungs | The desk has size on this rung. The own size prints in a `primary` chip before the market's, followed by `yours` for a screen reader. |
| `data-mid` | One rung | The market's mid. |
| `data-focused` and `data-focused-col` | A rung and a cell | The keyboard focus. |
| `data-direction` | Size cells | `up` or `down` between nonzero market sizes. `flat` when changing to or from blank. |

Each mounted bid and ask cell flashes independently when its normalized market size changes. The first value, an unchanged size, and own-size-only changes do not flash.

Changes on both sides flash both cells.

Flash history is local to the mounted cell, so it is lost when virtualization unmounts the rung.

Flashes use a static tint for reduced motion or without Web Animations, cleared after `flashWindowMs`. See [useFlash](flash-cell.md) for the animation behavior.

### Keyboard

With focus on the ladder:

| Key | Action |
|---|---|
| Up / Down | Move one visual row up or down, starting from the mid. Stops following. |
| PageUp / PageDown | Move the focus by a viewport of rungs. |
| Left / Right | Move between the declared `columns`, in visual order. |
| Enter | Stage the focused size cell's price and side. |
| Home | Recenter on a finite mid and follow it again. Keeps the focused tick and column. |
| Ctrl, Cmd, or Alt with any key | Left to listeners above the ladder, such as a hotkey registry. |

The root is a focusable grid named by `label`.

Its column count follows `columns`. `aria-rowcount` includes `headerRows` and the full anchored range.

Mounted rungs report their row indices. `aria-activedescendant` names the selected tick only while its row is mounted.

A cell click focuses the grid.

Nested controls keep their native keys, and composing keys are left alone.

Recenter does not reset keyboard focus. If the selected tick is no longer mounted, its focus mark and `aria-activedescendant` disappear, but Enter on the grid still stages that stored tick and side if the column remains in `columns`. Select a rung in the new range before using Enter.

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

Feed the aggregated book and market mid from your application. Handle `onStage` in your ticket, including permissions and any order submission. The ladder sends no orders and makes no live announcements. Compose a status region when staging needs one.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them. The bid and ask columns use the first two, and the flashes use all three.
