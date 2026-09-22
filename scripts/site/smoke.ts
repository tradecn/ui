#!/usr/bin/env bun
// Open the built site in a browser and check every preview: the docs page frames it, the embed page
// mounts it, every number in it is set in lining tabular figures (contract rule 14), the iframe takes the
// height it reports, and nothing errors on the way. Then the opening
// page: the two ways in, the header's GitHub mark linking the repository, and every item running in the showcase at the height it reported. Then the
// Installation page: the install blocks switch package manager together, the choice survives to the
// next page, and the copy buttons copy what is showing. Then the Components and Changelog pages answer,
// the Components index holds the components alone, and the sidebar groups the pages by kind.
// Then the search: the button and mod+k open it, it lists every page, ranks a heading first, goes there
// on Enter, and a key pressed inside a preview never opens it, nor its key a demo's palette. Then the mode:
// the page follows the system until the header's button makes a choice, which every preview on the page,
// the next page, and another tab follow, and a press goes back. Then the theme: the header's menu offers
// every theme the site carries, and choosing one re-colors the page and its previews the same way.
//   bun scripts/site/smoke.ts [--dist site/dist] [--base https://tradecn.dev] [--port 4174] [--headers site/headers.json]
// Without --base it serves --dist itself, with the index.html rewrite the CloudFront function does and
// the security headers the edge sends (--headers names another file, to prove a policy breaks the pages).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { chromium, type Page } from "@playwright/test"
import { FONT_PACKAGES, HEADERS_FILE, PREVIEW_PATH, SEARCH_INDEX, SITE_SCRIPT, THEME_ITEM } from "./build"
import type { SearchPage } from "./build"

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
      // A missing key is the 404 page at a 404 status, as the distribution's error responses serve it.
      if (!(await file.exists())) return new Response(Bun.file(path.join(dist, "404.html")), { status: 404, headers })
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

// The search index says which group each page is in. A preview whose page is under Get Started is a doc's
// own demo (the Typography page's), not an item's: it has no Installation and is not in the showcase.
const pageGroups = new Map<string, string>(((await (await context.request.get(`${base}/${SEARCH_INDEX}`)).json()) as SearchPage[]).map((entry) => [entry.path, entry.group]))
const isItem = (name: string) => pageGroups.get(`/docs/${name}/`) !== "Get Started"
const itemPreviews = items.filter(isItem)
if (!itemPreviews.length) {
  console.error(`none of ${items.join(", ")} is an item's preview`)
  process.exit(1)
}

/**
 * Contract rule 14, read off the rendered page: every element under a tradecn slot whose own text holds a
 * digit, every input under one holding a number, and every node marked data-numeric is set in lining,
 * tabular figures. Returns the offenders, each named by its slot and its data attributes.
 */
