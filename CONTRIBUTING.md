# Contributing

Changes to `main` go through squash-merged pull requests. The PR title and body become the commit message that determines the next release.

## The title

`<type>(<scope>): <subject>`. A breaking change puts `!` before the colon: `feat(ticket)!: side becomes direction`.

| Type | Release | Shows up as |
|---|---|---|
| any releasing type with `!` | major | ⚠ Breaking Changes |
| `feat` | minor | Features |
| `fix` | patch | Bug Fixes |
| `perf` | patch | Performance |
| `refactor`, `chore` | patch | Maintenance |
| `revert` | patch | Reverts |
| `docs` | patch | Documentation |
| `ci`, `test`, `style`, `build` | none | nothing |

`chore` and `refactor` release because consumers install source. Even an internal cleanup changes the file they receive through `shadcn add`.

`docs` releases because tradecn.dev reads documentation from the published release tag. A docs patch opens or joins the release PR so the page can publish with the source it describes.

Use `!` only with a releasing type. The title check rejects it on `ci`, `test`, `style` and `build`.

The scope is the item you changed (`ticket`, `use-hotkeys`), or one of `repo`, `registry`, `contract`, `typography`, `rig`, `site`, `infra`, `ci`, `deps`. `main` is release-please's own.

Dependency bumps are `build(deps)`. `package.json` sits at the root, where release-please can't ignore it by path, so the type does the ignoring.

## The body

The body is the commit message, and release-please reads it too.

- A breaking change ends its body with a paragraph that starts `BREAKING CHANGE: ` and says what moved and what to do about it. That paragraph is what the changelog prints under ⚠ Breaking Changes. `####` headings and bullets right under it are part of it.
- No line may start like a commit (`fix(data-grid): ...`). release-please would read it as a second commit and change the release. Say it another way.
- A `BREAKING CHANGE:` paragraph without `!` in the title fails, and so does the reverse.

For example, a hypothetical `feat(ticket)!: rename side to direction` PR could end with:

```text
BREAKING CHANGE: Ticket now accepts direction instead of side. Rename side="buy" to direction="buy" at each call site.
```

## The checks

The `ci` workflow runs on every pull request:

| Job | Checks |
|---|---|
| `verify` | Lint, types, tests, the item validator, tokens and registry build. |
| `consumer-matrix` | Installs and renders the registry in three clean projects through the real CLI. |
| `site` | Builds the site and opens every preview in a browser. |
| `github-form` | Installs by the exact commit ref; skipped for fork PRs. |
| `infra` | Typechecks and synthesizes the site stack. |

The separate `pull-request` workflow checks the title and body when you open or edit a PR. Its implementation and test table are in `scripts/ci/pull-request.ts` and the adjacent test file.

`CI passed` is the required status check. It checks every job result and rereads the current title and body. If you fix the title after that job fails, select **Re-run failed jobs** on the `ci` run so it reads the correction. A PR with auto-merge enabled can merge once the required check passes.

A release pull request is opened by release-please with the release App's token, so it is the App's pull request and `ci` and `pull-request` run on it as on any other. GitHub holds the workflow runs of a pull request that `github-actions[bot]` opened until someone with write access approves them, which is why the App opens it and not the workflow token. Merging it is still a deliberate act.

## What releases

release-please watches `main`. When a releasing commit lands it opens a release pull request with the changelog and the new `version.txt`. Merging that pull request tags `vX.Y.Z`, and the same run publishes `/r/vX.Y.Z/` and the release's own pages at `/vX.Y.Z/` on tradecn.dev, and moves the latest pointer and the root's pages if the tag is the highest one.

Commits that only touch `site/`, `infra/`, `.github/`, `playground/`, `fixtures/`, `bench/`, `assets/`, `scripts/ci/`, `scripts/infra/`, or `scripts/site/` never release, whatever their type.

Versions are semver from `v0.1.3` on, with no pre-1.0 exceptions. The first `!` cuts `v1.0.0`.

## Before you push

Run from the repository root:

```bash
bun install
just check
```

For changes to installed components, run the three-style [consumer matrix](fixtures/README.md) as well.
