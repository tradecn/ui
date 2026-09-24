<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo.svg" alt="" width="64" height="64">
</picture>

# tradecn/ui

Trading-terminal components you install with `shadcn add`. The source lands in your repo and it's yours.

## Install

Add an item to your shadcn project, pinned to a release tag:

<!-- x-release-please-start-version -->

```bash
npx shadcn@latest add tradecn/ui/data-grid#v1.4.12
```

<!-- x-release-please-end -->

The tag is the version. There is no npm package.

Or point a namespace at [tradecn.dev](https://tradecn.dev) in `components.json`:

```json
{ "registries": { "@tradecn": "https://tradecn.dev/r/{name}.json" } }
```

```bash
npx shadcn@latest add @tradecn/data-grid
```

<!-- x-release-please-start-version -->

The namespace URL serves the latest release. To pin it, use `https://tradecn.dev/r/v1.4.12/{name}.json`. Both install paths provide the same tradecn files at the same tag.

<!-- x-release-please-end -->

## Components

tradecn adds grids, price formatting, scoped hotkeys, and order tickets to shadcn's menus and tooltips. These are some of the items; [tradecn.dev](https://tradecn.dev/docs/components/) has the full catalog, docs, and live demos.

| Item | What it does |
|---|---|
| [`format`](docs/format.md) | Tick-size precision, 32nds and 64ths (`99-16+`), yield, bps, DV01, and compact notional. One missing-value marker. |
| [`row-store`](docs/row-store.md) | Batched deltas with per-row subscriptions. Apply one batch per frame. |
| [`flash-cell`](docs/flash-cell.md) | Flashes up, down, or flat on change. Zero change is flat. |
| [`data-grid`](docs/data-grid.md) | Virtualized grid with per-row updates from the row store. |
| [`feed-health`](docs/feed-health.md) | Feed state, data age, and staleness. Drop counts for coalesced feeds; sequence gaps for ordered feeds. |
| [`use-hotkeys`](docs/use-hotkeys.md) | One registry runs and displays bindings. Panel bindings win over global ones. Text inputs allow only `editing` bindings; dialogs block outside scopes. |
| [`command-palette`](docs/command-palette.md) | shadcn `command` with your actions and symbol search. Shift+Enter runs a secondary action; a configurable go-bar accepts commands such as `AAPL GP`. |
| [`panel`](docs/panel.md) | Panel frame and hotkey scope, editable symbols, cross-window link groups, and popouts that preserve mounted state. |
| [`sparkline`](docs/sparkline.md) | Cell-sized chart with direction in color and words, relative to the first reading or a supplied baseline. Missing readings leave gaps. |
| [`watchlist`](docs/watchlist.md) | Watchlist columns and per-instrument prices. Opt-in add/remove callbacks; duplicate symbols focus the existing row, and Delete requests removal. You own the list. |
| [`blotter`](docs/blotter.md) | Order columns and server-supplied status. Action buttons count eligible orders, disable at zero, and recheck permissions on click. |
| [`workspace`](docs/workspace.md) | Dock, tab, float, and pop out panels with dockview, preserving hotkey scopes. You save the layout; its payload describes persistence boundaries. |
| [`ticket`](docs/ticket.md) | Order-entry block accepting `99-16+` and tick stepping. Displays server-supplied status and allowed actions; validates drafts by default and calls your handler. |

### Themes

Themes replace your stylesheet variables, including tradecn font choices; other items add only missing variables. Review with `--diff` before installing. Each theme has light and dark palettes:

| Theme | Palette |
|---|---|
| [`tradecn-amber`](docs/tradecn-amber.md) | tradecn.dev's default: warm paper and near-black surfaces, amber primary, blue for up and vermilion for down. |
| [`tradecn-slate`](docs/tradecn-slate.md) | Cool neutrals, blue primary, bluish green for up and vermilion for down. Item defaults use Slate's direction colors in light mode. |
| [`tradecn-slate-east`](docs/tradecn-slate-east.md) | Slate with red for up and green for down, a convention used in China, Japan, and Taiwan. Only four palette tokens differ. |

Tests check declared text/surface pairs and semantic marks at 4.5:1 in both modes. They do not cover every state or chart color, or guarantee distinguishability for every reader. Direction also needs signs or labels; [Color](docs/color.md) explains the palette choices and research.

## It rides shadcn

tradecn imports your `@/components/ui/*` and styles them with `className`. It bundles no shadcn code and uses no direct Radix or Base UI imports, `asChild`, or `render` props.

CI installs the registry through the CLI into Radix Nova, Base UI Mira, and Base UI Vega projects, then typechecks, builds, and renders the items. Source checks enforce the [item contract](docs/contract.md); a nightly job checks upstream export drift.

The browser checks catch differences types miss: Radix tooltips require a provider; Base UI's don't. tradecn supplies it.

## Updating

Review tradecn and shadcn updates separately. Replace the tag with the release you want:

<!-- x-release-please-start-version -->

```bash
npx shadcn@latest add tradecn/ui/data-grid#v1.4.12 --diff   # a tradecn change
npx shadcn@latest add tooltip --diff                       # a shadcn change underneath
```

<!-- x-release-please-end -->

## Dependencies

Beyond React and shadcn's dependencies, items declare only the packages they use:

| Package | Purpose |
|---|---|
| `cn` | Class names. |
| `@tanstack/react-virtual` | Grid virtualization. |
| `dockview-react` | Workspace layout; brings `dockview` and `dockview-core`. |
| `uplot` | Canvas charts; MIT, no runtime dependencies. |

tradecn adds no icon library or font files. Set font families through CSS variables; [Typography](docs/typography.md) explains the defaults and research.

Any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node. This applies whatever font you choose.

## Numbers

Apple M5 Max, 128 GB, macOS 27.0, headless Chromium 153, 2026-09-20. 1,000 rows, 60 visible, 12 numeric columns, `rfq` preset. One batch per animation frame; 10 seconds measured after 1 second of warm-up.

| Patches per frame | Patches hitting visible/overscan rows per frame | Dropped frames | Script p99 |
|---|---|---|---|
| 2,000 | 136 | 0 of 601 | 3.0 ms |
| 5,000 | 341 | 1 of 600 | 7.4 ms |
| 10,000 | 682 | 101 of 500 | 10.5 ms |

The second column counts patch hits, including repeats, across 60 visible rows plus 8 overscan rows. Script time includes batch construction, application, and React's render and commit; it excludes style, layout, and paint. At 10,000 patches, script p99 stays below 16.7 ms, but frames still drop. These timings do not isolate the cost of flash animations.

Run `just bench --machine "<name>"` on your target hardware to write your own JSON results. The recorded runs and methodology are in [`bench/`](bench/README.md). If results differ, open an issue with your machine and run.

## Working on it

Run `bun install`, then `just dev` for the playground. Before pushing, run `just check` for lint, types, tests, registry validation/build, and site build/smoke checks. CI also runs consumer installation, GitHub install-by-ref, and infrastructure checks.

- Give each new item a demo in `playground/src/demos/`; tradecn.dev uses it.
- Put substantial variants in `<item>-<variant>.tsx`, with `<!-- demo: <item>-<variant> -->` under a dedicated heading in the item's doc.
- Add new items to `playground/src/demos/terminal.tsx`, the front-page workspace. A test checks its registry coverage.

PR titles determine releases. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the title format and release table.

MIT. I'm John Carmack (the Rust and TypeScript one, not the Doom one).
