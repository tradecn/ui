# tradecn-amber

The terminal's amber voice with a day side: warm paper in light, near-black instead of black in dark, and blue and vermilion for up and down.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-amber --diff
```

## API Reference

### This one overwrites

Like every theme it replaces shadcn's variables and sets every tradecn token, the typography tokens at their defaults included. Unlike [`tradecn-terminal`](tradecn-terminal.md) it leaves `--font-sans` alone, so your app keeps its type, and it has two palettes: `light` and `dark` differ. Review it with `--diff` first, and restore your stylesheet from version control to go back.

### Two sides

Light is warm paper (`oklch(0.99 0.004 85)`) with near-black text and an amber primary at 5.1 to 1 on the page, the same amber this site reads in by day. Dark is the terminal's palette on a near-black (`oklch(0.14 0.005 85)`) rather than pure black, with the same amber primary the terminal has. The lighter floor is a design preference for long sessions, not a measured finding: a little light in the background takes the edge off bright text for readers who see it bloom. If you want black, [`tradecn-terminal`](tradecn-terminal.md) is black.

### Blue for up

`up` is Okabe and Ito's blue (`oklch(0.5 0.13 245)` in light, `oklch(0.74 0.12 240)` in dark) and `down` their vermilion. Of the pairs in that palette, blue and vermilion are the two that stay furthest apart under protanopia, deuteranopia, and tritanopia alike, and here they are set a step apart in lightness as well (a grayscale ratio of 1.45 to 1 in light and 1.4 to 1 in dark, measured), so the pair survives a grayscale print. It is also a departure from what most Western traders expect, which is why [`tradecn-slate`](tradecn-slate.md) keeps green for up; the research supports this pair, the habit supports that one, and the choice is the desk's. `stale` and `primary` sit near each other in hue here, as they do on the terminal; the badge's word carries the difference. `flat` follows your muted foreground, `panel-active` follows `primary`, `panel-drag-target` follows `ring`, and `panel-error` follows `destructive`.

### The colors are checked

A test converts each `oklch()` value to WCAG relative luminance and fails under 4.5 to 1 for every foreground on its surface and every meaning-bearing color on the background and on a card, in both modes. The tightest pair here is the amber primary on a light card at 4.8 to 1. The browser matrix installs it alone into each of the three consumers and reads each color back out of the page.

### What it does not do

Change a component, load a font, or switch at runtime. It is values in your stylesheet, and the `dark` class is the only switch it knows.
