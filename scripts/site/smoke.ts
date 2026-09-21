#!/usr/bin/env bun
// Open the built site in a browser and check every preview: the docs page frames it, the embed page
// mounts it, the iframe takes the height it reports, and nothing errors on the way. Then the landing
// page: the install blocks switch package manager together, the choice survives to the next page,
// and the copy buttons copy what is showing.
//   bun scripts/site/smoke.ts [--dist site/dist] [--base https://tradecn.dev] [--port 4174] [--headers site/headers.json]
// Without --base it serves --dist itself, with the index.html rewrite the CloudFront function does and
// the security headers the edge sends (--headers names another file, to prove a policy breaks the pages).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { chromium, type Page } from "@playwright/test"
import { HEADERS_FILE, PREVIEW_PATH, SITE_SCRIPT } from "./build"

const { values: args } = parseArgs({
  options: {
    dist: { type: "string", default: "site/dist" },
    base: { type: "string" },
    port: { type: "string", default: "4174" },
    headers: { type: "string", default: path.resolve(import.meta.dirname, "../../site", HEADERS_FILE) },
  },
})
const dist = path.resolve(args.dist)
const port = Number(args.port)

// The same rewrite the edge does, a route without an extension is its index.html, and the same
// security headers on every response, so a Content-Security-Policy that would block a page blocks it here first.
function serve() {
  const headers = Object.fromEntries(Object.entries(JSON.parse(readFileSync(path.resolve(args.headers), "utf8")) as Record<string, string>).filter(([name]) => name !== "_"))
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      let pathname = new URL(request.url).pathname
      if (pathname.endsWith("/")) pathname += "index.html"
      else if (pathname.lastIndexOf(".") <= pathname.lastIndexOf("/")) pathname += "/index.html"
      const file = Bun.file(path.join(dist, pathname))
      if (!(await file.exists())) return new Response("not found", { status: 404, headers })
      // The site script is a no-store round trip on the edge while the preview bundle is cached, so on
      // the live site a preview can mount before the page is listening. Make it lose that race here, every run.
      if (pathname === `/${SITE_SCRIPT}`) await Bun.sleep(300)
      return new Response(file, { headers })
    },
  })
}

const server = args.base ? null : serve()
const base = args.base ?? `http://127.0.0.1:${port}`
const previewDir = path.join(dist, PREVIEW_PATH)
const items = args.base
  ? (process.env.SMOKE_ITEMS ?? "").split(",").filter(Boolean)
  : existsSync(previewDir)
    ? readdirSync(previewDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "assets")
        .map((entry) => entry.name)
        .sort()
    : []
if (!items.length) {
  console.error(args.base ? "set SMOKE_ITEMS=a,b,c to name the previews to check on a live site" : `${previewDir} has no previews; build the site first`)
  process.exit(1)
}

const failures: string[] = []
const browser = await chromium.launch()
// The copy buttons write the clipboard; the check reads it back.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] })

function watch(page: Page, label: string) {
  page.on("pageerror", (error) => failures.push(`${label}: page error: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label}: console error: ${message.text()}`)
  })
}

/** What the last copy button put on the clipboard. */
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText())
const firstLine = (error: unknown) => (error instanceof Error ? error.message.split("\n")[0] : String(error))

