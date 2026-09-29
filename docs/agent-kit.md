# agent-kit

Give a coding agent tradecn's rules, a way to find the item that fits, and a check it can run on the screen it built. The install puts a skill, an instructions file and a review prompt under `.github/`, where GitHub Copilot loads them on its own, and adds `checkContract` in `lib/agent-kit.ts`.

## Usage

The preview checks a quote row in the page. Turn off the direction cue and the check reports a value colored by direction with nothing else saying which way. Take the refresh button's name away and it reports a control with no accessible name.

Run the same check in an end-to-end test, on every screen a change touched:

```ts
import { expect, test } from "@playwright/test"
import { checkContract } from "../src/lib/agent-kit"

test("the blotter keeps the contract", async ({ page }) => {
  await page.goto("/")
  const report = await page.evaluate(checkContract, { root: "[data-slot='tradecn-blotter']" })
  expect(report.findings).toEqual([])
  expect(report.checked.numeric).toBeGreaterThan(0)
})
```

`checkContract` uses nothing outside its own body, so `page.evaluate` sends it to the page as it is. Point the import at wherever the CLI put `lib/agent-kit.ts`.

## What the agent reads

| Installed at | For |
|---|---|
| `.github/skills/tradecn/SKILL.md` | The skill: find the item first, write the screen down, the ten rules, the check and the review. Copilot reads its description and loads the rest when a task matches. |
| `.github/skills/tradecn/references/items.md` | Every item at the tag by kind, with what it's for and what it exports. |
| `.github/skills/tradecn/references/review.md` | The walk to finish UI work with, and the change order to write when someone else makes the fixes. |
| `.github/instructions/tradecn.instructions.md` | Ten rules Copilot applies to every `.tsx` file it works on. |
| `.github/prompts/tradecn-review.prompt.md` | `/tradecn-review`: the walk, with the findings written as a change order. |

The CLI puts these at the project root, where `components.json` is. Copilot reads them from the repository root, so in a monorepo move `.github/` there. They're plain Markdown in the Agent Skills layout, so an agent that reads skills from another folder can use them from there.

## API Reference

### checkContract

`checkContract(options?: ContractOptions): ContractReport` checks a rendered subtree and returns what breaks the contract. It throws when `root` names nothing, so a mistyped selector fails instead of passing.

| Option | Type | Default | Description |
|---|---|---|---|
| `root` | `ParentNode \| string` | `document` | The subtree, as an element or a selector. |
| `rules` | `readonly ContractRule[]` | All four | The rules to run. |
| `floorPx` | `number` | `--tradecn-text-size-grid-min`, else 12 | The smallest text size, in px. |
| `ignore` | `string` | `"[data-contract-ignore]"` | A selector for subtrees to leave out. An empty string leaves nothing out. |
| `visibleCue` | `boolean` | `false` | Direction needs a leading sign, an arrow or a word a reader can see. |

The report has `findings`, each with its `rule`, `where` (the nearest tradecn slot, then the tag and its data attributes), `text` and `detail`. A password reads as `••••`, so no finding carries one. It also has `checked`, how many elements each rule looked at. A rule that looked at nothing shows zero, so a test can tell an empty check from a pass.

### The rules

| Rule | What it checks |
|---|---|
| `floor` | Drawn text, and fields showing a value or a placeholder, at the floor size or larger. Screen-reader-only, faded-out and transparent text isn't drawn, so it isn't held to it. An empty field's placeholder is measured in its own `::placeholder` style, and SVG paint shows only with some opacity, a stroke only with some width. SVG text is measured as drawn, through its viewBox. A select shows its chosen option, or every option in a list box. Rule 14 of [the item contract](contract.md). |
| `numeric` | Digits under a tradecn slot, fields holding a number there, and every `[data-numeric]` node, set in `lining-nums tabular-nums`. Rule 14, read the way the site and the browser matrix read it. |
| `direction` | A value with a number in it, in text or in a field, drawn in the up or down token or sitting on one of their fills, also carries a leading sign, an arrow, a `data-direction` or `data-side` on the value, its colored run, or the cell or row that holds it, or an accessible label or description that states it, on the value or its colored run: its own, one it points to, or a native label. A label counts only where the element takes a name, never on a plain span or div, which ARIA doesn't let a screen reader announce; a description counts anywhere. The colored run is the value and up to three wrappers around it that share its color, the checked root among them. A grid rule's highlight in the up or down tone is the rule's color rather than a direction, so the description of the rule that paints the value counts for it. A hidden sign says nothing, and under `visibleCue` neither does a screen-reader-only or transparent one. Under `aria-hidden`, which a screen reader skips, only a cue a sighted reader sees counts, and a label or description there says nothing. SVG text is drawn in its fill and stroke, so those are what count there. Text with no number in it isn't held to it, and a word that states the direction (up, down, buy, sell, bid, ask and their kin) is a cue of its own, and an element's edge ends a word, so `Up` and `10` in two spans read as a word and a number. A sign is read as drawn, so `99` and `-16` in two spans stay one price, with no sign. Units excuse nothing: `10 lots` in the up color needs a cue like any number. Rule 15. |
| `name` | Every visible control outside an `aria-hidden` or `inert` subtree, a disclosure's summary and a tree item among them, has an accessible name: `aria-labelledby`, `aria-label`, a label, a title, a text field's placeholder, an image input's `alt`, or the text it shows, where a labelled icon inside names its button. A reference or a label is read the way a screen reader reads it: an image by its alt, a part by its own label, nothing hidden. A field, a select, a combobox or an editable region takes no name from what it holds, a grid or a list box none from its cells, and hidden text names nothing. A role is read the way a browser reads a list of them, by the first one it knows in any case, so `role="switch checkbox"` is a switch and a cell or a row is found by its role before its tag. |

`CONTRACT_RULES` lists them in that order.

### What it does not do

It reads computed styles, so it runs in a browser or in a DOM that computes them. It doesn't check contrast, which `scripts/themes.test.ts` holds the themes to, or visible focus, layout and clipping, which the review walks by eye. It doesn't look at shapes without text for direction: a dot, a bar or a line needs a label of its own. A color inside another theme's scope, or mixed with transparency, isn't matched to a direction token. HTML text is measured at its computed size, so a CSS transform that shrinks it goes unseen, and text faded out mid-transition isn't read until it shows. Direction words are read in English, so a value that says its direction in another language wants a sign or `data-direction` as well. The skill and the review ask for what the check can't see.

### The item index

`references/items.md` is written from `registry.json` by `just agent-kit`, and a test fails when a change to the registry leaves it stale.
