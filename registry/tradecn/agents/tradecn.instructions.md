---
name: tradecn
description: Rules for UI code in an app built from tradecn/ui items.
applyTo: "**/*.tsx"
---

This app's UI is built from tradecn/ui. [The tradecn skill](../skills/tradecn/SKILL.md) has the detail, and [its item list](../skills/tradecn/references/items.md) names every item.

- Use an installed tradecn item before writing a component of your own.
- Set every number in lining tabular figures with `NUMERIC_CLASS`, `MONO_NUMERIC_CLASS` or `numericFontClass` from `@/lib/format`, and format prices, sizes, spreads and changes through `format`.
- Keep text at 12 px or more. `text-xs` is the smallest size. Reach fonts through the `--tradecn-font-*` tokens.
- Never let color carry direction alone. Pair `text-up` and `text-down` with a sign, an arrow or a word, and with `data-direction`.
- Feed rows through a row store and subscribe per row. Never keep ticks in React state.
- Give every action a key through `use-hotkeys`, under its panel's `HotkeyScope`. An arrival never moves focus or the active row.
- Show the server's status words and allowed actions. An edit stays pending until the row carries the value.
- Use the grid presets for density. No gradients, cards inside cards, hero headers or decorative icons.
- Every panel shows its empty, loading, stale, disconnected, pending and refused states.
- Before calling UI work done, run `checkContract` from `lib/agent-kit.ts` on the screens you changed, and walk [the review](../skills/tradecn/references/review.md).
