# tradecn-amber

An amber theme with a day side and a night side: warm paper in light, near-black in dark, and blue and vermilion for up and down.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-amber --diff
```

## API Reference

### The default theme

Amber is tradecn.dev's default theme: the terminal look with a day side. Installing components without a theme keeps green for up. Those items use slate's light marks and dark marks tuned for shadcn's dark surfaces; installing amber moves up to blue.

### This one overwrites

Like every tradecn theme, it replaces shadcn's palette variables, all eight `--chart-*` colors, sidebar colors, and `--radius`, and sets every tradecn token in both modes. It leaves your app's `--font-sans` alone but resets tradecn's typography tokens to their defaults, including any custom `--tradecn-font-*` stacks.

It also adds the numeric variant on `:root` and the numeric hooks, plus the hyperlegible font remap described in [Typography](typography.md). Restore your stylesheet from version control to undo the installation.

### Two sides

Light uses warm paper with near-black text. Dark uses near-black surfaces with lighter text and marks. The near-black background is a design preference for long sessions, not a measured legibility benefit.

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(0.99 0.004 85)` | `oklch(0.14 0.005 85)` |
| `--foreground` | `oklch(0.2 0.01 85)` | `oklch(0.94 0.03 85)` |
| `--primary` | `oklch(0.54 0.12 65)` | `oklch(0.78 0.16 70)` |
| `--up` | `oklch(0.45 0.13 245)` | `oklch(0.66 0.12 240)` |
| `--down` | `oklch(0.56 0.19 45)` | `oklch(0.78 0.18 45)` |

### Blue for up

Amber adapts the blue and vermilion from [Okabe and Ito's palette](https://jfly.uni-koeln.de/color/) for its two backgrounds. Their guidance combines color with labels, shapes, or patterns. Choose [`tradecn-slate`](tradecn-slate.md) when the desk expects green for up.

The repository's luminance calculation gives the direction pair a grayscale ratio of 1.45 to 1 in light and 1.33 to 1 in dark. Tests require at least 1.3 to 1. Both gaps are below the 3 to 1 threshold for lightness as an additional visual distinction in [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), so keep direction visible in signs or labels.

`stale` and `primary` sit near each other in hue here; the badge's word carries the difference. `flat` follows your muted foreground, `panel-active` follows `primary`, `panel-drag-target` follows `ring`, and `panel-error` follows `destructive`.

### The colors are checked

The contrast tests require 4.5 to 1 for the declared text/surface pairs and for `primary`, `up`, `down`, `stale`, `expiring`, `link-1` through `link-4`, `panel-sync`, `destructive`, and `ring` on the background and card, in both modes. They also check foreground text over the soft tints. These checks do not cover every component state or chart color.

The calculated light primary contrast is 5.1 to 1 on the page and 4.8 to 1 on a card. The tightest checked pair is `down` on the light card at 4.6 to 1. The browser matrix installs each theme separately into three consumers and reads every theme color back from the page in both modes.

### What it does not do

The theme installs no components, font files, or runtime switcher. Your app controls the `dark` class to select between the installed palettes.
