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
| `docs` | patch | Documentation |
| `ci`, `test`, `style`, `build` | none | nothing |

Why `chore` and `refactor` release: what you install is source. A tidied `data-grid.tsx` is a different file in your repo, and `--diff` should be able to see it.

Why `docs` releases: tradecn.dev shows the docs of the tag it serves, so a docs change nobody released is a docs change nobody sees. As a patch it opens the release pull request, or joins the one already open, and the page goes live with the files it describes.

`!` goes on a type that releases. `ci!` would cut a major for a change nobody installs, so the check refuses it.

The scope is the item you changed (`ticket`, `use-hotkeys`), or one of `repo`, `registry`, `contract`, `typography`, `rig`, `site`, `infra`, `ci`, `deps`. `main` is release-please's own.

Dependency bumps are `build(deps)`. `package.json` sits at the root, where release-please can't ignore it by path, so the type does the ignoring.

## The body

The body is the commit message, and release-please reads it too.

- A breaking change ends its body with a paragraph that starts `BREAKING CHANGE: ` and says what moved and what to do about it. That paragraph is what the changelog prints under ⚠ Breaking Changes. `####` headings and bullets right under it are part of it.
- No line may start like a commit (`fix(data-grid): ...`). release-please would read it as a second commit and change the release. Say it another way.
- A `BREAKING CHANGE:` paragraph without `!` in the title fails, and so does the reverse.

## The checks

`ci` runs on every pull request: `verify` (lint, types, tests, the validator, the registry build), `consumer-matrix` (three clean projects install the registry through the real CLI and render every item), `site` (tradecn.dev as the commit would publish it, smoke-tested in a browser), `github-form` (the install-by-ref path against the exact commit), and `infra` (the tradecn.dev stack synthesizes). `pull-request` checks the title and body against the rules above the moment you open or edit them. It is `scripts/ci/pull-request.ts`, with a test table beside it.

`CI passed` is the one to watch, and the one the `main` ruleset requires. It goes green when every `ci` job is green and the title and body pass as they read at that moment. A title fixed after the run stays red there until the job reruns: Re-run failed jobs on the `ci` run, and it reads the pull request again. Enable auto-merge on a pull request and it merges the moment `CI passed` reports.

A release pull request is opened by a bot with the workflow token, and GitHub starts no workflow on one. It gets `CI passed` from the `release-please` run instead, after every push to `main`: the commits it releases were each checked on their own pull request, and the release commit changes only the changelog, `version.txt`, the README's tag lines, and the manifest. Merging it is still a deliberate act. The same skip means a pull request that touches only those release files gets no `ci` run at all, so make such a change alongside something else.

## What releases

release-please watches `main`. When a releasing commit lands it opens a release pull request with the changelog and the new `version.txt`. Merging that pull request tags `vX.Y.Z`, and the same run publishes `/r/vX.Y.Z/` and the release's own pages at `/vX.Y.Z/` on tradecn.dev, and moves the latest pointer and the root's pages if the tag is the highest one.

Commits that only touch `site/`, `infra/`, `.github/`, `playground/`, `fixtures/`, `bench/`, `assets/`, `scripts/ci/`, `scripts/infra/`, or `scripts/site/` never release, whatever their type.

Versions are semver from `v0.1.3` on, with no pre-1.0 exceptions. The first `!` cuts `v1.0.0`.

## Before you push

`bun install`, then `just check`. That's what CI runs.
