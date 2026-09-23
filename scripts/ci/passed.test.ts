import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { CHECK_NAME, type Needs, verdict } from "./passed"

const root = resolve(import.meta.dirname, "../..")
const read = (file: string) => readFileSync(resolve(root, file), "utf8")

/** Each top-level job of a workflow with its text, keyed by id. */
function jobsOf(workflow: string): Map<string, string> {
  const jobs = new Map<string, string>()
  const body = workflow.slice(workflow.indexOf("\njobs:\n") + "\njobs:\n".length)
  for (const part of body.split(/^(?= {2}[a-z][\w-]*:[ \t]*$)/m)) {
    const id = /^ {2}([a-z][\w-]*):/.exec(part)?.[1]
    if (id) jobs.set(id, part)
  }
  return jobs
}

const green: Needs = {
  verify: { result: "success" },
  "consumer-matrix": { result: "success" },
  site: { result: "success" },
  "github-form": { result: "success" },
  infra: { result: "success" },
}

describe("the verdict", () => {
  it("is green when every job succeeded", () => {
    expect(verdict(green, [])).toEqual([])
  })

  it("names a failed or cancelled job", () => {
    expect(verdict({ ...green, site: { result: "failure" } }, [])).toEqual(["site: failure"])
    expect(verdict({ ...green, verify: { result: "cancelled" }, site: { result: "skipped" } }, [])).toEqual(["verify: cancelled", "site: skipped"])
  })

  it("lets a named job skip and no other", () => {
    const fork = { ...green, "github-form": { result: "skipped" as const } }
    expect(verdict(fork, ["github-form"])).toEqual([])
    expect(verdict(fork, [])).toEqual(["github-form: skipped"])
    expect(verdict({ ...green, infra: { result: "skipped" } }, ["github-form"])).toEqual(["infra: skipped"])
  })

  it("is not green over nothing", () => {
    expect(verdict({}, [])).toEqual(["no jobs to judge"])
  })
})

describe("the check in the workflows", () => {
  const ci = read(".github/workflows/ci.yml")
  const jobs = jobsOf(ci)

  it("is one job that needs every other job in ci.yml and runs whatever they did", () => {
    const passed = jobs.get("passed") ?? ""
    expect(passed).toContain(`name: ${CHECK_NAME}`)
    expect(passed).toContain("if: always()")
    const needs = /needs: \[([^\]]+)\]/.exec(passed)?.[1]?.split(",").map((job) => job.trim()) ?? []
    expect(needs.sort()).toEqual([...jobs.keys()].filter((job) => job !== "passed").sort())
    expect(passed).toContain("NEEDS: ${{ toJSON(needs) }}")
    expect(passed).toContain("bun scripts/ci/passed.ts")
  })

  it("reads the title and body as they are now, not as the event carried them", () => {
    const passed = jobs.get("passed") ?? ""
    expect(passed).toContain("bun scripts/ci/pull-request.ts")
    expect(passed).toContain('gh api "repos/$GITHUB_REPOSITORY/pulls/$PR"')
    expect(passed).not.toContain("github.event.pull_request.title")
  })

  it("lets only github-form skip, and only on a fork's pull request", () => {
    const passed = jobs.get("passed") ?? ""
    expect(passed).toContain("MAY_SKIP: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'github-form' || '' }}")
    expect(jobs.get("github-form")).toContain("github.event.pull_request.head.repo.full_name == github.repository")
  })

  it("synthesizes the stack on every pull request, so the gate covers infra too", () => {
    expect(jobs.get("infra")).toContain("bun run --cwd infra synth")
    expect(jobs.get("infra")).not.toContain("needs:")
    expect(read(".github/workflows/infra.yml")).not.toMatch(/^ {2}pull_request:$/m)
  })

  it("comes from ci on a release pull request too, which release-please opens with the App's token", () => {
    const release = read(".github/workflows/release-please.yml")
    const job = jobsOf(release).get("release-please") ?? ""
    expect(job).toContain("uses: actions/create-github-app-token@")
    expect(job).toContain("client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}")
    expect(job).toContain("private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}")
    expect(job).toContain("token: ${{ steps.app.outputs.token }}")
    expect(jobsOf(release).has("release-check")).toBe(false)
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/pull-request.yml"]) {
      expect(read(workflow)).not.toContain("paths-ignore")
    }
  })
})

describe("the runs on main", () => {
  it("are never cancelled: a pull request groups by its ref and cancels, a push groups by its own commit", () => {
    const ci = read(".github/workflows/ci.yml")
    const block = /^concurrency:\n((?: {2}.*\n)+)/m.exec(ci)?.[1] ?? ""
    expect(block).toContain("group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}")
    expect(block).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
    expect(block).not.toContain("cancel-in-progress: true")
  })
})
