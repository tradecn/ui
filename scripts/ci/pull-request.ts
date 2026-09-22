#!/usr/bin/env bun
// Check a pull request's title and body as release-please will read them once the pull request is
// squashed: the title is the commit's subject and the body its message, and together they pick the
// next tag. CONTRIBUTING.md states these rules in prose; this file is the one that runs.
//   PR_TITLE="feat(ticket): ..." PR_BODY="..." bun scripts/ci/pull-request.ts
import { readRegistry } from "../lib/registry"

/**
 * What a type does to the version. A `none` type is hidden from the changelog, and release-please
 * opens no release for hidden commits alone. `docs` is a patch, not `none`: tradecn.dev shows the docs
 * of the tag it serves, so a docs change has to release to be seen. Any releasing type with `!` is a
 * major.
 */
export const TYPES = {
  feat: "minor",
  fix: "patch",
  perf: "patch",
  refactor: "patch",
  chore: "patch",
  revert: "patch",
  docs: "patch",
  ci: "none",
  test: "none",
  style: "none",
  build: "none",
} as const
export type Type = keyof typeof TYPES
export type Bump = "major" | "minor" | "patch" | "none"

/** Scopes that are not items. `typography` is the font system, which runs through every item and the themes. `main` is release-please's own: `chore(main): release x.y.z`. */
export const SCOPES = ["repo", "registry", "contract", "typography", "rig", "site", "infra", "ci", "deps", "main"] as const

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!)?: (?<subject>.*)$/
/** release-please splits a squash body at a paragraph that starts like a commit and reads a footer that looks like one as a commit. */
const COMMIT_LIKE = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^()]*\))?!?: /
const BREAKING = /^BREAKING[ -]CHANGE: \S/
const NESTED = /BEGIN_NESTED_COMMIT|END_NESTED_COMMIT/

export interface PullRequest {
  title: string
  body: string
}

/** What the title alone does to the version, or undefined when it is not a conventional title. */
export function bumpFor(title: string): Bump | undefined {
  const header = HEADER.exec(title)?.groups
  const type = header?.type
  if (!header || !type || !(type in TYPES)) return undefined
  const bump = TYPES[type as Type]
  return header.bang === "!" && bump !== "none" ? "major" : bump
}

/** Every reason the pull request would mislead release-please, or nothing when it would not. */
export function checkPullRequest(pr: PullRequest, items: readonly string[]): string[] {
  const errors: string[] = []
  const scopes = new Set<string>([...items, ...SCOPES])
  const types = Object.keys(TYPES).join(", ")

  const header = HEADER.exec(pr.title)?.groups
  const bang = header?.bang === "!"
  if (!header) {
    errors.push(`the title "${pr.title}" is not "<type>(<scope>): <subject>", with "!" before the colon for a breaking change`)
  } else {
    const { type, scope, subject } = header
    if (!type || !(type in TYPES)) errors.push(`the type "${type}" is not one of ${types}`)
    if (scope === undefined) errors.push(`the title needs a scope: the item it changes, or one of ${SCOPES.join(", ")}`)
    else if (!scopes.has(scope)) errors.push(`the scope "${scope}" is not an item in registry.json or one of ${SCOPES.join(", ")}`)
    if (!subject?.trim()) errors.push("the title needs a subject after the colon")
    if (bang && type && type in TYPES && TYPES[type as Type] === "none") {
      errors.push(`"${type}!" would cut a major release for a change that ships nothing to a consumer; drop the "!" or change the type`)
    }
  }

  const body = pr.body.replace(/\r\n/g, "\n")
  for (const line of body.split("\n")) {
    if (COMMIT_LIKE.test(line)) errors.push(`this body line reads as a second commit to release-please and would change the release, so reword it: "${line}"`)
  }
  if (NESTED.test(body)) errors.push("the body carries release-please's nested-commit marker")

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const breaking = paragraphs.findIndex((p) => p.split("\n").some((line) => BREAKING.test(line.trim())))
  if (bang && breaking === -1) {
    errors.push('a breaking change ends its body with a paragraph that starts "BREAKING CHANGE: " and says what moved and what to do about it')
  }
  if (!bang && breaking !== -1) errors.push('the body declares a BREAKING CHANGE, so the title carries "!" before the colon too')
  if (breaking !== -1 && (breaking !== paragraphs.length - 1 || !BREAKING.test(paragraphs[breaking]!))) {
    errors.push('"BREAKING CHANGE: " opens the last paragraph of the body: release-please takes everything from the marker on as the note')
  }

  return errors
}

if (import.meta.main) {
  const title = process.env.PR_TITLE
  if (title === undefined) {
    console.error("usage: PR_TITLE=... PR_BODY=... bun scripts/ci/pull-request.ts")
    process.exit(2)
  }
  const items = readRegistry().items.map((item) => item.name)
  const errors = checkPullRequest({ title, body: process.env.PR_BODY ?? "" }, items)
  if (errors.length) {
    console.error(`the pull request would mislead release-please:\n  ` + errors.join("\n  "))
    process.exit(1)
  }
  const bump = bumpFor(title)
  console.log(bump === "none" ? `"${title}" cuts no release.` : `"${title}" is a ${bump} release when it merges.`)
}
