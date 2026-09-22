# tradecn-slate

A neutral look with a real light side and a real dark side: cool near-neutral surfaces, a calm blue primary, and the colorblind-safe bluish green and vermilion for up and down.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-slate --diff
```

## API Reference

### This one overwrites

Every other tradecn item adds its tokens only where you have none. A theme is the explicit reset: it replaces `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, the five `--chart-*`, the eight `--sidebar-*`, and `--radius`, and it sets every tradecn token, the typography tokens at their defaults included. Your components are untouched. It leaves `--font-sans` alone, so your app keeps its type; the terminal themes are the ones that make it monospace.

To go back, restore your stylesheet from version control. A theme is only values in a file you own.

### Two sides

Unlike the terminal themes, `light` and `dark` are two palettes. Light is an off-white with a hair of blue in it (`oklch(0.985 0.003 250)`), near-black text, white cards, and a blue primary at 5.1 to 1 on the page. Dark is a near-black of the same hue (`oklch(0.16 0.01 250)`), not pure black, with an off-white foreground, a lighter blue primary, and cards a step up from the page. Every mark that carries meaning has a value per mode: the light `up` is `oklch(0.52 0.13 165)` and the dark `up` is `oklch(0.74 0.15 165)`, the same hue at the lightness each background needs. Which side shows is your app's `dark` class, the way shadcn does it. [Color](color.md) says why a theme wants two palettes and not one.

### The direction pair

`up` is the bluish green and `down` the vermilion of Okabe and Ito's colorblind-safe palette, pulled down for white and up for near-black so both clear 4.5 to 1 on the page and on a card. The two are set a step apart in lightness as well as hue (a grayscale ratio of 1.5 to 1 in light and 1.7 to 1 in dark, measured), so the pair still reads in a grayscale print and under the two common kinds of red-green color blindness. If the desk wants red for up, that is [`tradecn-slate-east`](tradecn-slate-east.md). `flat` follows your muted foreground, `panel-active` follows `primary`, `panel-drag-target` follows `ring`, and `panel-error` follows `destructive`.

### The colors are checked

The same arithmetic that checks the terminal checks this: a test converts each `oklch()` value to WCAG relative luminance and fails under 4.5 to 1 for every foreground on its surface and every meaning-bearing color on the background and on a card, in both modes. The tightest pair in this theme is `up` on the light page at 4.8 to 1. The browser matrix installs it alone into each of the three consumers and reads each color back out of the page.

### What it does not do

Change a component, load a font, or switch at runtime. It is values in your stylesheet, and a theme switcher is yours to build over them; the `dark` class is the only switch it knows.
