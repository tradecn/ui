# tradecn-slate-east

Slate's light and dark palettes with the direction pair reversed: red for up and green for down.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-slate-east --diff
```

## API Reference

See [`tradecn-slate`](tradecn-slate.md) for the shared surfaces, installation behavior, typography resets, mode selection, and contrast-test coverage. Install one theme; installing another replaces its variables.

### What differs

Both modes swap `up` with `down` and `up-soft` with `down-soft`. Other palette values and the base CSS match Slate. The theme test checks that only these four palette keys differ.

| Token | Light | Dark |
|---|---|---|
| `--up` | `oklch(0.46 0.19 40)` | `oklch(0.66 0.19 40)` |
| `--down` | `oklch(0.52 0.13 165)` | `oklch(0.77 0.14 165)` |
| `--up-soft` | `oklch(0.46 0.19 40 / 18%)` | `oklch(0.66 0.19 40 / 18%)` |
| `--down-soft` | `oklch(0.52 0.13 165 / 18%)` | `oklch(0.77 0.14 165 / 18%)` |

Up and down describe direction, not whether a move benefits a position. Components that reuse these tokens also change: [FeedHealth](feed-health.md)'s connected dot uses `up`, so it becomes red. `destructive` and `panel-error` keep Slate's values.

### Why it exists

Red for rises and green for falls appears in [mainland Chinese A-share displays](https://www.hsbcqh.com.cn/-/media/media/gbm-jv/pdf/investor-education/risks-caused-by-discrepancies-between-southbound-trading-trading-rules-and-market-quotations.pdf), [Japan's Rakuten Market Speed](https://marketspeed.jp/guide/manual/ms_manual.pdf), and [Yahoo Taiwan's stock signals](https://tw.help.yahoo.com/kb/SLN35897.html). Choose the convention your desk expects; these examples do not establish a rule for every screen in each region.

Bazley, Cronqvist, and Mormann found that red affected risk preferences, return expectations, and trading decisions, with muted effects in their China experiments, where red is associated with prosperity ([paper](https://pubsonline.informs.org/doi/10.1287/mnsc.2020.3747), [university summary](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals)). That finding supports considering the audience's color associations; it does not establish one convention for all Asian markets.

The pair adapts [Okabe and Ito's vermilion and bluish green](https://jfly.uni-koeln.de/color/), with Slate's assignments reversed. Both colors clear 4.5 to 1 on the page and card in both modes. Swapping them preserves the calculated grayscale ratios: 1.54 to 1 in light and 1.72 to 1 in dark. These gaps do not guarantee distinguishability in print or with color vision deficiencies. Keep direction visible in signs or labels, as [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) requires when color alone carries meaning.
