# Introduction

Trading-terminal components you install with `shadcn add`. The source lands in your repo and it's yours.

You already have shadcn's menus and tooltips. This adds what a trading screen needs on top of them: a grid that takes a feed, cells that flash the direction of a tick, prices in 32nds, a strip that says how old your data is.

## It rides shadcn

tradecn imports your `@/components/ui/*` and uses their shared props and `className`. It doesn't bundle shadcn's source or import Radix or Base UI directly. Components avoid base-specific composition props such as `asChild` and `render`.

CI installs the registry into three clean projects: Radix Nova, Base UI Mira and Base UI Vega. Each project uses the real CLI, typechecks tradecn's files, builds and renders every item in Chromium. These are the tested styles; a new upstream style still needs verification. The validator checks [the item contract](contract.md), and a nightly job refetches the shadcn components to detect changes to exports tradecn uses.

Browser checks cover differences types alone can miss. For example, Radix tooltips need a provider; tradecn supplies it when composing a tooltip.

## No npm package

There is no npm package. This page describes {{tag}}. Pin that tag to install matching source; [Installation](installation.md) has both forms of the command.

## Dependencies

The CLI installs each item's declared dependencies alongside its source.

{{dependencies}}

The registry adds no icon library. shadcn picks a different one per base, so the grid draws its own three dots.
