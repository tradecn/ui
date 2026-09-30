# Installation

Install components with a GitHub address or a registry namespace.

## Before you start

Run the commands from a project configured with shadcn/ui and Tailwind 4. If you don't have a project yet, run `npx shadcn@latest init` and follow the prompts to create one.

## GitHub form

```bash
npx shadcn@latest add tradecn/ui/data-grid#{{tag}}
```

The tag pins the source version. There is no npm package.

## Namespace form

Add `@tradecn` to the `registries` object in your existing `components.json`:

```json
{
  "registries": {
    "@tradecn": "{{siteUrl}}/r/{{tag}}/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @tradecn/data-grid
```

This installs the same files as the GitHub form at {{tag}}. To follow the latest release instead, use `{{siteUrl}}/r/{name}.json` as the namespace URL.

## Updating

Review changes with `--diff` before applying them. Put the tag you're moving to in the first command; the second reviews the shadcn tooltip separately.

```bash
npx shadcn@latest add tradecn/ui/data-grid#{{tag}} --diff   # a tradecn change
npx shadcn@latest add tooltip --diff                       # a shadcn change underneath
```

After reviewing, rerun the command without `--diff` and choose which existing files to overwrite. Keep any application changes you need. If you use the namespace form, update its tag in `components.json` before adding the item again.

## Every item at once

After configuring the namespace above, you can install every component, hook and utility at {{tag}}:

```bash
npx shadcn@latest add {{everyItem}}
```

Themes are installed separately because each replaces your palette and typography tokens. Choose one from [Theming](theming.md) and review it with `--diff` before installing.
