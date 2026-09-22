# tradecn-terminal-classic

The terminal theme with green for up and red for down, and everything else as `tradecn-terminal` has it.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-terminal-classic --diff
```

## API Reference

Read [`tradecn-terminal`](tradecn-terminal.md) first: everything there about overwriting, both modes carrying one palette, and how the colors are checked is true of this one too.

### What differs

Four tokens, in both modes, and nothing else: `up`, `down`, `up-soft`, and `down-soft`. There is a test that fails if the two themes ever differ anywhere else, so a fix to one palette cannot miss the other.

Install one or the other. Each sets every variable, so whichever goes in last is the one you have, and going from one to the other is a second `add`.

### What you give up

The default pair, a bluish green and a vermillion, was chosen because it survives deuteranopia and protanopia and still separates in a luminance-only view. Green and red are the pair those same conditions confuse. This theme exists because a screen that has always been green and red is sometimes a requirement and not a preference, and the people who trade on it get to make that call.

Direction is still never carried by color alone, and with this theme that matters more, not less. Signed formats print `+` and the real minus sign, a flash sets `data-direction`, a sparkline says its direction in its accessible name, and a blotter prints `BUY` and `SELL` as words.

### The colors are checked

By the same test as `tradecn-terminal`, at the same 4.5 to 1. Here `up` is 10.50 to 1 on the background and 9.77 on a card; `down` is 6.08 and 5.66. The browser matrix installs this theme alone into each of the three consumers, runs every other test under it, and reads the colors back out of the page.

In this theme `down`, `destructive`, `panel-error`, and `link-1` are all reds of nearly one hue. A link dot carries its number and an error border is on a panel, not a price, so none of them is read by color alone, but they will look alike.

### Typography

It sets the typography tokens with the rest, at their defaults, with one exception: a terminal is a monospace screen, so `--tradecn-font-numeric` is `var(--tradecn-font-mono)` and a grid's prices set in the mono stack instead of the sans, a design preference that keeps a themed grid in one family. Below its variables it appends three base rules: `font-variant-numeric: lining-nums tabular-nums` on `:root` and on `.tradecn-num, [data-numeric]`, and the `data-accessibility="hyperlegible"` remap. The typography release added tokens and rules and renamed or removed nothing, so a `--diff` against an earlier install shows additions only. [`typography.md`](typography.md) has the tokens, the research, and the checklist.
