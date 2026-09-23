# tradecn-slate

A neutral theme with light and dark palettes: cool surfaces, a blue primary, and bluish green and vermilion for up and down.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-slate --diff
```

## API Reference

### This one overwrites

Non-theme tradecn items add only missing tokens. Slate replaces shadcn's palette variables (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, their foreground partners, `--destructive`, `--border`, `--input`, and `--ring`), all eight `--chart-*` colors, the eight `--sidebar-*` colors, and `--radius`. It sets every tradecn token in both modes, resetting typography tokens to their defaults, including custom `--tradecn-font-*` stacks. It leaves your app's `--font-sans` alone.

It also adds the numeric variant on `:root` and the numeric hooks, plus the hyperlegible font remap described in [Typography](typography.md). Restore your stylesheet from version control to undo the installation.

### Two sides

Light uses cool off-white with near-black text and white cards. Dark uses near-black with off-white text, a lighter blue primary, and cards a step lighter than the page.

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(0.985 0.003 250)` | `oklch(0.16 0.01 250)` |
| `--foreground` | `oklch(0.2 0.02 250)` | `oklch(0.95 0.008 250)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.2 0.012 250)` |
| `--primary` | `oklch(0.5 0.15 245)` | `oklch(0.74 0.12 240)` |
| `--up` | `oklch(0.52 0.13 165)` | `oklch(0.77 0.14 165)` |
| `--down` | `oklch(0.46 0.19 40)` | `oklch(0.66 0.19 40)` |

The marks use a lightness suited to each background. Your app's `dark` class selects the palette, the way shadcn does it. [Color](color.md) explains why themes have two palettes.

### The direction pair

Slate adapts the bluish green and vermilion from [Okabe and Ito's palette](https://jfly.uni-koeln.de/color/) for its two backgrounds. Their guidance combines color with labels, shapes, or patterns. Both direction colors clear 4.5 to 1 on the page and on a card in both modes. If the desk wants red for up, choose [`tradecn-slate-east`](tradecn-slate-east.md).

The repository's luminance calculation gives the direction pair a grayscale ratio of 1.54 to 1 in light and 1.72 to 1 in dark. Tests require at least 1.3 to 1. These gaps do not guarantee distinguishability in print or with color vision deficiencies, and both fall below the 3 to 1 threshold for lightness as an additional visual distinction in [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Keep direction visible in signs or labels.

`flat` follows your muted foreground, `panel-active` follows `primary`, `panel-drag-target` follows `ring`, and `panel-error` follows `destructive`.

### The items' light marks are this theme's

[`tradecn-amber`](tradecn-amber.md) is tradecn.dev's default theme. The light marks an item installs (`--up`, `--down`, `--stale`, `--expiring`, `--panel-sync`, and the four `--link-*`) use slate's values, so a project without a theme keeps green for up. These defaults clear 4.5 to 1 on white. Installing slate preserves those light marks while replacing the surfaces and primary. The dark defaults are tuned for shadcn's surfaces and differ from slate's.

Items never overwrite an existing variable. A project that installed an item before 1.0 keeps its older light values until it removes them and installs the item again, or installs a theme.

### The colors are checked

The contrast tests require 4.5 to 1 for the declared text/surface pairs and for `primary`, `up`, `down`, `stale`, `expiring`, `link-1` through `link-4`, `panel-sync`, `destructive`, and `ring` on the background and card, in both modes. They also check foreground text over the soft tints. These checks do not cover every component state or chart color.

The calculated light primary contrast is 5.6 to 1 on the page. The tightest checked pair is `up` on the light page at 4.8 to 1. The browser matrix installs each theme separately into three consumers and reads every theme color back from the page in both modes.

### What it does not do

The theme installs no components, font files, or runtime switcher. Your app controls the `dark` class to select between the installed palettes.
