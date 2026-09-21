# Contributing

`main` takes pull requests only, squashed. The title becomes the commit, and the commit picks the next tag. So the title is the part to get right.

## The title

`<type>(<scope>): <subject>`. A breaking change puts `!` before the colon: `feat(ticket)!: side becomes direction`.

| Type | Release | Shows up as |
|---|---|---|
| any type below with `!` | major | ⚠ Breaking Changes |
| `feat` | minor | Features |
| `fix` | patch | Bug Fixes |
| `perf` | patch | Performance |
| `refactor`, `chore` | patch | Maintenance |
| `revert` | patch | Reverts |
| `docs`, `ci`, `test`, `style`, `build` | none | nothing |

Why `chore` and `refactor` release: what you install is source. A tidied `data-grid.tsx` is a different file in your repo, and `--diff` should be able to see it.

Why `docs` doesn't: tradecn.dev shows the docs of the tag it serves. A docs fix lands with the next release and the page keeps matching the files. If it can't wait, it's a `fix`.

`!` goes on a type that releases. `docs!` would cut a major for a change nobody installs, so the check refuses it.

The scope is the item you changed (`ticket`, `use-hotkeys`), or one of `repo`, `registry`, `contract`, `rig`, `site`, `infra`, `ci`, `deps`. `main` is release-please's own.

Dependency bumps are `build(deps)`. `package.json` sits at the root, where release-please can't ignore it by path, so the type does the ignoring.

## The body

The body is the commit message, and release-please reads it too.

- A breaking change ends its body with a paragraph that starts `BREAKING CHANGE: ` and says what moved and what to do about it. That paragraph is what the changelog prints under ⚠ Breaking Changes. `####` headings and bullets right under it are part of it.
- No line may start like a commit (`fix(data-grid): ...`). release-please would read it as a second commit and change the release. Say it another way.
- A `BREAKING CHANGE:` paragraph without `!` in the title fails, and so does the reverse.

## The check

`pull-request` runs on every pull request, and again when you edit the title or body. It is `scripts/ci/pull-request.ts`, with a test table beside it. GitHub does not require it: a release pull request is opened by a bot, and GitHub won't run that pull request's workflows without a hand on the approve button, so a required check would sit between you and the tag. Green is still the bar to merge.

## What releases

release-please watches `main`. When a releasing commit lands it opens a release pull request with the changelog and the new `version.txt`. Merging that pull request tags `vX.Y.Z`, and the same run publishes `/r/vX.Y.Z/` on tradecn.dev and moves the latest pointer if the tag is the highest one.

Commits that only touch `site/`, `infra/`, `.github/`, `playground/`, `fixtures/`, `bench/`, `assets/`, `scripts/ci/`, `scripts/infra/`, or `scripts/site/` never release, whatever their type.

Versions are semver from `v0.1.3` on, with no pre-1.0 exceptions. The first `!` cuts `v1.0.0`.

## Before you push

`bun install`, then `just check`. That's what CI runs.
