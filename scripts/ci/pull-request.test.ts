import { describe, expect, it } from "vitest"
import { bumpFor, checkPullRequest, SCOPES, TYPES } from "./pull-request"

const items = ["data-grid", "row-store", "ticket", "use-hotkeys"]
const check = (title: string, body = "") => checkPullRequest({ title, body }, items)
const breaking = "The ticket's side buttons moved.\n\nBREAKING CHANGE: `side` is now `direction`. Rename the prop."

describe("what a title does to the version", () => {
  it.each([
    ["feat(ticket): steps by the tick", "minor"],
    ["fix(data-grid): keeps the header when the store empties", "patch"],
    ["perf(row-store): one subscription per row", "patch"],
    ["refactor(use-hotkeys): one parser for chords and keys", "patch"],
    ["chore(repo): the license holder", "patch"],
    ["revert(ticket): the tick stepping", "patch"],
    ["chore(main): release 0.2.0", "patch"],
    ["docs(ticket): the keys table", "none"],
    ["ci(site): deploy the docs pages", "none"],
    ["test(data-grid): the resize path", "none"],
    ["style(registry): formatting", "none"],
    ["build(deps): bump dockview-react", "none"],
    ["feat(ticket)!: side becomes direction", "major"],
    ["fix(data-grid)!: rows are keyed by id", "major"],
    ["chore(registry)!: drop the classic theme", "major"],
  ] as const)("%s → %s", (title, bump) => {
    expect(bumpFor(title)).toBe(bump)
  })

  it("is undefined for a title that is not conventional", () => {
    expect(bumpFor("Steps by the tick")).toBeUndefined()
    expect(bumpFor("wip(ticket): stepping")).toBeUndefined()
  })

  it("keeps the table and the scope list in step with CONTRIBUTING.md", () => {
    expect(Object.keys(TYPES)).toEqual(["feat", "fix", "perf", "refactor", "chore", "revert", "docs", "ci", "test", "style", "build"])
    expect(SCOPES).toEqual(["repo", "registry", "contract", "typography", "rig", "site", "infra", "ci", "deps", "main"])
  })
})

describe("the title", () => {
  it("passes every releasing and non-releasing form", () => {
    for (const title of ["feat(ticket): steps by the tick", "docs(ticket): the keys table", "chore(main): release 0.2.0", "build(deps): bump dockview-react"]) {
      expect(check(title)).toEqual([])
    }
  })

  it("rejects a title that is not conventional", () => {
    expect(check("Steps by the tick")).toEqual([expect.stringContaining("<type>(<scope>): <subject>")])
    expect(check("feat(ticket) steps by the tick")).toEqual([expect.stringContaining("<type>(<scope>): <subject>")])
    expect(check("Feat(ticket): steps by the tick")).toEqual([expect.stringContaining("<type>(<scope>): <subject>")])
  })

  it("rejects a type that is not in the table", () => {
    expect(check("wip(ticket): stepping")).toEqual([expect.stringContaining('the type "wip"')])
  })

  it("requires a scope that is an item or a repo area", () => {
    expect(check("feat: steps by the tick")).toEqual([expect.stringContaining("needs a scope")])
    expect(check("feat(): steps by the tick")).toEqual([expect.stringContaining('the scope ""')])
    expect(check("feat(sparkline): a crosshair")).toEqual([expect.stringContaining('the scope "sparkline"')])
    expect(check("feat(rig): the matrix appends @source lines")).toEqual([])
  })

  it("requires a subject", () => {
    expect(check("feat(ticket): ")).toEqual([expect.stringContaining("needs a subject")])
  })

  it("refuses ! on a type that ships nothing", () => {
    expect(check("docs(ticket)!: the keys table", breaking)).toEqual([expect.stringContaining('"docs!" would cut a major')])
    expect(check("ci(site)!: deploy", breaking)).toEqual([expect.stringContaining('"ci!" would cut a major')])
  })
})

describe("the body", () => {
  it("passes prose, footers, and a mention of a commit mid-line", () => {
    expect(check("fix(data-grid): keeps the header", "The old fix(data-grid): commit missed the empty store.\n\nCloses #12")).toEqual([])
  })

  it("rejects a line release-please would read as a second commit", () => {
    const body = "Also tidied the header.\n\nfix(data-grid): also tidied the header"
    expect(check("chore(repo): the license holder", body)).toEqual([expect.stringContaining('reword it: "fix(data-grid): also tidied the header"')])
    expect(check("chore(repo): the license holder", "feat!: bang form")).toEqual([expect.stringContaining('reword it: "feat!: bang form"')])
  })

  it("rejects the nested-commit marker", () => {
    expect(check("chore(repo): the license holder", "BEGIN_NESTED_COMMIT\nchore: x\nEND_NESTED_COMMIT")).toEqual(
      expect.arrayContaining([expect.stringContaining("nested-commit marker")]),
    )
  })

  it("requires a BREAKING CHANGE paragraph when the title has !", () => {
    expect(check("feat(ticket)!: side becomes direction")).toEqual([expect.stringContaining('starts "BREAKING CHANGE: "')])
    expect(check("feat(ticket)!: side becomes direction", breaking)).toEqual([])
    expect(check("feat(ticket)!: side becomes direction", "BREAKING-CHANGE: the hyphen form")).toEqual([])
  })

  it("requires ! when the body declares a BREAKING CHANGE", () => {
    expect(check("feat(ticket): side becomes direction", breaking)).toEqual([expect.stringContaining('carries "!"')])
  })

  it("wants the BREAKING CHANGE paragraph last and the marker on its first line", () => {
    expect(check("feat(ticket)!: side becomes direction", breaking + "\n\nAlso a new color.")).toEqual([expect.stringContaining("opens the last paragraph")])
    expect(check("feat(ticket)!: side becomes direction", "Moved.\nBREAKING CHANGE: mid-paragraph")).toEqual([expect.stringContaining("opens the last paragraph")])
    const extended = breaking + "\n#### Renamed\n- `side` to `direction`\n* `qty` to `quantity`"
    expect(check("feat(ticket)!: side becomes direction", extended)).toEqual([])
  })

  it("treats a missing body as empty", () => {
    expect(check("chore(repo): the license holder", "")).toEqual([])
  })
})
