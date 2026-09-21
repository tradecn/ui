<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo.svg" alt="" width="64" height="64">
</picture>

# tradecn/ui

Trading-terminal components you install with `shadcn add`. The source lands in your repo and it's yours.

<!-- x-release-please-start-version -->

```bash
npx shadcn@latest add tradecn/ui/data-grid#v0.1.6
```

<!-- x-release-please-end -->

Pin the tag. The tag is the version. There is no npm package.

Or point a namespace at [tradecn.dev](https://tradecn.dev) in `components.json`:

```json
{ "registries": { "@tradecn": "https://tradecn.dev/r/{name}.json" } }
```

```bash
npx shadcn@latest add @tradecn/data-grid
```

<!-- x-release-please-start-version -->

That URL is the latest release. Put the tag in it to pin: `https://tradecn.dev/r/v0.1.6/{name}.json`. Same files either way.

<!-- x-release-please-end -->

Every item is running at [tradecn.dev](https://tradecn.dev/docs/components/), docs beside it.

You already have shadcn's menus and tooltips. This adds what a trading screen needs on top of them: a grid that takes a feed, cells that flash the direction of a tick, prices in 32nds, hotkeys that know which panel has focus, an order ticket that types `99-16+`.

| Item | What it does |
|---|---|
| [`format`](docs/format.md) | Precision from the tick size, 32nds and 64ths (`99-16+`), yield, bps, DV01, compact notional. One null sentinel. |
| [`row-store`](docs/row-store.md) | You apply one batch of deltas per frame. Components subscribe to one row each. |
| [`flash-cell`](docs/flash-cell.md) | Flashes up, down, or flat on change. Zero is flat, not up. |
| [`data-grid`](docs/data-grid.md) | Virtualized grid on the row store. A delta to one row re-renders one row. |
| [`feed-health`](docs/feed-health.md) | Per-feed state, data age, staleness tier. Drop counts for lanes that drop, gaps for lanes that don't. |
| [`use-hotkeys`](docs/use-hotkeys.md) | Declare a binding once: the same list runs the keys and shows them. A panel's keys beat global ones. `x` won't cancel an order while you're typing, or under a dialog. |
| [`command-palette`](docs/command-palette.md) | Your shadcn `command`, fed by an action registry and your symbol search. Shift+Enter runs a row's second action. Also a go-bar that reads `AAPL GP`. |
| [`panel`](docs/panel.md) | The frame around a book or a chart, and a hotkey scope: with two books up, the one with focus answers. Click the symbol to retype it. Link groups carry it across panels and windows. Pop a panel out and its state comes with it. |
| [`sparkline`](docs/sparkline.md) | A line that fits a grid cell. Up, down, or flat against the first reading or a previous close, in color and in words. A missing reading leaves a gap. It doesn't slide the afternoon left. |
| [`watchlist`](docs/watchlist.md) | The grid with a watchlist's columns, prices printed per instrument. Add a symbol that's already there and it takes you to it. Delete takes one off. The list stays yours. |
| [`blotter`](docs/blotter.md) | The grid with a blotter's columns. The status is the server's word, never worked out. Cancel only shows for orders the server says can be cancelled, the button says how many, and it asks again when you click. |
| [`workspace`](docs/workspace.md) | Panels that dock, tab, float, and pop out, on dockview. Every one keeps its keys. The layout is yours to save, and it says in the payload what it left out. |
| [`ticket`](docs/ticket.md) | An order ticket, the registry's first block. Types `99-16+` and steps by the tick. The buttons are the actions the server allowed and nothing else; the status is the server's word. It sends nothing: it hands you a checked draft. |
| [`tradecn-terminal`](docs/tradecn-terminal.md) | A theme, not a component. Black, amber, square corners, monospace. It's the one item that overwrites your variables, so `--diff` it first. Keeps the colorblind-safe up and down. |
| [`tradecn-terminal-classic`](docs/tradecn-terminal-classic.md) | The same theme with green and red. Four tokens differ and nothing else. The signs and the words matter more with this one, not less. |

## It rides shadcn

tradecn never copies shadcn's code. It imports your `@/components/ui/*`, styles it with `className`, and stops there. No Radix import, no Base UI import, no `asChild`, no `render`. So it doesn't care which base or style you picked, and a shadcn update is something that happens underneath it.

That's a promise, so CI checks it. Every change installs the registry into three clean projects (Radix Nova, Base UI Mira, Base UI Vega) through the real CLI, typechecks tradecn's files, builds, and renders every item in a browser. A validator rejects any item that breaks the rules in [`docs/contract.md`](docs/contract.md). A nightly job refetches every shadcn component tradecn composes and fails if an export it uses changed.

It has already caught one. Radix tooltips throw without a provider above them. Base UI's don't. Types passed in all three. The browser didn't.

## Updating

Two commands. Neither touches the other's files. Put the tag you're moving to in the first one.

<!-- x-release-please-start-version -->

```bash
npx shadcn@latest add tradecn/ui/data-grid#v0.1.6 --diff   # a tradecn change
npx shadcn@latest add tooltip --diff                       # a shadcn change underneath
```

<!-- x-release-please-end -->

## Dependencies

`cn`, `@tanstack/react-virtual` under the grids, `dockview-react` under the workspace (it brings `dockview` and `dockview-core`, same repo, nothing else). That's the list, and an item only pulls in the part it uses. It's short on purpose: some of you ship into places where every package is a form to fill out.

No icon library either. shadcn picks a different one per base, so the grid draws its own three dots.

## Numbers

Apple M5 Max, 128 GB, macOS 27.0, headless Chromium 153, 2026-09-20. 1,000 rows, 60 visible, 12 numeric columns, every patch applied in one batch per animation frame, 10 seconds measured after 1 second of warm-up.

| Patches per frame | Visible cells changed per frame | Dropped frames | Script p99 |
|---|---|---|---|
| 2,000 | 136 | 0 of 601 | 3.0 ms |
| 5,000 | 341 | 1 of 600 | 7.4 ms |
| 10,000 | 682 | 101 of 500 | 10.5 ms |

Script time is building the batch, applying it, and React's commit. At 10,000 it's still inside a 16.7 ms frame. The late frames there are the flash animations, hundreds running at once.

A laptop in headless Chromium is not your users' machine. `just bench --machine "<name>"` runs it on yours and writes the JSON. The runs behind this table are in [`bench/`](bench/README.md). If your numbers disagree with mine, open an issue with your machine and your run.

## Working on it

`bun install`, then `just dev` for the playground and `just check` for everything CI runs. Each item has a demo in `playground/src/demos/`; it's the one tradecn.dev shows, so a new item ships with one. Pull request titles pick the next tag; [`CONTRIBUTING.md`](CONTRIBUTING.md) has the table.

MIT. I'm John Carmack (the Rust and TypeScript one, not the Doom one).