for (const item of items) {
  const page = await context.newPage()
  watch(page, item)
  try {
    // The embed page on its own: the demo mounts and reports a height.
    const response = await page.goto(`${base}/${PREVIEW_PATH}/${item}/`, { waitUntil: "load" })
    if (!response?.ok()) failures.push(`${item}: /${PREVIEW_PATH}/${item}/ answered ${response?.status()}`)
    await page.locator("#root[data-state='ready']").waitFor({ timeout: 15_000 })
    const rendered = await page.locator("#root > *").count()
    if (!rendered) failures.push(`${item}: the demo mounted nothing`)
    const themed = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())
    if (!themed) failures.push(`${item}: the embed page has no --primary; the palette did not reach it`)
    // The docs page frames it, and the height message arrives.
    await page.goto(`${base}/docs/${item}/`, { waitUntil: "load" })
    const frame = page.locator(`.preview[data-preview='${item}'] iframe`)
    await frame.waitFor({ timeout: 15_000 })
    // A demo is taller than the root's padding alone; the height has to be the demo's, not the empty page's.
    await page.waitForFunction((name) => parseFloat((document.querySelector(`.preview[data-preview='${name}'] iframe`) as HTMLIFrameElement | null)?.style.height ?? "0") > 40, item, { timeout: 15_000 })
    const height = await frame.evaluate((el) => parseFloat((el as HTMLIFrameElement).style.height))
    // The Code tab shows something, and swapping tabs works without a framework.
    await page.getByRole("tab", { name: "Code" }).click()
    if (!(await page.locator("#preview-code pre code").isVisible())) failures.push(`${item}: the Code tab shows no code`)
    const code = await page.locator("#preview-code pre code").innerText()
    if (code.includes("@/registry/")) failures.push(`${item}: the Code tab shows a playground import, not the consumer's`)
    // Its copy button puts that source on the clipboard, without the trailing newline.
    const source = await page.locator("#preview-code pre code").evaluate((el) => el.textContent ?? "")
    await page.locator("#preview-code .copy").click()
    if ((await clipboard(page)) !== source.trimEnd()) failures.push(`${item}: the Code tab's copy button copied something else`)
    // The Install section shows the pinned command under the page's package manager: npm until a reader picks one.
    const install = await page.locator("#install + .command pre:visible code").innerText()
    if (!install.startsWith(`npx shadcn@latest add tradecn/ui/${item}#v`)) failures.push(`${item}: the Install section shows "${install}"`)
    console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px`)
  } catch (error) {
    failures.push(`${item}: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The landing page: both install forms under package-manager tabs, a choice every block on the page
// follows and the next page remembers, and copy buttons that copy what is showing.
{
  const page = await context.newPage()
  watch(page, "landing")
  try {
    await page.goto(`${base}/`, { waitUntil: "load" })
    const commands = page.locator(".command")
    if ((await commands.count()) !== 2) failures.push(`landing: ${await commands.count()} install blocks, not the GitHub form and the namespace form`)
    const showing = () => commands.locator("pre:visible code").allInnerTexts()
    for (const text of await showing()) if (!text.startsWith("npx shadcn@latest add ")) failures.push(`landing: shows "${text}" before any choice; npm is the default`)
    await page.getByRole("tab", { name: "pnpm" }).first().click()
    for (const text of await showing()) if (!text.startsWith("pnpm dlx shadcn@latest add ")) failures.push(`landing: shows "${text}" after picking pnpm`)
    const selected = await page.locator(".managers [role='tab'][aria-selected='true']").allInnerTexts()
    if (selected.join(",") !== "pnpm,pnpm") failures.push(`landing: the tabs read "${selected.join(",")}" after picking pnpm on one block`)
    await commands.first().locator(".copy").click()
    const command = await clipboard(page)
    if (!command.startsWith("pnpm dlx shadcn@latest add tradecn/ui/data-grid#v") || command.endsWith("\n")) failures.push(`landing: the copy button copied "${command}"`)
    await page.locator(".code:not(.command) .copy").first().click()
    if (!(await clipboard(page)).includes('"@tradecn": "')) failures.push("landing: the components.json block did not copy")
    // The choice holds on the next page.
    await page.goto(`${base}/docs/${items[0]}/`, { waitUntil: "load" })
    const kept = await page.locator("#install + .command pre:visible code").innerText()
    if (!kept.startsWith("pnpm dlx ")) failures.push(`${items[0]}: shows "${kept}" after pnpm was picked on the landing page`)
    const tab = await page.locator("#install + .command [role='tab'][aria-selected='true']").innerText()
    if (tab !== "pnpm") failures.push(`${items[0]}: the ${tab} tab is selected after pnpm was picked on the landing page`)
    console.log("ok  landing page: the install blocks, their copy buttons, and the package manager choice")
  } catch (error) {
    failures.push(`landing: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

await browser.close()
server?.stop(true)
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`\n${items.length} previews and the landing page checked at ${base}`)
