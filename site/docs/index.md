# Introduction

Trading-terminal components you install with `shadcn add`. The source lands in your repo and it's yours.

You already have shadcn's menus and tooltips. This adds what a trading screen needs on top of them: a grid that takes a feed, cells that flash the direction of a tick, prices in 32nds, a strip that says how old your data is.

## It rides shadcn

tradecn never copies shadcn's code. It imports your `@/components/ui/*`, styles it with `className`, and stops there. No Radix import, no Base UI import, no `asChild`, no `render`. So it doesn't care which base or style you picked, and a shadcn update is something that happens underneath it.

That's a promise, so CI checks it. Every change installs the registry into three clean projects (Radix Nova, Base UI Mira, Base UI Vega) through the real CLI, typechecks tradecn's files, builds, and renders every item in a browser. A validator rejects any item that breaks the rules in [the item contract](contract.md). A nightly job refetches every shadcn component tradecn composes and fails if an export it uses changed.

It has already caught one. Radix tooltips throw without a provider above them. Base UI's don't. Types passed in all three. The browser didn't.

## No npm package

Pin the tag. The tag is the version. {{tag}} is the latest, and [Installation](installation.md) has both forms of the command.

## Dependencies

Short on purpose: some of you ship into places where every package is a form to fill out.

{{dependencies}}

No icon library either. shadcn picks a different one per base, so the grid draws its own three dots.
