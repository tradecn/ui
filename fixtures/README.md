# fixtures

`consumers/` holds three clean shadcn projects, one per locked style: `radix-nova`, `base-mira`, `base-vega`. Each is what `shadcn init -t vite` wrote, stripped to its config, lockfile, stylesheet, and an empty entry. Their `src/components`, `src/lib`, `src/hooks`, and `src/smoke` are gitignored on purpose: CI runs `shadcn add` against the built registry and lets the CLI do the whole install, built-ins included, so an undeclared dependency has nowhere to hide. They are not workspaces of the root for the same reason.

`smoke/` holds one scene per item, a Playwright spec that renders them all, and the entry that mounts them. `scripts/ci/consumer-matrix.sh <style>` copies these in after the install, typechecks (tradecn's files must be clean; errors in the consumer's own shadcn files are reported as upstream and not counted), builds, and opens the page in Chromium. After a local run, `git checkout -- fixtures/consumers` puts the tracked files back.

All three use lucide icons. Base UI styles default to hugeicons, and as of its 4.3 release that package's ESM index imports `Grid2x2XIcon.js` and `Grid3x2Icon.js` while the files on disk are `Grid2X2XIcon.js` and `Grid3X2Icon.js`. macOS resolves that; Linux does not, so the bundle fails on a runner before any tradecn code is reached. The icon library is incidental to what the matrix tests, so the fixtures avoid it.
