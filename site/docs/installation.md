# Installation

Two forms of one command. Both put the same files in your repo.

## Before you start

A project shadcn's CLI has set up: `components.json` at the root, Tailwind 4 in the stylesheet. `npx shadcn@latest init` does that from nothing.

## GitHub form

```bash
npx shadcn@latest add tradecn/ui/data-grid#{{tag}}
```

Pin the tag. The tag is the version. There is no npm package.

## Namespace form

Point a namespace at tradecn.dev in `components.json`:

```json
{
  "registries": {
    "@tradecn": "{{siteUrl}}/r/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @tradecn/data-grid
```

That URL is the latest release. Put the tag in it to pin: `{{siteUrl}}/r/{{tag}}/{name}.json`. Same files either way.

## Updating

Two commands. Neither touches the other's files. Put the tag you're moving to in the first one.

```bash
npx shadcn@latest add tradecn/ui/data-grid#{{tag}} --diff   # a tradecn change
npx shadcn@latest add tooltip --diff                       # a shadcn change underneath
```

## Every item at once

The namespace form takes a list. This is every item at {{tag}}:

```bash
npx shadcn@latest add {{everyItem}}
```
