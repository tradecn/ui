import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { DOCS_SCRIPT, DOCS_TEMPLATE, HEADERS_FILE } from "./build"

const root = resolve(import.meta.dirname, "../..")
const headers = JSON.parse(readFileSync(resolve(root, "site", HEADERS_FILE), "utf8")) as Record<string, string>
const csp = new Map(
  (headers["content-security-policy"] ?? "").split(";").map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/)
    return [name ?? "", sources] as const
  }),
)

// The first previews went live against a policy written for a page with no script, and only the
// check against tradecn.dev saw it. This is the policy the stack deploys and the smoke serves.
describe("the site's security headers", () => {
  it("let the docs page run its script, frame a preview, and let the preview load its bundle", () => {
    expect(csp.get("default-src")).toEqual(["'none'"])
    expect(csp.get("script-src")).toEqual(["'self'"])
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp.get("frame-src")).toEqual(["'self'"])
    expect(csp.get("frame-ancestors")).toEqual(["'self'"])
    expect(csp.get("base-uri")).toEqual(["'none'"])
    expect(csp.get("form-action")).toEqual(["'none'"])
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN")
  })

  it("keep every script in a file: no inline script in the docs template, and the file the builder copies", () => {
    const docs = readFileSync(resolve(root, "site", DOCS_TEMPLATE), "utf8")
    // In the head and blocking: the listener must exist before any preview iframe is parsed, or a
    // preview that mounts first posts its height to nobody. That is what happened on the live site.
    const tag = `<script src="/${DOCS_SCRIPT}"></script>`
    expect(docs).toContain(tag)
    expect(docs.indexOf(tag)).toBeLessThan(docs.indexOf("</head>"))
    expect(docs).not.toMatch(/<script[^>]*\b(defer|async)\b/)
    expect(docs).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    const script = readFileSync(resolve(root, "site", DOCS_SCRIPT), "utf8")
    expect(script).toContain('event.data.type !== "tradecn-preview"')
    expect(script).toContain("event.origin !== location.origin")
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain('cp(join(root, "site", DOCS_SCRIPT), join(out, DOCS_SCRIPT))')
  })

  it("are the ones the stack deploys and the smoke serves", () => {
    const stack = readFileSync(resolve(root, "infra/lib/tradecn-site-stack.ts"), "utf8")
    expect(stack).toContain(`../../site/${HEADERS_FILE}`)
    expect(stack).toContain('SITE_HEADERS["content-security-policy"]')
    expect(stack).not.toMatch(/contentSecurityPolicy:\s*"default-src/)
    const smoke = readFileSync(resolve(root, "scripts/site/smoke.ts"), "utf8")
    expect(smoke).toContain("HEADERS_FILE")
    expect(smoke).toContain("new Response(file, { headers })")
  })
})
