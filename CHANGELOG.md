# Changelog

## [0.1.5](https://github.com/tradecn/ui/compare/v0.1.4...v0.1.5) (2026-09-21)


### Maintenance

* **site:** live previews on every docs page, one demo per item embedded from the playground ([#27](https://github.com/tradecn/ui/issues/27)) ([9566f7e](https://github.com/tradecn/ui/commit/9566f7e792ebce7407d4688b413322bf9572f5b9))

## [0.1.4](https://github.com/tradecn/ui/compare/v0.1.3...v0.1.4) (2026-09-21)


### Maintenance

* **registry:** point homepage and the README at tradecn.dev ([#21](https://github.com/tradecn/ui/issues/21)) ([8c57463](https://github.com/tradecn/ui/commit/8c574637ab39bb8f4509f0ba75011e3415e9c7c9))
* **repo:** New Earth Technologies holds the license, and the logo lands in the repo and on the site ([#22](https://github.com/tradecn/ui/issues/22)) ([ff7dcf2](https://github.com/tradecn/ui/commit/ff7dcf2cbd5f52aca9c56008a3eff84cff5bad17))
* **repo:** pull request titles pick the next tag, checked the way release-please reads them ([#24](https://github.com/tradecn/ui/issues/24)) ([9b5441a](https://github.com/tradecn/ui/commit/9b5441a2409de9af544111d0c7d1578ec00a3a66))
* **site:** docs pages on tradecn.dev, one per docs/*.md at the tag ([#23](https://github.com/tradecn/ui/issues/23)) ([0f90d2a](https://github.com/tradecn/ui/commit/0f90d2a7f02fdeb13e1734c892b7b1c0573faf3b))
* **site:** take the page's palette from main's registry, not the tag's ([#20](https://github.com/tradecn/ui/issues/20)) ([6b58a9c](https://github.com/tradecn/ui/commit/6b58a9c4b4979d4876f4190a80799ba391c3c0ab))

## [0.1.3](https://github.com/tradecn/ui/compare/v0.1.2...v0.1.3) (2026-09-21)


### Features

* **ticket:** an order ticket as the registry's first block, typing 99-16+ and stepping by the tick, with buttons the server allowed and a status it said ([#19](https://github.com/tradecn/ui/issues/19)) ([4e1f136](https://github.com/tradecn/ui/commit/4e1f1362fcb0ee51275a370b046bcb7c4eb2c3b2))
* **workspace:** panels that dock, tab, float, and pop out, on dockview, each one a hotkey scope, with a layout that carries its own persistence boundaries ([#16](https://github.com/tradecn/ui/issues/16)) ([e61d954](https://github.com/tradecn/ui/commit/e61d954242c53cf3f5637f510cce16720f669297))

## [0.1.2](https://github.com/tradecn/ui/compare/v0.1.1...v0.1.2) (2026-09-21)


### Features

* **blotter:** the data grid as an order blotter, with the server's status and actions gated by what it allows ([#13](https://github.com/tradecn/ui/issues/13)) ([e401f13](https://github.com/tradecn/ui/commit/e401f131a068a2ebd6864c29d61ba144ca878538))
* **panel:** panel chrome as a hotkey scope, with a symbol tag, link groups across windows, and a popout that keeps state ([#9](https://github.com/tradecn/ui/issues/9)) ([9f65030](https://github.com/tradecn/ui/commit/9f6503043ff6497ffeece9c49c42c9a7f94b9c17))
* **sparkline:** a line for a grid cell, colored and worded by direction, with gaps kept and an optional crosshair ([#11](https://github.com/tradecn/ui/issues/11)) ([a71463c](https://github.com/tradecn/ui/commit/a71463ce41cc513be65cbfc293c385395285ffc0))
* **tradecn-terminal-classic:** the terminal theme with green and red ([#15](https://github.com/tradecn/ui/issues/15)) ([3fc5854](https://github.com/tradecn/ui/commit/3fc5854c762e12ee1af72cea7d9cd5847e20f02b))
* **tradecn-terminal:** a terminal theme, black and amber with square corners and a monospace stack ([#14](https://github.com/tradecn/ui/issues/14)) ([c8cfc2f](https://github.com/tradecn/ui/commit/c8cfc2f4c59fc14e0a6e853a200b2392a757272a))
* **watchlist:** the data grid as a watchlist, with an add field that finds what is already there and three ways to remove ([#12](https://github.com/tradecn/ui/issues/12)) ([57c31d1](https://github.com/tradecn/ui/commit/57c31d14096600df7308dc6820d8250c3b4e4ac1))

## [0.1.1](https://github.com/tradecn/ui/compare/v0.1.0...v0.1.1) (2026-09-21)


### Features

* **command-palette:** palette and go-bar on the consumer's command, with a second action, symbol search, and live shortcuts ([#7](https://github.com/tradecn/ui/issues/7)) ([499301a](https://github.com/tradecn/ui/commit/499301aff9a28815cd482d6be8fdd42c2fefffe6))
* **use-hotkeys:** hotkey registry with DOM scopes, chords, conflict detection, and remapping ([#5](https://github.com/tradecn/ui/issues/5)) ([5bbc872](https://github.com/tradecn/ui/commit/5bbc8727f880ee1a9a776c5bdf777b2e535ad806))

## 0.1.0 (2026-09-20)


### Features

* **data-grid:** virtualized delta-fed grid with flash cells, reorder hold, and presets ([4d59736](https://github.com/tradecn/ui/commit/4d59736acb73fc523a35b9f61dc7530f604282ce))
* **feed-health:** per-feed state, age, and staleness tier with lane-specific indicators ([c1c5c92](https://github.com/tradecn/ui/commit/c1c5c92120bf2e7a4e4d5c7c882e71164d581200))
* **flash-cell:** direction-colored flash on change with shared memory and the market tokens ([656d7d8](https://github.com/tradecn/ui/commit/656d7d8dab9e3f74be153f73a7e9f3dabe0a6d4e))
* **format:** number formatting for trading screens ([a335979](https://github.com/tradecn/ui/commit/a335979ae4d9cf9a45e499b2aee507e0f4b88930))
* **row-store:** per-row subscriptions, views with reorder hold, frame batcher ([51b81d3](https://github.com/tradecn/ui/commit/51b81d3eb3dafbf5b707f475d823d747679e7d50))


### Bug Fixes

* **feed-health:** bring its own tooltip provider so Radix consumers render ([8cc9376](https://github.com/tradecn/ui/commit/8cc937610419a8528075e076d24ec2b143ecb4ce))

## Changelog
