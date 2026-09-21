import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { DOCS_TEMPLATE, HEADERS_FILE, SITE_SCRIPT, SITE_STYLES } from "./build"

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
  it("let the docs page run its script, frame a preview, let the preview load its bundle, and let the search fetch its index", () => {
    expect(csp.get("default-src")).toEqual(["'none'"])
    expect(csp.get("script-src")).toEqual(["'self'"])
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp.get("frame-src")).toEqual(["'self'"])
    expect(csp.get("frame-ancestors")).toEqual(["'self'"])
    // default-src 'none' covers fetch, so the search index needs this or the dialog says it did not load.
    expect(csp.get("connect-src")).toEqual(["'self'"])
    expect(csp.get("base-uri")).toEqual(["'none'"])
    expect(csp.get("form-action")).toEqual(["'none'"])
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN")
  })

  it("keep every script in a file: no inline script in the templates, and the file the builder copies", () => {
    // In the head and blocking: the listener must exist before any preview iframe is parsed, or a
    // preview that mounts first posts its height to nobody. That is what happened on the live site.
    // The landing page loads the same file, for its install blocks and copy buttons.
    const tag = `<script src="/${SITE_SCRIPT}"></script>`
    for (const name of ["index.html", DOCS_TEMPLATE]) {
      const html = readFileSync(resolve(root, "site", name), "utf8")
      expect(html).toContain(tag)
      expect(html.indexOf(tag)).toBeLessThan(html.indexOf("</head>"))
      expect(html).not.toMatch(/<script[^>]*\b(defer|async)\b/)
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    }
    const script = readFileSync(resolve(root, "site", SITE_SCRIPT), "utf8")
    expect(script).toContain('event.data.type !== "tradecn-preview"')
    expect(script).toContain("event.origin !== location.origin")
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain('cp(join(root, "site", SITE_SCRIPT), join(out, SITE_SCRIPT))')
    // The stylesheet is a file too, and the release job invalidates both so a page never runs an old script against new markup.
    expect(build).toContain('cp(join(root, "site", SITE_STYLES), join(out, SITE_STYLES))')
    const release = readFileSync(resolve(root, ".github/workflows/release-please.yml"), "utf8")
    expect(release).toContain(`"/${SITE_SCRIPT}" "/${SITE_STYLES}"`)
    expect(release).toContain("--changelog release/CHANGELOG.md")
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

  it("redeploy the stack when they change, since the policy lives at the edge and a page publish alone would leave the old one there", () => {
    const infra = readFileSync(resolve(root, ".github/workflows/infra.yml"), "utf8")
    const [, pullRequest = "", push = ""] = infra.split(/^ {2}(?:pull_request|push):$/m)
    expect(pullRequest).toContain(`- site/${HEADERS_FILE}`)
    expect(push).toContain(`- site/${HEADERS_FILE}`)
  })
})
