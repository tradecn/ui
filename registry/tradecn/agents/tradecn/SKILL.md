---
name: tradecn
description: Build, change and review trading-desk UI made from tradecn/ui, a shadcn registry of trading components (grids, tickets, RFQ stacks, blotters, depth, charts, workspaces, hotkeys, themes). Use it when a task adds or changes a screen, panel, grid, ticket, chart or displayed number in an app that installs tradecn items, when you need the item that fits a need, and before you call UI work done, to run the contract check and the review.
---

# tradecn

tradecn/ui is a registry of trading-terminal components installed with the shadcn CLI, for React 19 applications. Each item is source in this repository: components in `components/ui/`, blocks in `components/`, hooks in `hooks/` and libraries in `lib/`. Compose them. A grid, ticket, stack or palette written by hand where an item already does the job is the most common way a trading screen goes wrong. [references/items.md](references/items.md) lists every item at this tag, with what it's for and what it exports.

## Before you build

1. Find the items. Read [references/items.md](references/items.md), then the item's page, before writing markup.
2. Write the screen down first: the panels, the items and parts in each, the data each reads (the store and the fields, in order), its states and its keys. The review in [references/review.md](references/review.md) checks each one.
3. Install at the app's pinned tag, one URL per argument: `bun x shadcn@4.21.0 add -y -o -c <app dir> https://tradecn.dev/r/<tag>/<item>.json`. Install a theme last and alone, because it replaces the stylesheet's variables. Read an update with `--diff` before taking it.
4. Start from the item's Usage example and compose its public parts. Don't edit an installed file to change what it does. Wrap it, or compose around it. When one has to change, say so in the change, so the next `--diff` stays readable. The blocks — `ticket` and `rfq-ticket` — are the exception: they install into the `components` alias as markup that is yours to edit for layout. The whole block file is then the app's, its exported helpers included; only the shared files it installs beside it keep taking registry updates, and fixes to the block file itself arrive by hand through `--diff`.

## The rules

1. **Numbers.** Set every number in lining tabular figures: `NUMERIC_CLASS`, `MONO_NUMERIC_CLASS` or `numericFontClass(convention)` from `@/lib/format`, or `data-numeric` on your own node once a theme is installed. Write `lining-nums tabular-nums` together, since `tabular-nums` alone drops the lining figures. Right-align numeric columns with `numeric: true` on the column.
2. **Formatting.** Format and parse through `format`: `createInstrumentFormatter(convention)` for prices in the instrument's own notation (32nds such as `99-16+`, decimals, discount), `formatNotional`, `formatBps`, `formatTicks`, `formatSigned` and `parsePrice`. Never format a price by hand.
3. **Size and type.** Nothing renders under 12 px, the floor `--tradecn-text-size-grid-min` names, and `text-xs` is the smallest size to use. A compact shadcn style draws `Badge`, `Kbd`, `CommandShortcut`, `ContextMenuShortcut`, `DropdownMenuShortcut`, `Button size="xs"` and `NativeSelect size="sm"` at 10 px, so set `text-xs` or larger on each one you compose. A small select takes it as `[&_select[data-size=sm]]:text-xs` on the component, whose `className` lands on a wrapper div, because the style's own rule sits on the select inside and outranks the wrapper's plain classes. A key inside an `InputGroupAddon` takes it on the addon as `[&_kbd[data-slot=kbd]]:text-xs`, because the addon's own rule for its keys outranks the key's class. SVG text takes its size in the viewBox's units, so a label on a chart drawn at its own size needs `fontSize={12}` or more. Reach fonts through the tokens, for example `font-(family-name:--tradecn-font-mono)`. Tailwind's own `font-sans`, `font-mono` and `font-serif` skip the app's `--tradecn-font-*` choices. `data-accessibility="hyperlegible"` on `<html>` swaps in the Atkinson Hyperlegible pair.
4. **Direction.** Color never carries direction alone. Print a sign (`formatSigned`), an arrow or a word (Buy, Sell, Bid, Ask), and mark the value `data-direction="up"` or `data-direction="down"`, the two values the check reads. A screen-reader word or an ARIA description helps a screen reader, and `data-direction` lets a test find the value, but a sighted reader needs the sign, the arrow or the word. Pick the theme for the desk's convention: `tradecn-slate` for green up, `tradecn-slate-east` for red up, `tradecn-amber` for blue up. Never recolor up and down inside one component.
5. **Streaming.** Data arrives through a row store (`createRowStore`, `applyDeltas`, and `createFrameBatcher` when messages come one at a time), and components subscribe per row with `useRow` and `useRowIds`. Never keep ticks in React state. Let the grid or `FlashCell` flash a change. Measure a busy screen with `perf-monitor` before and after a change.
6. **Keys and focus.** Every action has a key. Declare bindings once with `use-hotkeys` and attach each handler with `useHotkey` under the `HotkeyScope` of the panel it belongs to, so the focused panel's binding wins; `useHotkey` needs a `HotkeysProvider` above it and throws without one. Keep bare letters out of the `editing` scope, which also runs inside text fields. A dialog is a wall: while focus is inside it, only its own scopes run. An arrival never moves focus or the active row, and `RfqStack` keeps its `activeId` through arrivals, changing it only through `onActivate`. Focus is always visible.
7. **Server truth.** Status words and allowed actions come from the server. Show its status string, draw a button only when the row's allowed actions include it, and leave an edit pending until the row carries the new value. Never change a status locally.
8. **Layout.** Panels live in a `Workspace`, framed by `Panel`. A desktop shell whose windows are separate JavaScript contexts mounts one `Workspace` per window, with `window-set` for the set. A layout is data: `layout-manager` templates, and `preferences` slots with `template`, `user` and `session` boundaries.
9. **Density.** Use the grid presets in `DATA_GRID_PRESETS` (`blotter`, `watchlist`, `rfq`, `option-chain`, `tape`, `parameters`) rather than row heights of your own. A trading screen is dense and quiet: no cards inside cards, no gradients, no hero headers, no decorative icons, and no padding a trader scrolls past. Color is for meaning.
10. **States.** Every panel says what it's showing: empty, loading or resyncing, stale, disconnected, pending, refused, and a burst of arrivals. `feed-health` shows a feed's state and age, and `session-calendar` tells a quiet market from a stale feed.

## Check it

`checkContract` in `lib/agent-kit.ts` reads a rendered screen for rules 1, 3 and 4 and for every control's accessible name. Run it in the project's end-to-end tests, with the import pointing at wherever `lib/agent-kit.ts` landed:

```ts
import { expect, test } from "@playwright/test"
import { checkContract } from "../src/lib/agent-kit"

test("the desk keeps the contract", async ({ page }) => {
  await page.goto("/")
  const report = await page.evaluate(checkContract, { root: "main" })
  expect(report.findings).toEqual([])
  expect(report.checked.numeric).toBeGreaterThan(0)
})
```

Run it on every screen the change touched, in light, dark and hyperlegible mode. Each finding names the tradecn slot, the element and what's wrong. `visibleCue: true` holds direction to a sign, an arrow or a word a reader can see. Mark a subtree `data-contract-ignore` only for a sample that breaks the rules on purpose, and say why beside it.

## Review it

Before calling UI work done, walk [references/review.md](references/review.md), or run the `/tradecn-review` prompt, which walks it and writes the findings as a change order.

## Report

When you finish, list the items you used, the states and keys you walked, the check's findings and its `checked` counts, the screenshots you took, and anything you couldn't verify.
