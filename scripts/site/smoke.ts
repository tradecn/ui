#!/usr/bin/env bun
// Open the built site in a browser and check every preview: the docs page frames it, the embed page
// mounts it, the iframe takes the height it reports, and nothing errors on the way. Then the opening
// page: the two ways in, and every item running in the showcase at the height it reported. Then the
// Installation page: the install blocks switch package manager together, the choice survives to the
// next page, and the copy buttons copy what is showing. Then the Components and Changelog pages answer.
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
/** The height a preview frame has taken from its page's message, in px. */
const frameHeight = (page: Page, item: string) => page.evaluate((name) => parseFloat((document.querySelector(`iframe[data-preview='${name}']`) as HTMLIFrameElement | null)?.style.height ?? "0"), item)

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
    // The page's own headings are down the right, Installation first, and the arrows sit beside the title.
    if (!(await page.locator(".toc a[href='#installation']").count())) failures.push(`${item}: the page lists no Installation under On this page`)
    if (!(await page.locator(".arrows a[rel='prev'], .arrows a[rel='next']").count())) failures.push(`${item}: no arrows beside the title`)
    // The Code tab shows something, and swapping tabs works without a framework.
    await page.getByRole("tab", { name: "Code" }).click()
    const previewCode = page.locator(".preview-code pre code")
    if (!(await previewCode.isVisible())) failures.push(`${item}: the Code tab shows no code`)
    const code = await previewCode.innerText()
    if (code.includes("@/registry/")) failures.push(`${item}: the Code tab shows a playground import, not the consumer's`)
    // Its copy button puts that source on the clipboard, without the trailing newline.
    const source = await previewCode.evaluate((el) => el.textContent ?? "")
    await page.locator(".preview-code .copy").click()
    if ((await clipboard(page)) !== source.trimEnd()) failures.push(`${item}: the Code tab's copy button copied something else`)
    // Installation: Command shows the pinned command under the page's package manager, npm until a reader picks
    // one; Manual opens on its tab and spells the install out with a consumer's imports, never the playground's.
    const command = await page.locator("#installation-command .command pre:visible code").innerText()
    if (!command.startsWith(`npx shadcn@latest add tradecn/ui/${item}#v`)) failures.push(`${item}: Installation's Command shows "${command}"`)
    if (await page.locator("#installation-manual").isVisible()) failures.push(`${item}: Manual is showing before its tab was clicked`)
    await page.getByRole("tab", { name: "Manual" }).click()
    if (!(await page.locator("#installation-manual").isVisible())) failures.push(`${item}: Manual did not open on its tab`)
    if (await page.locator("#installation-command").isVisible()) failures.push(`${item}: Command is still showing beside Manual`)
    const manual = await page.locator("#installation-manual").innerText()
    if (manual.includes("@/registry/")) failures.push(`${item}: Manual shows a playground import, not the consumer's`)
    if (!(await page.locator("#installation-manual .code").count())) failures.push(`${item}: Manual has nothing to copy`)
    console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px`)
  } catch (error) {
    failures.push(`${item}: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The opening page: the two ways in, and every item running in the showcase at the height it reported.
{
  const page = await context.newPage()
  watch(page, "opening")
  try {
    await page.goto(`${base}/`, { waitUntil: "load" })
    for (const [text, href] of [
      ["Get Started", "/docs/installation/"],
      ["View Components", "/docs/components/"],
    ]) {
      if (!(await page.locator(`.hero a.button[href='${href}']`, { hasText: text }).count())) failures.push(`opening: no "${text}" button to ${href}`)
    }
    const frames = page.locator(".showcase iframe[data-preview]")
    if ((await frames.count()) !== items.length) failures.push(`opening: ${await frames.count()} items in the showcase, not ${items.length}`)
    // Every frame takes its demo's height, including the ones far below the fold; a demo is taller than 40px.
    await page.waitForFunction(() => [...document.querySelectorAll(".showcase iframe[data-preview]")].every((el) => parseFloat((el as HTMLIFrameElement).style.height || "0") > 40), undefined, { timeout: 30_000 })
    for (const item of items) {
      const card = page.locator(`.showcase .card[data-preview='${item}']`)
      if (!(await card.locator(`a[href='/docs/${item}/']`).count())) failures.push(`opening: the ${item} card does not link its page`)
    }
    const heights = await Promise.all(items.map((item) => frameHeight(page, item)))
    console.log(`ok  opening page: ${items.length} items running, ${Math.round(Math.min(...heights))}px to ${Math.round(Math.max(...heights))}px`)
  } catch (error) {
    failures.push(`opening: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The Installation page: both install forms under package-manager tabs, a choice every block on the page
// follows and the next page remembers, and copy buttons that copy what is showing.
{
  const page = await context.newPage()
  watch(page, "installation")
  try {
    await page.goto(`${base}/docs/installation/`, { waitUntil: "load" })
    const commands = page.locator(".command")
    if ((await commands.count()) < 2) failures.push(`installation: ${await commands.count()} install blocks, not the GitHub form and the namespace form`)
    const showing = () => commands.locator("pre:visible code").allInnerTexts()
    for (const text of await showing()) if (!text.startsWith("npx shadcn@latest add ")) failures.push(`installation: shows "${text}" before any choice; npm is the default`)
    await page.getByRole("tab", { name: "pnpm" }).first().click()
    for (const text of await showing()) if (!text.startsWith("pnpm dlx shadcn@latest add ")) failures.push(`installation: shows "${text}" after picking pnpm`)
    const selected = await page.locator(".managers [role='tab'][aria-selected='true']").allInnerTexts()
    if (selected.some((tab) => tab !== "pnpm")) failures.push(`installation: the tabs read "${selected.join(",")}" after picking pnpm on one block`)
    await commands.first().locator(".copy").click()
    const command = await clipboard(page)
    if (!command.startsWith("pnpm dlx shadcn@latest add tradecn/ui/data-grid#v") || command.endsWith("\n")) failures.push(`installation: the copy button copied "${command}"`)
    await page.locator(".code:not(.command) .copy").first().click()
    if (!(await clipboard(page)).includes('"@tradecn": "')) failures.push("installation: the components.json block did not copy")
    // The choice holds on the next page.
    await page.goto(`${base}/docs/${items[0]}/`, { waitUntil: "load" })
    const kept = await page.locator("#installation-command .command pre:visible code").innerText()
    if (!kept.startsWith("pnpm dlx ")) failures.push(`${items[0]}: shows "${kept}" after pnpm was picked on the Installation page`)
    const tab = await page.locator("#installation-command .command [role='tab'][aria-selected='true']").innerText()
    if (tab !== "pnpm") failures.push(`${items[0]}: the ${tab} tab is selected after pnpm was picked on the Installation page`)
    console.log("ok  installation page: the install blocks, their copy buttons, and the package manager choice")
  } catch (error) {
    failures.push(`installation: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The Components and Changelog pages answer, and the index links every item's page.
{
  const page = await context.newPage()
  watch(page, "docs")
  try {
    await page.goto(`${base}/docs/components/`, { waitUntil: "load" })
    for (const item of items) {
      if (!(await page.locator(`.cards a.card[href='/docs/${item}/']`).count())) failures.push(`components: no card for ${item}`)
    }
    const changelog = await page.goto(`${base}/docs/changelog/`, { waitUntil: "load" })
    if (!changelog?.ok()) failures.push(`changelog: /docs/changelog/ answered ${changelog?.status()}`)
    if (!(await page.locator("article h1", { hasText: "Changelog" }).count())) failures.push("changelog: no Changelog title")
    if (!(await page.locator("article h2").count())) failures.push("changelog: no release on the page")
    const intro = await page.goto(`${base}/docs/`, { waitUntil: "load" })
    if (!intro?.ok()) failures.push(`docs: /docs/ answered ${intro?.status()}`)
    if (!(await page.locator(".sidebar a[href='/docs/'][aria-current='page']").count())) failures.push("docs: /docs/ is not the Introduction in the sidebar")
    console.log("ok  components, changelog, and introduction pages")
  } catch (error) {
    failures.push(`docs: ${firstLine(error)}`)
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
console.log(`\n${items.length} previews, the opening page, and the docs pages checked at ${base}`)
