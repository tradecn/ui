import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { DOCS_TEMPLATE, FONTS_PATH, FONTS_STYLES, HEADERS_FILE, MODE_SCRIPT, PREVIEW_TEMPLATE, SITE_SCRIPT, SITE_STYLES, THEMES_META } from "./build"

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
    // And it covers fonts: the previews self-host Inter and JetBrains Mono under /preview/assets/, and without
    // this every preview logged a blocked font per subset and fell back to the system face.
    expect(csp.get("font-src")).toEqual(["'self'"])
    expect(csp.get("base-uri")).toEqual(["'none'"])
    expect(csp.get("form-action")).toEqual(["'none'"])
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN")
  })

  it("keep every script in a file: no inline script in the templates, and the file the builder copies", () => {
    // In the head and blocking: the listener must exist before any preview iframe is parsed, or a
    // preview that mounts first posts its height to nobody. That is what happened on the live site.
    // The landing page loads the same file, for its install blocks and copy buttons.
    const tag = `<script src="/${SITE_SCRIPT}"></script>`
    // The mode script is in the head of the pages and the previews alike, blocking, so the first paint is in the right mode.
    const mode = `<script src="/${MODE_SCRIPT}"></script>`
    for (const name of ["index.html", DOCS_TEMPLATE]) {
      const html = readFileSync(resolve(root, "site", name), "utf8")
      expect(html).toContain(tag)
      expect(html.indexOf(tag)).toBeLessThan(html.indexOf("</head>"))
      expect(html).toContain(mode)
      expect(html.indexOf(mode)).toBeLessThan(html.indexOf(tag))
      expect(html).not.toMatch(/<script[^>]*\b(defer|async)\b/)
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    }
    const preview = readFileSync(resolve(root, "site", PREVIEW_TEMPLATE), "utf8")
    expect(preview).toContain(mode)
    expect(preview.indexOf(mode)).toBeLessThan(preview.indexOf("</head>"))
    expect(preview).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    // The themes the script may put on <html> are declared in a meta before it, on the pages and the previews alike; the 404 page, with no script, declares none.
    for (const name of ["index.html", DOCS_TEMPLATE, PREVIEW_TEMPLATE]) {
      const html = readFileSync(resolve(root, "site", name), "utf8")
      expect(html, name).toContain("{{themesMeta}}")
      expect(html.indexOf("{{themesMeta}}"), name).toBeLessThan(html.indexOf(mode))
    }
    expect(readFileSync(resolve(root, "site", "404.html"), "utf8")).not.toContain("{{themesMeta}}")
    const script = readFileSync(resolve(root, "site", SITE_SCRIPT), "utf8")
    expect(script).toContain('event.data.type !== "tradecn-preview"')
    expect(script).toContain("event.origin !== location.origin")
    // The mode: the stored choice or the system's, the class on <html>, and the storage event that carries a change to the previews and the other tabs.
    const modeScript = readFileSync(resolve(root, "site", MODE_SCRIPT), "utf8")
    expect(modeScript).toContain('const MODE_KEY = "tradecn-theme"')
    expect(modeScript).toContain('matchMedia("(prefers-color-scheme: dark)")')
    expect(modeScript).toContain("root.classList.toggle(other, other === mode)")
    expect(modeScript).toContain('addEventListener("storage"')
    // The theme: its own key, the list from the meta (a stored theme the page does not know is no choice), data-theme on <html>, and the menu kept in step.
    expect(modeScript).toContain('const THEME_KEY = "tradecn-palette"')
    expect(modeScript).toContain(`document.querySelector('meta[name="${THEMES_META}"]')`)
    expect(modeScript).toContain("THEMES.includes(stored) ? stored : null")
    expect(modeScript).toContain("root.dataset.theme = theme")
    expect(modeScript).toContain('querySelectorAll(".theme-select")')
    expect(modeScript).toContain("event.key !== MODE_KEY && event.key !== THEME_KEY")
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain('cp(join(root, "site", SITE_SCRIPT), join(out, SITE_SCRIPT))')
    expect(build).toContain('cp(join(root, "site", MODE_SCRIPT), join(out, MODE_SCRIPT))')
    // The stylesheet is a file too, and the release job invalidates all three so a page never runs an old script against new markup.
    expect(build).toContain('cp(join(root, "site", SITE_STYLES), join(out, SITE_STYLES))')
    // The pages' fonts are files too: declared in one stylesheet linked before the site's, copied by the builder, synced and invalidated by the release job.
    expect(build).toContain('cp(join(root, "site", FONTS_STYLES), join(out, FONTS_STYLES))')
    for (const name of ["index.html", DOCS_TEMPLATE, "404.html"]) {
      const html = readFileSync(resolve(root, "site", name), "utf8")
      expect(html, name).toContain(`<link rel="stylesheet" href="/${FONTS_STYLES}">`)
      if (name !== "404.html") expect(html.indexOf(FONTS_STYLES), name).toBeLessThan(html.indexOf(SITE_STYLES))
    }
    const release = readFileSync(resolve(root, ".github/workflows/release-please.yml"), "utf8")
    expect(release).toContain(`"/${SITE_SCRIPT}" "/${SITE_STYLES}" "/${MODE_SCRIPT}" "/${FONTS_STYLES}" "/${FONTS_PATH}/*"`)
    expect(release).toContain(`aws s3 sync site/dist/${FONTS_PATH} "s3://$BUCKET/${FONTS_PATH}"`)
    expect(release).toContain(`--exclude "${FONTS_PATH}/*"`)
    expect(release).toContain("--changelog release/CHANGELOG.md")
  })

  it("say on <html> which release a page is and where its tree is served from, and the edge reads a dotted release as a route", () => {
    for (const name of ["index.html", DOCS_TEMPLATE]) expect(readFileSync(resolve(root, "site", name), "utf8"), name).toContain('<html lang="en" data-version="{{tag}}" data-base="{{base}}">')
    // The 404 page has no script to read them, and lives at the root alone.
    expect(readFileSync(resolve(root, "site", "404.html"), "utf8")).toContain('<html lang="en">')
    // /v1.2.0 is a release's tree, not a file: an extension starts with a letter. The smoke's server does what the edge does.
    const stack = readFileSync(resolve(root, "infra/lib/tradecn-site-stack.ts"), "utf8")
    expect(stack).toContain(String.raw`!/\\.[a-z][a-z0-9]*$/i.test(uri.slice(uri.lastIndexOf("/")))`)
    const smoke = readFileSync(resolve(root, "scripts/site/smoke.ts"), "utf8")
    expect(smoke).toContain(String.raw`!/\.[a-z][a-z0-9]*$/i.test(pathname.slice(pathname.lastIndexOf("/")))`)
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
    const [, push = ""] = infra.split(/^ {2}push:$/m)
    expect(push).toContain(`- site/${HEADERS_FILE}`)
    // Every pull request synthesizes the stack in ci.yml, with no path filter, so a policy change is checked before it merges.
    const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")
    expect(ci).toContain("bun run --cwd infra synth")
    expect(ci).not.toMatch(/^ {4}paths:$/m)
  })
})
