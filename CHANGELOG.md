# Changelog

## [1.2.0](https://github.com/tradecn/ui/compare/v1.1.0...v1.2.0) (2026-09-22)


### Features

* **audit-trail:** the life of an order as events, with a changes pane ([#73](https://github.com/tradecn/ui/issues/73)) ([976eba3](https://github.com/tradecn/ui/commit/976eba317d5f4cec3a0eab908ef06f6fe6e4d0fc))
* **data-grid:** editable cells, and a parameter grid over them ([#70](https://github.com/tradecn/ui/issues/70)) ([b3a9faa](https://github.com/tradecn/ui/commit/b3a9faa38491aa2109d98c1ca7696c8d617a2efe))
* **feed-health:** actions the server allows, in each feed's menu ([#76](https://github.com/tradecn/ui/issues/76)) ([db63803](https://github.com/tradecn/ui/commit/db638031389165db221345ec95330e7fb2364ff0))
* **instrument-search:** a field that reads what was typed before it asks the server ([#77](https://github.com/tradecn/ui/issues/77)) ([da0e0d0](https://github.com/tradecn/ui/commit/da0e0d02331bf3f72c4201d205f9762e8c3f3f1d))
* **layout-manager:** named layouts for a workspace ([#74](https://github.com/tradecn/ui/issues/74)) ([cabd5b5](https://github.com/tradecn/ui/commit/cabd5b56d18c29077bb91773e69553fa9a4caee9))
* **positions:** a book of positions on the grid ([#72](https://github.com/tradecn/ui/issues/72)) ([6f1008c](https://github.com/tradecn/ui/commit/6f1008c1eb31452e8901c4e321c27aeac655e31d))
* **ticket:** quick sizes on both tickets, as buttons and mod+1 to mod+9 ([#78](https://github.com/tradecn/ui/issues/78)) ([c91f07a](https://github.com/tradecn/ui/commit/c91f07ab5e3f73bf27b8322597bd29468af2db63))


### Maintenance

* **ci:** a docs commit cuts a patch ([#81](https://github.com/tradecn/ui/issues/81)) ([6a3e54a](https://github.com/tradecn/ui/commit/6a3e54a2e0d2a0243e9d77d698fce256fb8358b5))


### Documentation

* **contract:** simplify the item contract ([#84](https://github.com/tradecn/ui/issues/84)) ([3b74434](https://github.com/tradecn/ui/commit/3b7443430484c558da85389901108dd40142d420))
* **countdown:** simplify the guide and add a props reference ([#75](https://github.com/tradecn/ui/issues/75)) ([85c22f1](https://github.com/tradecn/ui/commit/85c22f1c7f02edec23933b6cbfe606790c030afb))
* **data-grid:** simplify the API reference ([#79](https://github.com/tradecn/ui/issues/79)) ([fb13280](https://github.com/tradecn/ui/commit/fb13280729028a05897c4cd0f1cf0c2139bd8a8d))
* **panel:** simplify the API reference ([#87](https://github.com/tradecn/ui/issues/87)) ([e73e868](https://github.com/tradecn/ui/commit/e73e86815464588a13722dc1c0bb89972c44574a))
* **rfq-stack:** simplify the API reference ([#89](https://github.com/tradecn/ui/issues/89)) ([4e29a1e](https://github.com/tradecn/ui/commit/4e29a1ea914658ef04b3a7b4c55f17ed4cebb54b))
* **workspace:** simplify the API reference ([#82](https://github.com/tradecn/ui/issues/82)) ([03616e8](https://github.com/tradecn/ui/commit/03616e8e1475baac6ecd87093f0c02afd68407ea))

## [1.1.0](https://github.com/tradecn/ui/compare/v1.0.0...v1.1.0) (2026-09-22)


### Features

* **alerts:** a strip of notices over a store that folds repeats ([#63](https://github.com/tradecn/ui/issues/63)) ([6e3adb2](https://github.com/tradecn/ui/commit/6e3adb257c40519b52e1a16fe73e7aeff7b15a40))
* **column-chooser:** a dialog over one grid's columns ([#60](https://github.com/tradecn/ui/issues/60)) ([60197ff](https://github.com/tradecn/ui/commit/60197ff10c3f10ecc22d6fc79cbe5b7836c5c9fd))
* **data-grid:** footer totals, a tape preset, and parking in the stack ([#69](https://github.com/tradecn/ui/issues/69)) ([2a6a44d](https://github.com/tradecn/ui/commit/2a6a44d17b3cb8db325c3adc0e15ad1f132df5d8))
* **grid-rules:** rules as data, and a rules prop on the grid ([#58](https://github.com/tradecn/ui/issues/58)) ([969a888](https://github.com/tradecn/ui/commit/969a8888b69832e629aeaba980201911d0d1774a))
* **limits:** fat-finger checks as data, and both tickets take them ([#66](https://github.com/tradecn/ui/issues/66)) ([716a60f](https://github.com/tradecn/ui/commit/716a60ff53b182654b5b13ca5cd0add970ba7cc3))
* **preferences:** the envelope a desk's settings travel in ([#62](https://github.com/tradecn/ui/issues/62)) ([e3d3e12](https://github.com/tradecn/ui/commit/e3d3e12f4906dd28f8770de681752dffc04e238d))
* **rules-editor:** the editor over one grid's rules ([#61](https://github.com/tradecn/ui/issues/61)) ([6889595](https://github.com/tradecn/ui/commit/6889595bf3a25fd9896236b98d5ceb524abd79b6))
* **session-calendar:** sessions, holidays, and early closes in the venue's zone ([#65](https://github.com/tradecn/ui/issues/65)) ([3f90537](https://github.com/tradecn/ui/commit/3f90537ea1d5e9b381aa88d310cdc9d08d16b864))
* **status-bar:** the strip at the bottom of every terminal ([#64](https://github.com/tradecn/ui/issues/64)) ([8f0f7fa](https://github.com/tradecn/ui/commit/8f0f7faf46d8abc3da0e9fe6e8f0de35fb09c25f))


### Bug Fixes

* **row-store:** a view survives StrictMode's mount rehearsal ([#67](https://github.com/tradecn/ui/issues/67)) ([e2ffbeb](https://github.com/tradecn/ui/commit/e2ffbeb9c9b24834bd42faa477583dbf6e98d978))

## [1.0.0](https://github.com/tradecn/ui/compare/v0.3.0...v1.0.0) (2026-09-22)


### ⚠ BREAKING CHANGES

* **registry:** `tradecn-terminal` and `tradecn-terminal-classic` are removed. A consumer that installed either keeps it as values in its own stylesheet and nothing breaks; to move on, `npx shadcn@latest add tradecn/ui/tradecn-amber#v1.0.0 --diff` (its successor) or `tradecn-slate`. The items' default light marks (`--up`, `--down`, `--stale`, `--expiring`, `--panel-sync`, `--link-1` to `--link-4`) are now `tradecn-slate`'s light side and the dark `--down` is its dark vermilion; items never overwrite a variable you already have, so delete the old lines and run the item again to take them. Nothing tradecn draws is under 12 px, so the `option-chain` preset's `fontClass` is `text-xs`. tradecn.dev wears `tradecn-amber` in both modes.

### Features

* **registry:** 1.0.0, everything comports with the research or goes ([#53](https://github.com/tradecn/ui/issues/53)) ([9bfdf64](https://github.com/tradecn/ui/commit/9bfdf64c3acd52a4e66ca623dcc2e2df672571cb))

## [0.3.0](https://github.com/tradecn/ui/compare/v0.2.0...v0.3.0) (2026-09-22)


### Features

* **registry:** three themes with a light side and a dark side from the color research, slate, slate-east, and amber, with a Color page and a rule that direction never rides on hue alone ([#52](https://github.com/tradecn/ui/issues/52)) ([63d252d](https://github.com/tradecn/ui/commit/63d252d8df2ebb955545f050242d31d09bc0c0a7))
* **typography:** research-grounded font system with consumer overrides ([#50](https://github.com/tradecn/ui/issues/50)) ([72b6cb0](https://github.com/tradecn/ui/commit/72b6cb0266f4d74da0ce1c831a96990ff40652cb))

## [0.2.0](https://github.com/tradecn/ui/compare/v0.1.6...v0.2.0) (2026-09-22)


### Features

* **countdown:** time left as digits on one shared clock and a bar on one animation, turning in the last seconds and stopping at zero ([#40](https://github.com/tradecn/ui/issues/40)) ([02971af](https://github.com/tradecn/ui/commit/02971af7efceb1aeac77e2b5b7cd3068c8b1fceb))
* **format:** a quote basis per instrument, coupons in eighths, maturities, ticks between two prices, and millions as the desk says them ([#42](https://github.com/tradecn/ui/issues/42)) ([6714e8d](https://github.com/tradecn/ui/commit/6714e8dcd894fbc41a32e786437767e31695f5d7))
* **hotkey-editor:** the settings screen for the hotkey registry, with three ways to change a shortcut and conflicts said in words ([#47](https://github.com/tradecn/ui/issues/47)) ([9f5d8b6](https://github.com/tradecn/ui/commit/9f5d8b6f931f79ebcebf80f8b4cf82eb94d32ec9))
* **panel:** a link transport over a shell's own two functions, and one workspace per window for shells whose windows are separate contexts ([#48](https://github.com/tradecn/ui/issues/48)) ([360ddef](https://github.com/tradecn/ui/commit/360ddefd4dddaf04a6939d25befd84b588be7ef1))
* **perf-monitor:** the frame rate on the screen it measures, a histogram against the budget, and a line per lane from its store ([#46](https://github.com/tradecn/ui/issues/46)) ([bc1ceac](https://github.com/tradecn/ui/commit/bc1ceacadf0ec3cb022a8ce0d14f771630a312ed))
* **quote-field:** a field that types a quote the way the instrument quotes it, in its basis, and steps by its step ([#43](https://github.com/tradecn/ui/issues/43)) ([5642a0e](https://github.com/tradecn/ui/commit/5642a0ec33b99e09551d164ea4aadb07b3f2d0e6))
* **rfq-stack:** the stack of open inquiries with a countdown per row, a threshold for the small auto quotes, and the one rule for which inquiry is in the ticket ([#45](https://github.com/tradecn/ui/issues/45)) ([f2cf838](https://github.com/tradecn/ui/commit/f2cf8388d5eba8b9afcd7d0c25317cc10a924087))
* **rfq-ticket:** a dealer's ticket for a request for quote, one inquiry each, quoting in the instrument's basis against the market ([#44](https://github.com/tradecn/ui/issues/44)) ([d217dee](https://github.com/tradecn/ui/commit/d217dee4ed1bf3e82505513a34510f536ecf52e3))

## [0.1.6](https://github.com/tradecn/ui/compare/v0.1.5...v0.1.6) (2026-09-21)


### Maintenance

* **site:** item pages in shadcn's shape, one sentence up top and the install spelled out under Command and Manual ([#32](https://github.com/tradecn/ui/issues/32)) ([a3353f0](https://github.com/tradecn/ui/commit/a3353f087c2a95e3057068b4f7197f6d5632eaad))

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
