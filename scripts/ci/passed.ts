#!/usr/bin/env bun
// The verdict of the "CI passed" job in ci.yml, the one check a ruleset requires and auto-merge
// waits on. Every job it needs must have succeeded. A job named in MAY_SKIP may also have been
// skipped: github-form skips itself on a pull request from a fork, whose commit the CLI cannot
// install by ref. Anything failed, cancelled, or skipped for another reason keeps the check red.
//   NEEDS='{"verify":{"result":"success"}}' MAY_SKIP="github-form" bun scripts/ci/passed.ts
// NEEDS is the workflow's `toJSON(needs)`.

/** The check's name, as the ruleset requires it. ci.yml names the job this. */
export const CHECK_NAME = "CI passed"

export type Result = "success" | "failure" | "cancelled" | "skipped"
export type Needs = Record<string, { result: Result }>

/** Every job that keeps the check from being green, or nothing when it is. */
export function verdict(needs: Needs, maySkip: readonly string[]): string[] {
  const jobs = Object.entries(needs)
  if (jobs.length === 0) return ["no jobs to judge"]
  const errors: string[] = []
  for (const [job, { result }] of jobs) {
    if (result === "success") continue
    if (result === "skipped" && maySkip.includes(job)) continue
    errors.push(`${job}: ${result}`)
  }
  return errors
}

if (import.meta.main) {
  const raw = process.env.NEEDS
  if (!raw) {
    console.error("usage: NEEDS='<toJSON(needs)>' [MAY_SKIP='job ...'] bun scripts/ci/passed.ts")
    process.exit(2)
  }
  const needs = JSON.parse(raw) as Needs
  const maySkip = (process.env.MAY_SKIP ?? "").split(/\s+/).filter(Boolean)
  for (const [job, { result }] of Object.entries(needs)) {
    const mark = result === "success" ? "ok" : result === "skipped" && maySkip.includes(job) ? "--" : "!!"
    console.log(`${mark} ${job}: ${result}`)
  }
  const errors = verdict(needs, maySkip)
  if (errors.length) {
    console.error(`${CHECK_NAME} is not green:\n  ` + errors.join("\n  "))
    process.exit(1)
  }
  console.log(`${CHECK_NAME}.`)
}
