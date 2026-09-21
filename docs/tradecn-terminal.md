# tradecn-terminal

A terminal look for the whole app: black background, near-black cards, amber primary, square corners, and a monospace stack in place of the sans.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-terminal --diff
```

## API Reference

### This one overwrites

Every other tradecn item adds its tokens only where you have none, so your own `--up` survives a later install. A theme is the opposite on purpose: it is the explicit reset. It replaces `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, the five `--chart-*`, the eight `--sidebar-*`, `--radius`, and `--font-sans`, and it sets every tradecn token. Your components are untouched: it is the same `button` and the same `data-grid`, drawn from different variables.

To go back, restore your stylesheet from version control. There is no uninstall, because a theme is only values in a file you own.

### Both modes are the terminal

`light` and `dark` carry the same palette. A terminal is black whether or not your app puts a `dark` class on the root, and a theme that only filled in `dark` would leave an app without that class with square corners and a monospace font on a white page. `--radius` is set in `:root` only, which is where shadcn keeps it.

For the same reason the tradecn tokens take their dark-tuned values in both modes. The default `--up` for a light page is tuned for white and would be dim on black.

### What it keeps

The colorblind-safe pair. `up` is the bluish green and `down` the vermillion, the same as the defaults, so direction survives deuteranopia and protanopia and the two still differ in a luminance-only view. If the people who trade on the screen want green and red, that is [`tradecn-terminal-classic`](tradecn-terminal-classic.md). `flat` follows your muted foreground, `panel-active` follows `primary` and so turns amber, `panel-drag-target` follows `ring`, and `panel-error` follows `destructive`.

### The colors are checked

They were picked by hand and checked by arithmetic: a test converts each `oklch()` value to WCAG relative luminance and fails under 4.5 to 1. That covers every foreground on its own surface, and every color that carries meaning (`primary`, `up`, `down`, `stale`, `link-1` to `link-4`, `panel-sync`, `destructive`, `ring`) on both the background and a card. The tightest is `destructive` on a card at 5.44 to 1; `foreground` on the background is 16.57 to 1. The converter itself is checked first, against white, black, and pure sRGB red and green. It does not check borders, which sit near 1.5 to 1 here as they do in shadcn's own dark palette.

The browser matrix installs the theme alone into each of the three consumers, runs every other test again under it, and reads each color back out of the page, comparing colors and not text, since a production build respells `oklch(0.26 0.03 70)` as `oklch(26% .03 70)`.

### What it does not do

Change a component, add a font file, or ship a light variant. The monospace stack is system fonts only (`ui-monospace`, SF Mono, Menlo, Consolas, Liberation Mono); put your own at the front of `--font-sans` if you have one. It does not switch at runtime: it is values in your stylesheet, and a theme switcher is yours to build over them.