const numericProblems = (page: Page) =>
  page.evaluate(() => {
    const where = (el: Element) => {
      const slot = el.closest("[data-slot^='tradecn-']")?.getAttribute("data-slot") ?? "page"
      const attrs = [...el.attributes]
        .filter((a) => a.name.startsWith("data-") && a.name !== "data-slot")
        .map((a) => `[${a.name}${a.value ? `=${a.value}` : ""}]`)
        .join("")
      return `${slot} ${el.tagName.toLowerCase()}${attrs}`
    }
    const out: string[] = []
    const seen = new Set<Element>()
    const candidates = [...document.querySelectorAll("[data-slot^='tradecn-']")].flatMap((root) => [root, ...root.querySelectorAll("*")]).concat([...document.querySelectorAll("[data-numeric]")])
    for (const el of candidates) {
      if (seen.has(el)) continue
      seen.add(el)
      const own = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join("")
      const typed = el instanceof HTMLInputElement ? el.value : ""
      if (!/\d/.test(own) && !/\d/.test(typed) && !el.hasAttribute("data-numeric")) continue
      const variant = getComputedStyle(el).fontVariantNumeric
      if (!variant.includes("lining-nums") || !variant.includes("tabular-nums")) out.push(`${where(el)}: font-variant-numeric is "${variant}"`)
    }
    return out
  })

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
    const font = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tradecn-font-mono").trim())
    if (!font) failures.push(`${item}: the embed page has no --tradecn-font-mono; the typography tokens did not reach it`)
    for (const problem of await numericProblems(page)) failures.push(`${item}: ${problem}`)
    // The docs page frames it, and the height message arrives.
    await page.goto(`${base}/docs/${item}/`, { waitUntil: "load" })
    const frame = page.locator(`.preview[data-preview='${item}'] iframe`)
    await frame.waitFor({ timeout: 15_000 })
    // A demo is taller than the root's padding alone; the height has to be the demo's, not the empty page's.
    await page.waitForFunction((name) => parseFloat((document.querySelector(`.preview[data-preview='${name}'] iframe`) as HTMLIFrameElement | null)?.style.height ?? "0") > 40, item, { timeout: 15_000 })
    const height = await frame.evaluate((el) => parseFloat((el as HTMLIFrameElement).style.height))
    // The page's own headings are down the right, Installation first on an item's page, and the arrows sit beside the title.
    if (isItem(item) && !(await page.locator(".toc a[href='#installation']").count())) failures.push(`${item}: the page lists no Installation under On this page`)
    if (!isItem(item) && (await page.locator("#installation").count())) failures.push(`${item}: a doc's page grew an Installation section`)
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
    if (!isItem(item)) {
      console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px (a doc's demo)`)
      continue
    }
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

// The opening page: the two ways in, the header's GitHub mark, and every item running in the showcase at the height it reported.
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
    // The header links the repository through GitHub's mark alone: a link named GitHub with no visible text, big enough to press.
    const github = page.locator(".site-header nav a.github")
    if ((await github.count()) !== 1) failures.push(`opening: ${await github.count()} GitHub links in the header, not one`)
    else {
      if ((await github.getAttribute("href")) !== "https://github.com/tradecn/ui") failures.push(`opening: the GitHub mark links ${await github.getAttribute("href")}`)
      if (!(await page.getByRole("link", { name: "GitHub", exact: true }).count())) failures.push("opening: the GitHub mark has no accessible name")
      if ((await github.innerText()).trim() !== "") failures.push(`opening: the GitHub link shows text "${await github.innerText()}"`)
      const box = await github.boundingBox()
      if (!box || box.width < 24 || box.height < 24) failures.push(`opening: the GitHub mark is ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "not"} visible`)
      const mark = await github.locator("svg").boundingBox()
      if (!mark || mark.width < 14) failures.push("opening: the GitHub mark's svg has no size")
    }
    const frames = page.locator(".showcase iframe[data-preview]")
    if ((await frames.count()) !== itemPreviews.length) failures.push(`opening: ${await frames.count()} items in the showcase, not ${itemPreviews.length}`)
    // Every frame takes its demo's height, including the ones far below the fold; a demo is taller than 40px.
    await page.waitForFunction(() => [...document.querySelectorAll(".showcase iframe[data-preview]")].every((el) => parseFloat((el as HTMLIFrameElement).style.height || "0") > 40), undefined, { timeout: 30_000 })
    for (const item of itemPreviews) {
      const card = page.locator(`.showcase .card[data-preview='${item}']`)
      if (!(await card.locator(`a[href='/docs/${item}/']`).count())) failures.push(`opening: the ${item} card does not link its page`)
    }
    const heights = await Promise.all(itemPreviews.map((item) => frameHeight(page, item)))
    console.log(`ok  opening page: ${itemPreviews.length} items running, ${Math.round(Math.min(...heights))}px to ${Math.round(Math.max(...heights))}px`)
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
    await page.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    const kept = await page.locator("#installation-command .command pre:visible code").innerText()
    if (!kept.startsWith("pnpm dlx ")) failures.push(`${itemPreviews[0]}: shows "${kept}" after pnpm was picked on the Installation page`)
    const tab = await page.locator("#installation-command .command [role='tab'][aria-selected='true']").innerText()
    if (tab !== "pnpm") failures.push(`${itemPreviews[0]}: the ${tab} tab is selected after pnpm was picked on the Installation page`)
    console.log("ok  installation page: the install blocks, their copy buttons, and the package manager choice")
  } catch (error) {
    failures.push(`installation: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The Components and Changelog pages answer; the Components index links every component's page and no hook,
// utility, or theme; the sidebar groups the pages by kind the way the search index says.
{
  const page = await context.newPage()
  watch(page, "docs")
  try {
    const index = await page.request.get(`${base}/${SEARCH_INDEX}`)
    const groupOf = new Map(((await index.json()) as SearchPage[]).map((entry) => [entry.path, entry.group]))
    const groups = [...new Set(groupOf.values())]
    if (!groups.includes("Components") || groups.length < 3) failures.push(`docs: the index groups the pages as ${groups.join(", ")}`)
    await page.goto(`${base}/docs/components/`, { waitUntil: "load" })
    for (const item of items) {
      const card = await page.locator(`.cards a.card[href='/docs/${item}/']`).count()
      const group = groupOf.get(`/docs/${item}/`)
      if (group === "Components" && !card) failures.push(`components: no card for ${item}`)
      if (group !== "Components" && card) failures.push(`components: a card for ${item}, which is in ${group}`)
    }
    const headings = await page.locator(".sidebar h2").evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    if (headings.join(",") !== groups.join(",")) failures.push(`docs: the sidebar is grouped as ${headings.join(", ")}, the index as ${groups.join(", ")}`)
    for (const item of items) {
      const heading = await page.locator(`.sidebar ul:has(a[href='/docs/${item}/'])`).locator("xpath=preceding-sibling::h2[1]").textContent()
      if (heading !== groupOf.get(`/docs/${item}/`)) failures.push(`docs: ${item} is listed under ${heading}, the index says ${groupOf.get(`/docs/${item}/`)}`)
    }
    const changelog = await page.goto(`${base}/docs/changelog/`, { waitUntil: "load" })
    if (!changelog?.ok()) failures.push(`changelog: /docs/changelog/ answered ${changelog?.status()}`)
    if (!(await page.locator("article h1", { hasText: "Changelog" }).count())) failures.push("changelog: no Changelog title")
    if (!(await page.locator("article h2").count())) failures.push("changelog: no release on the page")
    const intro = await page.goto(`${base}/docs/`, { waitUntil: "load" })
    if (!intro?.ok()) failures.push(`docs: /docs/ answered ${intro?.status()}`)
    if (!(await page.locator(".sidebar a[href='/docs/'][aria-current='page']").count())) failures.push("docs: /docs/ is not the Introduction in the sidebar")
    console.log(`ok  components, changelog, and introduction pages; the sidebar groups ${groups.join(", ")}`)
  } catch (error) {
    failures.push(`docs: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The search: the header's button and mod+k open a dialog that lists every page until a query narrows
// it, ranks a heading that matches above text that does, goes to the hit on Enter, and says when
// nothing matches. A key pressed inside a preview iframe stays there: the command-palette demo's mod+k
// opens the demo's palette, not the page's search, and the page's opens nothing in the demo.
{
  const page = await context.newPage()
  watch(page, "search")
  const dialog = page.locator("dialog.search")
  const options = dialog.locator("[role='option']")
  const selected = dialog.locator("[role='option'][aria-selected='true']")
  const key = "ControlOrMeta+k"
  try {
    const index = await page.request.get(`${base}/${SEARCH_INDEX}`)
    if (!index.ok()) failures.push(`search: /${SEARCH_INDEX} answered ${index.status()}`)
    const pages = (await index.json()) as SearchPage[]
    if (pages.length < items.length + 5) failures.push(`search: the index has ${pages.length} pages for ${items.length} items and the site's own pages`)
    await page.goto(`${base}/`, { waitUntil: "load" })
    const button = page.locator(".site-header .search-button")
    if (!(await button.isVisible())) failures.push("search: no search button in the header")
    const label = await button.locator("kbd").innerText()
    if (label !== (process.platform === "darwin" ? "⌘K" : "Ctrl K")) failures.push(`search: the button's key reads "${label}" on ${process.platform}`)
    if (await dialog.evaluate((el) => (el as HTMLDialogElement).open)) failures.push("search: the dialog is open before anything opened it")
    await button.click()
    await options.first().waitFor({ timeout: 10_000 })
    if (!(await dialog.evaluate((el) => (el as HTMLDialogElement).open))) failures.push("search: the button did not open the dialog")
    if (!(await page.evaluate(() => document.activeElement === document.querySelector("dialog.search input")))) failures.push("search: the input is not focused when the dialog opens")
    // An empty query lists every page in nav order, grouped the way the sidebar is.
    if ((await options.count()) !== pages.length) failures.push(`search: ${await options.count()} options for an empty query, not one per page (${pages.length})`)
    const listed = await options.evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href")))
    if (listed.join(",") !== pages.map((entry) => entry.path).join(",")) failures.push(`search: an empty query lists ${listed.slice(0, 3).join(", ")}…, not the pages in nav order`)
    const groups = await dialog.locator(".search-page").evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    const expected = [...new Set(pages.map((entry) => entry.group))]
    if (groups.join(",") !== expected.join(",")) failures.push(`search: an empty query is grouped as ${groups.join(", ")}, not ${expected.join(", ")}`)
    if (!expected.includes("Hooks") || !expected.includes("Utilities")) failures.push(`search: the index has no Hooks or Utilities group (${expected.join(", ")})`)
    // A query groups its hits by page, the page named over them.
    await page.keyboard.type("flash")
    await page.waitForFunction(() => document.querySelector("dialog.search .search-page")?.textContent?.startsWith("flash-cell"), undefined, { timeout: 5_000 })
    await page.fill("dialog.search input", "")
    // Text that is on one item's page finds that page's heading.
    await page.keyboard.type("32nds")
    await page.waitForFunction(() => document.querySelector("dialog.search [role='option'][href='/docs/format/#prices']"), undefined, { timeout: 5_000 })
    if (!(await dialog.locator("mark", { hasText: "32nds" }).count())) failures.push("search: the matched word is not marked in the results")
    // A heading that matches ranks above text that does, and Enter goes to it.
    await page.fill("dialog.search input", "recents")
    await page.waitForFunction(() => document.querySelector("dialog.search [role='option'][aria-selected='true']")?.getAttribute("href") === "/docs/command-palette/#recents", undefined, { timeout: 5_000 })
    const activedescendant = await page.locator("dialog.search input").getAttribute("aria-activedescendant")
    if (activedescendant !== (await selected.getAttribute("id"))) failures.push(`search: aria-activedescendant is ${activedescendant}, not the selected option`)
    await page.keyboard.press("Enter")
    await page.waitForURL(`${base}/docs/command-palette/#recents`, { timeout: 10_000 })
    await page.waitForLoadState("load")
    const heading = page.locator("h3#recents")
    const top = await heading.evaluate((el) => el.getBoundingClientRect().top)
    if (top < 0 || top > 200) failures.push(`search: after Enter the Recents heading sits at ${Math.round(top)}px, not under the header`)
    // mod+k opens it from the page, toggles it closed, and the arrow keys move the selection.
    await page.locator("article h1").click()
    await page.keyboard.press(key)
    await options.first().waitFor({ timeout: 10_000 })
    await page.keyboard.type("hotkey")
    await page.waitForFunction(() => document.querySelectorAll("dialog.search [role='option']").length > 1, undefined, { timeout: 5_000 })
    const first = await selected.getAttribute("href")
    await page.keyboard.press("ArrowDown")
    if ((await selected.getAttribute("href")) === first) failures.push("search: ArrowDown did not move the selection")
    await page.keyboard.press("ArrowUp")
    if ((await selected.getAttribute("href")) !== first) failures.push("search: ArrowUp did not move the selection back")
    await page.fill("dialog.search input", "zzqqxxjj")
    const note = dialog.locator(".search-note")
    await note.waitFor({ timeout: 5_000 })
    if ((await note.innerText()) !== "No results for “zzqqxxjj”.") failures.push(`search: an empty result reads "${await note.innerText()}"`)
    await page.keyboard.press(key)
    if (await dialog.evaluate((el) => (el as HTMLDialogElement).open)) failures.push("search: mod+k did not close the open dialog")
    await page.keyboard.press(key)
    if (!(await dialog.evaluate((el) => (el as HTMLDialogElement).open))) failures.push("search: mod+k did not reopen the dialog")
    if ((await page.locator("dialog.search input").inputValue()) !== "") failures.push("search: the query was kept across a close and reopen")
    await page.keyboard.press("Escape")
    if (await dialog.evaluate((el) => (el as HTMLDialogElement).open)) failures.push("search: Escape did not close the dialog")
    // Inside the preview, mod+k is the demo's: its palette opens and the page's search does not.
    if (items.includes("command-palette")) {
      const frame = page.frameLocator(".preview[data-preview='command-palette'] iframe")
      await frame.locator("#root[data-state='ready']").waitFor({ timeout: 15_000 })
      await frame.locator("body").click({ position: { x: 8, y: 8 } })
      await page.keyboard.press(key)
      await frame.locator("[role='dialog']").waitFor({ timeout: 5_000 })
      if (await dialog.evaluate((el) => (el as HTMLDialogElement).open)) failures.push("search: mod+k inside the command-palette demo opened the page's search")
      await page.keyboard.press("Escape")
      await frame.locator("[role='dialog']").waitFor({ state: "detached", timeout: 5_000 })
      // And from the page, mod+k is the search's: nothing opens in the demo.
      await page.locator("article h1").click()
      await page.keyboard.press(key)
      await options.first().waitFor({ timeout: 10_000 })
      if (await frame.locator("[role='dialog']").count()) failures.push("search: the page's mod+k opened the demo's palette")
      await page.keyboard.press("Escape")
    }
    console.log(`ok  search: ${pages.length} pages indexed, the button, mod+k, a heading hit, Enter, and the preview kept its own keys`)
  } catch (error) {
    failures.push(`search: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// Light and dark. With no choice made a page follows the system, and so do the previews on it and the 404 page,
// which has no script. The header's button makes a choice: the page and every preview on it switch at once and
// wear one background, the next page opens in it, another tab hears it, the system no longer decides, and a
// second press goes back. A theme's own preview wears that theme's own sides; the site theme's preview wears what the page does.
{
  const page = await context.newPage()
  watch(page, "mode")
  const button = page.locator(".site-header .mode-toggle")
  const modeOf = (p: Page) => p.evaluate(() => [...document.documentElement.classList].filter((name) => name === "light" || name === "dark").join(",") || "none")
  const backgroundOf = (p: Page) => p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  const stored = (p: Page) => p.evaluate(() => localStorage.getItem("tradecn-theme"))
  const inMode = (p: Page, mode: string) => p.waitForFunction((name) => document.documentElement.classList.contains(name), mode, { timeout: 5_000 })
  /** Each preview frame on the page, as the frame sees itself: its item, its mode class, its body's background, and its own --background resolved the same way. */
  const frames = (p: Page) =>
    p.evaluate(() =>
      [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")].map((el) => {
        // A frame caught mid-navigation has a document with no root or no body yet; it reads as nothing rather than throwing.
        const doc = el.contentDocument
        let own = ""
        if (doc?.body) {
          const probe = doc.createElement("i")
          probe.style.backgroundColor = "var(--background)"
          doc.body.append(probe)
          own = getComputedStyle(probe).backgroundColor
          probe.remove()
        }
        return { item: el.dataset.preview ?? "", mode: doc?.documentElement?.className ?? "", background: doc?.body ? getComputedStyle(doc.body).backgroundColor : "", own }
      }),
    )
  // Polls until every frame wears the mode. A frame mid-navigation has no root yet and counts as not there, so the wait keeps polling instead of throwing.
  const framesIn = (p: Page, mode: string) => p.waitForFunction((name) => [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")].every((el) => el.contentDocument?.documentElement?.classList.contains(name) ?? false), mode, { timeout: 10_000 })
  try {
    const index = await page.request.get(`${base}/${SEARCH_INDEX}`)
    const themes = new Set(((await index.json()) as SearchPage[]).filter((entry) => entry.group === "Themes").map((entry) => entry.path.split("/")[2]))
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto(`${base}/`, { waitUntil: "load" })
    if (!(await button.isVisible())) failures.push("mode: no mode button in the header")
    if ((await modeOf(page)) !== "light") failures.push(`mode: the page is ${await modeOf(page)} under a light system with no choice made`)
    if ((await stored(page)) !== null) failures.push(`mode: a choice (${await stored(page)}) is stored before any was made`)
    if ((await button.getAttribute("aria-label")) !== "Switch to dark mode") failures.push(`mode: in light the button reads "${await button.getAttribute("aria-label")}"`)
    const light = await backgroundOf(page)
    await page.emulateMedia({ colorScheme: "dark" })
    await inMode(page, "dark")
    const dark = await backgroundOf(page)
    if (light === dark) failures.push(`mode: the background is ${light} whichever the system says`)
    await page.emulateMedia({ colorScheme: "light" })
    await inMode(page, "light")
    // Every preview is up and follows the system too.
    await page.waitForFunction(() => [...document.querySelectorAll(".showcase iframe[data-preview]")].every((el) => parseFloat((el as HTMLIFrameElement).style.height || "0") > 40), undefined, { timeout: 30_000 })
    await framesIn(page, "light")
    // A theme's preview wears that theme's own light side, which differs from the page's unless the theme is the site's; every other preview wears the page's.
    for (const frame of await frames(page)) {
      if (!themes.has(frame.item) && frame.background !== light) failures.push(`mode: in light the ${frame.item} preview's background is ${frame.background}, the page's ${light}`)
      if (themes.has(frame.item) && frame.background !== frame.own) failures.push(`mode: in light the ${frame.item} preview's background is ${frame.background}, not the theme's own light side (${frame.own})`)
      if (themes.has(frame.item) && frame.item !== THEME_ITEM && frame.background === light) failures.push(`mode: in light the ${frame.item} preview wears the page's background (${light}), not its own`)
    }
    // The button chooses dark: the page, the store, the label, and every preview at once, through the storage event.
    await button.click()
    await inMode(page, "dark")
    if ((await backgroundOf(page)) !== dark) failures.push(`mode: after the button the background is ${await backgroundOf(page)}, not ${dark}`)
    if ((await stored(page)) !== "dark") failures.push(`mode: the button stored ${await stored(page)}, not dark`)
    if ((await button.getAttribute("aria-label")) !== "Switch to light mode") failures.push(`mode: in dark the button reads "${await button.getAttribute("aria-label")}"`)
    await framesIn(page, "dark")
    for (const frame of await frames(page)) {
      if (!themes.has(frame.item) && frame.background !== dark) failures.push(`mode: in dark the ${frame.item} preview's background is ${frame.background}, the page's ${dark}`)
      if (themes.has(frame.item) && frame.background !== frame.own) failures.push(`mode: in dark the ${frame.item} preview's background is ${frame.background}, not the theme's own ${frame.own}`)
    }
    // The choice beats the system now, and another tab hears it.
    const other = await context.newPage()
    watch(other, "mode (other tab)")
    await other.emulateMedia({ colorScheme: "light" })
    await other.goto(`${base}/docs/`, { waitUntil: "load" })
    if ((await modeOf(other)) !== "dark") failures.push(`mode: another tab opened in ${await modeOf(other)} after dark was chosen under a light system`)
    await button.click()
    await inMode(page, "light")
    if ((await stored(page)) !== "light") failures.push(`mode: the second press stored ${await stored(page)}, not light`)
    if ((await backgroundOf(page)) !== light) failures.push(`mode: after the second press the background is ${await backgroundOf(page)}, not ${light}`)
    await inMode(other, "light")
    await other.close()
    await page.emulateMedia({ colorScheme: "dark" })
    await page.waitForFunction(() => matchMedia("(prefers-color-scheme: dark)").matches, undefined, { timeout: 5_000 })
    if ((await modeOf(page)) !== "light") failures.push(`mode: the system's dark overrode the reader's light`)
    // The next page opens in the choice, and its preview with it.
    await page.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    if ((await modeOf(page)) !== "light") failures.push(`mode: ${itemPreviews[0]} opened in ${await modeOf(page)} after light was chosen`)
    await page.locator(`.preview[data-preview='${itemPreviews[0]}'] iframe`).waitFor({ timeout: 15_000 })
    await framesIn(page, "light")
    // The 404 page has no script and no button; it follows the system. A 404 document logs its own status
    // as a console error, and that one line is expected here.
    await page.evaluate(() => localStorage.removeItem("tradecn-theme"))
    const lost = await context.newPage()
    lost.on("pageerror", (error) => failures.push(`mode: 404 page error: ${error.message}`))
    lost.on("console", (message) => {
      if (message.type() === "error" && !/status of 404/.test(message.text())) failures.push(`mode: 404 console error: ${message.text()}`)
    })
    await lost.emulateMedia({ colorScheme: "dark" })
    const missing = await lost.goto(`${base}/no-such-page/`, { waitUntil: "load" })
    if (missing?.status() !== 404) failures.push(`mode: /no-such-page/ answered ${missing?.status()}`)
    if (!(await lost.locator("h1", { hasText: "404" }).count())) failures.push("mode: /no-such-page/ is not the 404 page")
    if (await lost.locator(".mode-toggle, script").count()) failures.push("mode: the 404 page has a mode button or a script")
    if ((await backgroundOf(lost)) !== dark) failures.push(`mode: under a dark system the 404 page's background is ${await backgroundOf(lost)}, not ${dark}`)
    await lost.emulateMedia({ colorScheme: "light" })
    if ((await backgroundOf(lost)) !== light) failures.push(`mode: under a light system the 404 page's background is ${await backgroundOf(lost)}, not ${light}`)
    await lost.close()
    console.log(`ok  mode: the system, the button, ${itemPreviews.length} previews following, the next page, another tab, and the 404 page`)
  } catch (error) {
    failures.push(`mode: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The theme. The header's menu offers every theme the site carries, the site's own first and worn until a choice
// is made. Choosing another re-colors the page and every preview on it at once, the mode button still works under
// it, the next page opens in it, another tab hears it, a theme's own preview keeps its own theme, the 404 page (no
// script) stays in the site's, and choosing the site's own again goes back.
{
  const page = await context.newPage()
  watch(page, "theme")
  const select = page.locator(".site-header .theme-select")
  const button = page.locator(".site-header .mode-toggle")
  const themeOf = (p: Page) => p.evaluate(() => document.documentElement.dataset.theme ?? "none")
  const stored = (p: Page) => p.evaluate(() => localStorage.getItem("tradecn-palette"))
  const inTheme = (p: Page, theme: string) => p.waitForFunction((name) => document.documentElement.dataset.theme === name, theme, { timeout: 5_000 })
  const inMode = (p: Page, mode: string) => p.waitForFunction((name) => document.documentElement.classList.contains(name), mode, { timeout: 5_000 })
  /** The page's background, primary, and up, each resolved through a probe, so a production respelling never matters. */
  const colorsOf = (p: Page) =>
    p.evaluate(() => {
      const probe = document.createElement("i")
      document.body.append(probe)
      const read = (token: string) => {
        probe.style.backgroundColor = `var(--${token})`
        return getComputedStyle(probe).backgroundColor
      }
      const colors = { background: read("background"), primary: read("primary"), up: read("up") }
      probe.remove()
      return colors
    })
  /** Each preview frame on the page, as the frame sees itself: its item, its data-theme, and its primary and up resolved inside it. */
  const frames = (p: Page) =>
    p.evaluate(() =>
      [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")].map((el) => {
        // A frame caught mid-navigation has a document with no root or no body yet; it reads as nothing rather than throwing.
        const doc = el.contentDocument
        const colors = { primary: "", up: "" }
        if (doc?.body) {
          const probe = doc.createElement("i")
          doc.body.append(probe)
          for (const token of ["primary", "up"] as const) {
            probe.style.backgroundColor = `var(--${token})`
            colors[token] = getComputedStyle(probe).backgroundColor
          }
          probe.remove()
        }
        return { item: el.dataset.preview ?? "", theme: doc?.documentElement?.dataset.theme ?? "", ...colors }
      }),
    )
  // Polls until every frame carries the theme; a frame mid-navigation has no root yet and counts as not there.
  const framesIn = (p: Page, theme: string) => p.waitForFunction((name) => [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")].every((el) => el.contentDocument?.documentElement?.dataset.theme === name), theme, { timeout: 10_000 })
  const framesInMode = (p: Page, mode: string) => p.waitForFunction((name) => [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")].every((el) => el.contentDocument?.documentElement?.classList.contains(name) ?? false), mode, { timeout: 10_000 })
  try {
    const index = await page.request.get(`${base}/${SEARCH_INDEX}`)
    const themePages = new Set(((await index.json()) as SearchPage[]).filter((entry) => entry.group === "Themes").map((entry) => entry.path.split("/")[2]))
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto(`${base}/`, { waitUntil: "load" })
    if (!(await select.isVisible())) failures.push("theme: no theme menu in the header")
    // The menu sits left of the mode button and offers the themes the page declares, the site's own first: the themes with pages, whatever order the registry lists them in.
    const [menuBox, buttonBox] = [await select.boundingBox(), await button.boundingBox()]
    if (!menuBox || !buttonBox || menuBox.x + menuBox.width > buttonBox.x || Math.abs(menuBox.y + menuBox.height / 2 - (buttonBox.y + buttonBox.height / 2)) > 4) failures.push(`theme: the menu (${JSON.stringify(menuBox)}) is not left of the mode button (${JSON.stringify(buttonBox)}) on its line`)
    const themes = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    const declared = await page.evaluate(() => (document.querySelector('meta[name="tradecn-themes"]') as HTMLMetaElement | null)?.content.split(" ") ?? [])
    if (themes.join(" ") !== declared.join(" ")) failures.push(`theme: the menu offers ${themes.join(", ")}, the page declares ${declared.join(", ")}`)
    if (themes[0] !== THEME_ITEM) failures.push(`theme: the menu offers ${themes[0]} first, not ${THEME_ITEM}`)
    if ([...themes].sort().join() !== [...themePages].sort().join()) failures.push(`theme: the menu offers ${themes.join(", ")}, the site's theme pages are ${[...themePages].join(", ")}`)
    if ((await select.inputValue()) !== THEME_ITEM) failures.push(`theme: the menu shows ${await select.inputValue()} with no choice made`)
    if ((await themeOf(page)) !== THEME_ITEM) failures.push(`theme: the page wears ${await themeOf(page)} with no choice made`)
    if ((await stored(page)) !== null) failures.push(`theme: a choice (${await stored(page)}) is stored before any was made`)
    const home = await colorsOf(page)
    await page.waitForFunction(() => [...document.querySelectorAll(".showcase iframe[data-preview]")].every((el) => parseFloat((el as HTMLIFrameElement).style.height || "0") > 40), undefined, { timeout: 30_000 })
    await framesIn(page, THEME_ITEM)
    // Choose the second theme: the page, the store, the menu, and every preview at once, through the storage event.
    const other = themes[1]
    if (!other) throw new Error(`the menu offers ${themes.length} theme(s); nothing to switch to`)
    await select.selectOption(other)
    await inTheme(page, other)
    if ((await stored(page)) !== other) failures.push(`theme: the menu stored ${await stored(page)}, not ${other}`)
    if ((await select.inputValue()) !== other) failures.push(`theme: the menu shows ${await select.inputValue()} after choosing ${other}`)
    const chosen = await colorsOf(page)
    if (chosen.primary === home.primary && chosen.background === home.background) failures.push(`theme: the page looks the same (${chosen.primary} on ${chosen.background}) under ${other} as under ${THEME_ITEM}`)
    await framesIn(page, other)
    for (const frame of await frames(page)) {
      // A theme's own preview keeps its own theme; every other preview wears the page's.
      if (frame.item === other || !themePages.has(frame.item)) {
        if (frame.primary !== chosen.primary || frame.up !== chosen.up) failures.push(`theme: under ${other} the ${frame.item} preview's colors are ${frame.primary} and ${frame.up}, the page's ${chosen.primary} and ${chosen.up}`)
      } else if (frame.primary === chosen.primary && frame.up === chosen.up) failures.push(`theme: under ${other} the ${frame.item} preview wears the page's colors (${chosen.primary}, ${chosen.up}), not its own`)
    }
    // The mode still switches under the choice, and the previews follow both.
    await button.click()
    await inMode(page, "dark")
    const night = await colorsOf(page)
    if (night.background === chosen.background) failures.push(`theme: under ${other} the mode button left the background ${night.background}`)
    if ((await themeOf(page)) !== other) failures.push(`theme: the mode button changed the theme to ${await themeOf(page)}`)
    await framesInMode(page, "dark")
    for (const frame of await frames(page)) if (!themePages.has(frame.item) && frame.primary !== night.primary) failures.push(`theme: in dark under ${other} the ${frame.item} preview's primary is ${frame.primary}, the page's ${night.primary}`)
    await button.click()
    await inMode(page, "light")
    // Another tab opens in the choice with its menu showing it, and the next page too, with its preview.
    const tab = await context.newPage()
    watch(tab, "theme (other tab)")
    await tab.emulateMedia({ colorScheme: "light" })
    await tab.goto(`${base}/docs/`, { waitUntil: "load" })
    if ((await themeOf(tab)) !== other) failures.push(`theme: another tab opened in ${await themeOf(tab)} after ${other} was chosen`)
    const tabMenu = await tab.locator(".site-header .theme-select").inputValue()
    if (tabMenu !== other) failures.push(`theme: another tab's menu shows ${tabMenu}, not ${other}`)
    await tab.close()
    await page.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    if ((await themeOf(page)) !== other) failures.push(`theme: ${itemPreviews[0]} opened in ${await themeOf(page)} after ${other} was chosen`)
    await page.locator(`.preview[data-preview='${itemPreviews[0]}'] iframe`).waitFor({ timeout: 15_000 })
    await framesIn(page, other)
    // The 404 page has no script and no menu; it wears the site's own theme. Its status logs one console error, so it is not watched.
    const lost = await context.newPage()
    lost.on("pageerror", (error) => failures.push(`theme: 404 page error: ${error.message}`))
    await lost.emulateMedia({ colorScheme: "light" })
    await lost.goto(`${base}/no-such-page/`, { waitUntil: "load" })
    if (await lost.locator(".theme-select").count()) failures.push("theme: the 404 page has a theme menu")
    if ((await themeOf(lost)) !== "none") failures.push(`theme: the 404 page carries data-theme ${await themeOf(lost)}`)
    const lostColors = await colorsOf(lost)
    if (lostColors.primary !== home.primary) failures.push(`theme: the 404 page's primary is ${lostColors.primary}, not the site's own ${home.primary}`)
    await lost.close()
    // Choosing the site's own theme again goes back.
    await select.selectOption(THEME_ITEM)
    await inTheme(page, THEME_ITEM)
    if ((await stored(page)) !== THEME_ITEM) failures.push(`theme: choosing ${THEME_ITEM} stored ${await stored(page)}`)
    const back = await colorsOf(page)
    if (back.primary !== home.primary) failures.push(`theme: after choosing ${THEME_ITEM} again the primary is ${back.primary}, not ${home.primary}`)
    await page.evaluate(() => {
      localStorage.removeItem("tradecn-palette")
      localStorage.removeItem("tradecn-theme")
    })
    console.log(`ok  theme: ${themes.length} themes on the menu, ${other} on the page and its previews in both modes, the next page, another tab, the 404 page, and back`)
  } catch (error) {
    failures.push(`theme: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// The type: the pages are set in the theme's sans and their code in its mono, the two faces the typography tokens
// name, self-hosted under /fonts/ and loaded under the policy (a blocked font logs a console error, which the
// watcher above turns into a failure). Read after the fonts settle, from the faces the document loaded.
{
  const page = await context.newPage()
  watch(page, "fonts")
  try {
    await page.goto(`${base}/docs/installation/`, { waitUntil: "load" })
    const type = await page.evaluate(async () => {
      await document.fonts.ready
      const family = (el: Element | null) => (el ? getComputedStyle(el).fontFamily.replace(/["']/g, "") : "")
      const loaded = [...document.fonts].filter((face) => face.status === "loaded").map((face) => `${face.family.replace(/["']/g, "")} ${face.weight}`)
      return { html: family(document.documentElement), code: family(document.querySelector("article code")), heading: family(document.querySelector("article h1")), loaded }
    })
    const [sans, mono] = FONT_PACKAGES.map((entry) => entry.family)
    if (!type.html.startsWith(`${sans},`)) failures.push(`fonts: the page is set in "${type.html}", not ${sans} first`)
    if (!type.heading.startsWith(`${sans},`)) failures.push(`fonts: a heading is set in "${type.heading}", not ${sans} first`)
    if (!type.code.startsWith(`${mono},`)) failures.push(`fonts: code is set in "${type.code}", not ${mono} first`)
    for (const face of [`${sans} 400`, `${sans} 600`, `${mono} 400`]) if (!type.loaded.includes(face)) failures.push(`fonts: ${face} did not load; loaded: ${type.loaded.join(", ") || "none"}`)
    console.log(`ok  fonts: ${sans} and ${mono} load under the policy and set the page`)
  } catch (error) {
    failures.push(`fonts: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// No page scrolls sideways, at a desktop, a laptop under the on-page column's breakpoint, a tablet, and a phone:
// a wide table or code block scrolls inside its own box, never the page. The tokens table once did.
{
  const pages = ["/", "/docs/", "/docs/installation/", "/docs/components/", "/docs/theming/", "/docs/changelog/", "/docs/typography/", `/docs/${itemPreviews[0]}/`]
  const widths = [1280, 1024, 768, 390]
  const page = await context.newPage()
  watch(page, "overflow")
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of pages) {
        await page.goto(`${base}${route}`, { waitUntil: "load" })
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        if (over > 0) failures.push(`overflow: ${route} scrolls ${over}px sideways at ${width}px`)
      }
    }
    console.log(`ok  no page scrolls sideways at ${widths.join(", ")}px`)
  } catch (error) {
    failures.push(`overflow: ${firstLine(error)}`)
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
console.log(`\n${items.length} previews, the opening page, the docs pages, the search, both modes, and the themes checked at ${base}`)
