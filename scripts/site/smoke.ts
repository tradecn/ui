#!/usr/bin/env bun
// Open the built site in a browser and check every preview: the docs page frames it (an item's or a doc's own
// at the top of its page, a variant's in its own section of the page that places it), the embed page
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
// every theme the site carries, and choosing one re-colors the page and its previews the same way. Then
// the phone: the header folds into a Menu button, and the sidebar is the panel it opens over the page. Then the
// crawlers' files: robots.txt names the sitemap, every page the sitemap lists answers at its own canonical with
// no robots meta, and a preview and a missing page carry noindex and are not listed.
//   bun scripts/site/smoke.ts [--dist site/dist] [--base https://tradecn.dev] [--port 4174] [--headers site/headers.json]
// Without --base it serves --dist itself, with the index.html rewrite the CloudFront function does and
// the security headers the edge sends (--headers names another file, to prove a policy breaks the pages).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { chromium, type Page } from "@playwright/test"
import { compareTags, DESK_DEMO, FONT_PACKAGES, HEADERS_FILE, PREVIEW_PATH, ROBOTS_FILE, SEARCH_INDEX, SITE_SCRIPT, SITE_URL, SITEMAP_FILE, THEME_ITEM, VERSIONS_INDEX } from "./build"
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
      // A file has an extension that starts with a letter; a dot before a digit is a release, /v1.2.0, a route.
      else if (!/\.[a-z][a-z0-9]*$/i.test(pathname.slice(pathname.lastIndexOf("/")))) pathname += "/index.html"
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
const previews = args.base
  ? (process.env.SMOKE_ITEMS ?? "").split(",").filter(Boolean)
  : existsSync(previewDir)
    ? readdirSync(previewDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "assets")
        .map((entry) => entry.name)
        .sort()
    : []
// The desk is a preview with no docs page of its own: the opening page's block checks it, the loop below the rest.
const hasDesk = previews.includes(DESK_DEMO)
const items = previews.filter((name) => name !== DESK_DEMO)
if (!items.length) {
  console.error(args.base ? "set SMOKE_ITEMS=a,b,c to name the previews to check on a live site" : `${previewDir} has no previews; build the site first`)
  process.exit(1)
}

const failures: string[] = []
const browser = await chromium.launch()
// The copy buttons write the clipboard; the check reads it back.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] })

// The search index says which group each page is in, and which variant demos each page places. A preview whose
// page is under Get Started is a doc's own demo (the Typography page's), not an item's: it has no Installation and
// is not in the showcase. A variant's preview (countdown-compact) has no page of its own: its card stands on the
// page that places it, in a section of that page, and the index says which page that is.
const searchPages = (await (await context.request.get(`${base}/${SEARCH_INDEX}`)).json()) as SearchPage[]
const pageGroups = new Map<string, string>(searchPages.map((entry) => [entry.path, entry.group]))
const placedOn = new Map<string, string>(searchPages.flatMap((entry) => (entry.demos ?? []).map((demo) => [demo, entry.path] as const)))
type Kind = "item" | "doc" | "variant" | "stray"
const kindOf = (name: string): Kind => {
  const group = pageGroups.get(`/docs/${name}/`)
  if (group) return group === "Get Started" ? "doc" : "item"
  return placedOn.has(name) ? "variant" : "stray"
}
/** The page whose card frames a preview: its own page for an item or a doc, the page that places it for a variant. */
const pageOf = (name: string) => placedOn.get(name) ?? `/docs/${name}/`
const isItem = (name: string) => kindOf(name) === "item"
const itemPreviews = items.filter(isItem)
/** The previews with a page of their own, an item's or a doc's: what the sidebar, the Components index, and the search index list. */
const paged = items.filter((name) => kindOf(name) !== "variant")
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
  const kind = kindOf(item)
  try {
    if (kind === "stray") {
      failures.push(`${item}: no page frames this preview: it is no item's, no doc's own, and no page places it as a variant`)
      continue
    }
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
    // Controls sit at the top, above the component. An opted-in alignment group shares that row with demo controls.
    const bar = await page.evaluate(() => {
      const root = document.getElementById("root")!
      const controls = [...root.querySelectorAll(":scope > [data-demo-controls], :scope > [data-preview-controls]")]
      if (!controls.length) return null
      const frame = root.getBoundingClientRect()
      const boxes = controls.map((el) => el.getBoundingClientRect())
      const rest = [...root.children].filter((el) => !controls.includes(el)).map((el) => el.getBoundingClientRect().top)
      const bottom = Math.max(...boxes.map((box) => box.bottom))
      const shared = root.hasAttribute("data-align-controls")
      const fits = shared ? boxes.every((box) => box.left >= frame.left && box.right <= frame.right) && boxes.every((box, i) => boxes.every((other, j) => i === j || box.right <= other.left || box.left >= other.right)) : Math.abs(boxes[0]!.width - frame.width) <= 1
      return { top: boxes.every((box) => Math.abs(box.top - frame.top) <= 1), fits, below: rest.every((top) => top >= bottom) }
    })
    if (bar && (!bar.top || !bar.fits || !bar.below)) failures.push(`${item}: controls are not at the top, overlap or exceed the frame, or overlap the demo: ${JSON.stringify(bar)}`)
    // The frame's geometry under the centering contract: every root that is not the bar is the frame's content width or
    // centered in it, and a root that says w-full is the frame's width. A tag from before the contract is stretched
    // instead and promised nothing about its roots, so a republished old tag is left alone here (the #101 rule).
    const geometry = await page.evaluate(() => {
      const root = document.getElementById("root")!
      if (root.dataset.frame !== "card") return []
      const style = getComputedStyle(root)
      const padLeft = parseFloat(style.paddingLeft)
      const inner = Math.round(root.clientWidth - padLeft - parseFloat(style.paddingRight))
      const origin = root.getBoundingClientRect().left + padLeft
      return [...root.children]
        .filter((el) => !el.hasAttribute("data-demo-controls") && !el.hasAttribute("data-preview-controls"))
        .map((el) => {
          const box = el.getBoundingClientRect()
          const width = Math.round(box.width)
          const left = Math.round(box.left - origin)
          const slack = inner - width
          const full = Math.abs(slack) <= 1
          const centered = Math.abs(left - slack / 2) <= 2
          const wantsFull = el.classList.contains("w-full")
          const ok = full || (centered && !wantsFull)
          return ok ? "" : `${el.tagName.toLowerCase()}${wantsFull ? ".w-full" : ""} is ${width}px of the frame's ${inner}px at left ${left}px`
        })
        .filter(Boolean)
    })
    for (const problem of geometry) failures.push(`${item}: the demo root ${problem}, neither the frame's width nor centered in it`)
    if (await page.locator("#root[data-align-controls]").count()) {
      const group = page.getByRole("group", { name: "Preview alignment" })
      if ((await group.getByRole("button", { pressed: true }).getAttribute("aria-label")) !== "Align all previews center") failures.push(`${item}: preview alignment does not start centered`)
      for (const alignment of ["left", "right", "center"]) {
        await group.getByRole("button", { name: `Align all previews ${alignment}` }).click()
        const aligned = await page.evaluate((alignment) => {
          const root = document.getElementById("root")!, style = getComputedStyle(root), frame = root.getBoundingClientRect()
          const left = frame.left + parseFloat(style.paddingLeft), right = frame.right - parseFloat(style.paddingRight)
          const target = alignment === "left" ? left : alignment === "right" ? right : (left + right) / 2
          return [...root.children].filter((el) => !el.matches("[data-demo-controls], [data-preview-controls]")).every((el) => {
            const box = el.getBoundingClientRect()
            const edge = alignment === "left" ? box.left : alignment === "right" ? box.right : (box.left + box.right) / 2
            return Math.abs(edge - target) <= 1
          })
        }, alignment)
        if (!aligned || await group.getByRole("button", { pressed: true }).count() !== 1) failures.push(`${item}: ${alignment} preview alignment is incorrect`)
      }
    }
    // The page that frames it does, and the height message arrives: an item's or a doc's own page, or the page a variant is placed on.
    const where = pageOf(item)
    await page.goto(`${base}${where}`, { waitUntil: "load" })
    // One card per preview; a page with variants has several, so everything below is read from this one.
    const card = page.locator(`.preview[data-preview='${item}']`)
    const frame = card.locator("iframe")
    await frame.waitFor({ timeout: 15_000 })
    // A demo is taller than the root's padding alone; the height has to be the demo's, not the empty page's.
    await page.waitForFunction((name) => parseFloat((document.querySelector(`.preview[data-preview='${name}'] iframe`) as HTMLIFrameElement | null)?.style.height ?? "0") > 40, item, { timeout: 15_000 })
    const height = await frame.evaluate((el) => parseFloat((el as HTMLIFrameElement).style.height))
    // The page's own headings are down the right, Installation first on an item's page, and the arrows sit beside the title.
    if (kind === "item" && !(await page.locator(".toc a[href='#installation']").count())) failures.push(`${item}: the page lists no Installation under On this page`)
    if (kind === "doc" && (await page.locator("#installation").count())) failures.push(`${item}: a doc's page grew an Installation section`)
    if (!(await page.locator(".arrows a[rel='prev'], .arrows a[rel='next']").count())) failures.push(`${item}: no arrows beside the title`)
    // The source sits under the frame: collapsed and inert until View Code opens it, Collapse closes it again, and no link leads out of the card.
    const view = card.locator(".view-code")
    const body = card.locator(".preview-code-body")
    const inert = () => body.evaluate((el) => (el as HTMLElement).inert)
    if ((await view.innerText()) !== "View Code" || (await view.getAttribute("aria-expanded")) !== "false") failures.push(`${item}: the source's button reads "${await view.innerText()}" before it was pressed`)
    if (!(await inert())) failures.push(`${item}: the collapsed source is reachable`)
    if (await card.locator(".preview-code .copy").isVisible()) failures.push(`${item}: the copy button shows while the source is collapsed`)
    if (await card.locator("a.preview-open, [role='tab']").count()) failures.push(`${item}: the card still has tabs or a link out`)
    // Collapsed, the pre has no scrollbar of its own: the body's clip shows the first lines.
    const pre = card.locator(".preview-code pre")
    if ((await pre.evaluate((el) => getComputedStyle(el).overflowY)) !== "hidden") failures.push(`${item}: the collapsed source's pre scrolls on its own`)
    await view.click()
    if ((await view.getAttribute("aria-expanded")) !== "true" || (await view.innerText()) !== "Collapse") failures.push(`${item}: View Code did not open the source`)
    // The opened source holds the focus, and from there the Tab order reads on inside it: the pre first when its lines
    // overflow, since Chromium makes such a scroller keyboard-focusable, then the copy button, before anything outside.
    if (!(await page.evaluate(() => document.activeElement?.classList.contains("preview-code-body")))) failures.push(`${item}: the opened source did not take focus`)
    let reached = false
    for (let presses = 0; presses < 3 && !reached; presses++) {
      await page.keyboard.press("Tab")
      const at = await page.evaluate(() => {
        const el = document.activeElement
        return el?.classList.contains("copy") ? "copy" : el?.closest(".preview-code-body") ? "inside" : "outside"
      })
      if (at === "outside") break
      reached = at === "copy"
    }
    if (!reached) failures.push(`${item}: Tab from the opened source left it before reaching its copy button`)
    // Opened, the source is a scroller of shadcn's height, not the whole file down the page: the pre stops at 18rem
    // and, when its lines run past that, scrolls them inside itself.
    const scroller = await pre.evaluate((el) => {
      const style = getComputedStyle(el)
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const cap = parseFloat(style.maxHeight)
      const box = cap + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      return { cap: cap / rem, within: el.getBoundingClientRect().height <= box + 1, overflow: style.overflowY, more: el.scrollHeight > el.clientHeight }
    })
    if (scroller.cap !== 18 || !scroller.within) failures.push(`${item}: the opened source runs past its height (${JSON.stringify(scroller)})`)
    if (scroller.more && scroller.overflow !== "auto") failures.push(`${item}: the opened source has more lines than show and does not scroll`)
    const previewCode = card.locator(".preview-code pre code")
    if (!(await previewCode.isVisible())) failures.push(`${item}: View Code shows no code`)
    const code = await previewCode.innerText()
    if (code.includes("@/registry/")) failures.push(`${item}: the source shows a playground import, not the consumer's`)
    // The source's lines are numbered: the code is a grid with one row per line, each counted down the gutter. The
    // newlines between the spans are whitespace-only text, which a grid does not render as items, so no blank row
    // stands between two lines and none trails the last; the final empty span, a source's closing newline, is hidden.
    const grid = await previewCode.evaluate((el) => {
      const lines = [...el.querySelectorAll(":scope > .line")].filter((line) => getComputedStyle(line).display !== "none")
      return { display: getComputedStyle(el).display, rows: getComputedStyle(el).gridTemplateRows.split(" ").filter(Boolean).length, lines: lines.length, counted: lines.every((line) => getComputedStyle(line, "::before").counterIncrement === "line 1") }
    })
    if (grid.display !== "grid" || !grid.counted) failures.push(`${item}: the source's lines are not numbered`)
    if (grid.rows !== grid.lines) failures.push(`${item}: the source has ${grid.lines} lines on ${grid.rows} grid rows`)
    // Its copy button puts that source on the clipboard, without the trailing newline and without the numbers.
    const source = await previewCode.evaluate((el) => el.textContent ?? "")
    await card.locator(".preview-code .copy").click()
    if ((await clipboard(page)) !== source.trimEnd()) failures.push(`${item}: the source's copy button copied something else`)
    await view.click()
    if (!(await inert()) || (await view.innerText()) !== "View Code") failures.push(`${item}: Collapse did not close the source`)
    if (kind === "variant") {
      // A variant's card stands in a section of its own, after Usage and before API Reference, where the doc placed it.
      const placement = await page.evaluate((name) => {
        const own = document.querySelector(`.preview[data-preview='${name}']`)
        const usage = document.getElementById("usage")
        const api = document.getElementById("api-reference")
        if (!own || !usage || !api) return "on a page with no Usage or API Reference"
        const afterUsage = usage.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING
        const beforeApi = own.compareDocumentPosition(api) & Node.DOCUMENT_POSITION_FOLLOWING
        return afterUsage && beforeApi ? "" : "outside the stretch between Usage and API Reference"
      }, item)
      if (placement) failures.push(`${item}: the variant's card is ${placement}`)
      console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px (a variant on ${where})`)
      continue
    }
    if (kind === "doc") {
      console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px (a doc's demo)`)
      continue
    }
    // Installation: Command shows the pinned command under the page's package manager, npm until a reader picks
    // one; Manual opens on its tab and spells the install out with a consumer's imports, never the playground's.
    const command = await page.locator("#installation-command .command pre:visible code").innerText()
    if (!command.startsWith(`npx shadcn@latest add tradecn/ui/${item}#v`)) failures.push(`${item}: Installation's Command shows "${command}"`)
    // A command is one line under its tabs: no gutter.
    if (await page.locator("#installation-command .command pre:visible code").evaluate((el) => getComputedStyle(el).display === "grid")) failures.push(`${item}: Installation's Command numbers its line`)
    if (await page.locator("#installation-manual").isVisible()) failures.push(`${item}: Manual is showing before its tab was clicked`)
    await page.getByRole("tab", { name: "Manual" }).click()
    if (!(await page.locator("#installation-manual").isVisible())) failures.push(`${item}: Manual did not open on its tab`)
    if (await page.locator("#installation-command").isVisible()) failures.push(`${item}: Command is still showing beside Manual`)
    const manual = await page.locator("#installation-manual").innerText()
    if (manual.includes("@/registry/")) failures.push(`${item}: Manual shows a playground import, not the consumer's`)
    if (!(await page.locator("#installation-manual .code").count())) failures.push(`${item}: Manual has nothing to copy`)
    // Each file and the stylesheet under Manual is a block that opens, shadcn's shape: collapsed to its first lines
    // with its code inert and its copy button taking the whole of it; Expand, beside the copy button or over the fade,
    // shows the whole block, however long, and Collapse closes it again. A block short enough to show whole has
    // neither the clip nor the buttons, and its code is reachable. The commands are not blocks that open.
    const blocks = page.locator("#installation-manual .source")
    if (!(await blocks.count())) failures.push(`${item}: Manual has no block that opens`)
    if (await page.locator("#installation-manual .source .command").count()) failures.push(`${item}: a command under Manual got an Expand`)
    for (let i = 0; i < (await blocks.count()); i++) {
      const block = blocks.nth(i)
      const nth = `Manual's block ${i + 1}`
      const sourcePre = block.locator("pre")
      const expand = block.locator(".expand")
      const foot = block.locator(".expand-foot")
      const state = () =>
        sourcePre.evaluate((el) => {
          const style = getComputedStyle(el)
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
          return { inert: (el as HTMLElement).inert, clipped: el.scrollHeight > el.clientHeight, overflow: style.overflowY, cap: parseFloat(style.maxHeight) / rem }
        })
      const before = await state()
      if (await block.evaluate((el) => el.hasAttribute("data-fits"))) {
        if (before.inert || before.clipped || (await expand.isVisible()) || (await foot.isVisible())) failures.push(`${item}: ${nth} shows whole yet is inert or offers Expand`)
        continue
      }
      if (!before.inert || !before.clipped || before.overflow !== "hidden" || before.cap !== 16) failures.push(`${item}: ${nth} is not collapsed to its first lines (${JSON.stringify(before)})`)
      if ((await expand.innerText()) !== "Expand" || (await expand.getAttribute("aria-expanded")) !== "false" || !(await foot.isVisible())) failures.push(`${item}: ${nth} lacks its Expand buttons`)
      if ((await foot.getAttribute("aria-hidden")) !== "true" || (await foot.getAttribute("tabindex")) !== "-1") failures.push(`${item}: the fade's Expand on ${nth} is in the Tab order or the accessibility tree`)
      if (i === 0) {
        // Collapsed, the copy button still takes the whole block.
        await block.locator(".copy").click()
        if ((await clipboard(page)) !== (await sourcePre.evaluate((el) => (el.textContent ?? "").trimEnd()))) failures.push(`${item}: ${nth}'s copy button copied less than the whole block while collapsed`)
      }
      // The first block opens from its fade, the rest from the button beside the copy button; the focus ends on that button either way.
      await (i === 0 ? foot : expand).click()
      const after = await state()
      if (after.inert || after.clipped || (await expand.innerText()) !== "Collapse" || (await expand.getAttribute("aria-expanded")) !== "true" || (await foot.isVisible())) failures.push(`${item}: Expand did not open ${nth} whole (${JSON.stringify(after)})`)
      if (!(await page.evaluate(() => document.activeElement?.classList.contains("expand")))) failures.push(`${item}: Expand on ${nth} left the focus elsewhere`)
      await expand.click()
      if (!(await state()).inert || (await expand.innerText()) !== "Expand") failures.push(`${item}: Collapse did not close ${nth}`)
    }
    console.log(`ok  ${item.padEnd(26)} ${Math.round(height)}px`)
  } catch (error) {
    failures.push(`${item}: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
}

// Alignment is one saved preference for every preview, including previews without their own selector.
if (items.includes("data-grid")) {
  const page = await context.newPage()
  const tab = await context.newPage()
  watch(page, "alignment")
  watch(tab, "alignment tab")
  try {
    await page.goto(`${base}/docs/data-grid/`, { waitUntil: "load" })
    for (const card of await page.locator(".preview").all()) await card.scrollIntoViewIfNeeded()
    const gridFrame = page.frameLocator('iframe[data-preview="data-grid"]')
    await gridFrame.getByRole("grid").waitFor()
    // Older builds have no selector; their centered frames still follow a preference saved on a newer page.
    if (await gridFrame.getByRole("group", { name: "Preview alignment" }).count()) {
      const allFollow = (value: string) => page.waitForFunction((value) => {
        const frames = [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-preview]")]
        return frames.every((frame) => {
          const doc = frame.contentDocument
          return doc?.documentElement.dataset.previewAlign === value && doc.querySelector(`[aria-label="Align all previews ${value}"][aria-pressed="true"]`)
        })
      }, value, { timeout: 10_000 })
      await gridFrame.getByRole("button", { name: "Align all previews left" }).focus()
      await page.keyboard.press("Space")
      await allFollow("left")
      if (await page.evaluate(() => localStorage.getItem("tradecn-preview-alignment")) !== "left") failures.push("alignment: the shared choice was not stored")

      // Resizing used to move both edges in the centered presentation. Left alignment keeps the origin fixed.
      const controlled = page.frameLocator('iframe[data-preview="data-grid-controlled"]')
      const grid = controlled.getByRole("grid")
      const before = await grid.evaluate((el) => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width }))
      await controlled.getByRole("separator", { name: "Resize Size" }).scrollIntoViewIfNeeded()
      const handle = (await controlled.getByRole("separator", { name: "Resize Size" }).boundingBox())!
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2)
      await page.mouse.up()
      const after = await grid.evaluate((el) => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width }))
      if (Math.abs(after.left - before.left) > 1 || after.width < before.width + 39) failures.push(`alignment: resizing moved the left edge or did not widen the column: ${JSON.stringify({ before, after })}`)
      await controlled.getByRole("button", { name: "Align all previews right" }).click()
      await allFollow("right")
      if (Math.abs(await grid.evaluate((el) => el.getBoundingClientRect().width) - after.width) > 1) failures.push("alignment: changing placement reset resized columns")

      await tab.goto(`${base}/docs/countdown/`, { waitUntil: "load" })
      const countdown = tab.frameLocator('iframe[data-preview="countdown"]')
      await countdown.locator('#root[data-state="ready"]').waitFor()
      if (await countdown.getByRole("group", { name: "Preview alignment" }).count()) failures.push("alignment: Countdown unexpectedly has alignment controls")
      await countdown.locator('html[data-preview-align="right"]').waitFor()
      const rightAligned = await countdown.locator("#root").evaluate((root) => {
        const demo = root.querySelector(":scope > :not([data-demo-controls])")!
        return Math.abs(demo.getBoundingClientRect().right - root.getBoundingClientRect().right + parseFloat(getComputedStyle(root).paddingRight)) <= 1
      })
      if (!rightAligned) failures.push("alignment: Countdown did not follow the saved placement")
      await page.reload({ waitUntil: "load" })
      for (const card of await page.locator(".preview").all()) await card.scrollIntoViewIfNeeded()
      await allFollow("right")
      // Another tab can clear or replace the setting; every mounted selector catches up.
      await tab.evaluate(() => localStorage.setItem("tradecn-preview-alignment", "left"))
      await allFollow("left")
      await tab.evaluate(() => localStorage.setItem("tradecn-preview-alignment", "invalid"))
      await allFollow("center")
      await gridFrame.getByRole("button", { name: "Align all previews left" }).click()
      await allFollow("left")
      await tab.evaluate(() => localStorage.removeItem("tradecn-preview-alignment"))
      await allFollow("center")
      console.log("ok  alignment: shared selectors, keyboard, fixed-edge resize, retained columns, reload, Countdown, another tab, and invalid/cleared storage")
    }
  } catch (error) {
    failures.push(`alignment: ${firstLine(error)}`)
  } finally {
    await page.evaluate(() => localStorage.removeItem("tradecn-preview-alignment")).catch(() => {})
    await page.close()
    await tab.close()
  }
}

// The opening page: the two ways in, the header's GitHub mark, and the desk running at the height it reported with every
// item the tag has linked under it; on a tag from before the desk, every item running in its own card instead.
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
    if (hasDesk) {
      // The desk: one frame, taller than any single demo, with the workspace and a dozen kinds of item mounted in it,
      // its source linked at the tag, and under it a link to the page of every item the tag has, themes aside.
      const frames = page.locator(".showcase.desk iframe[data-preview]")
      if ((await frames.count()) !== 1) failures.push(`opening: ${await frames.count()} frames in the desk, not one`)
      await page.waitForFunction((name) => parseFloat((document.querySelector(`.showcase.desk iframe[data-preview='${name}']`) as HTMLIFrameElement | null)?.style.height ?? "0") > 600, DESK_DEMO, { timeout: 30_000 })
      const desk = page.frameLocator(`.showcase.desk iframe[data-preview='${DESK_DEMO}']`)
      await desk.locator("[data-slot='tradecn-workspace']").waitFor({ timeout: 15_000 })
      const kinds = await desk.locator("[data-slot^='tradecn-']").evaluateAll((els) => new Set(els.map((el) => el.getAttribute("data-slot"))).size)
      if (kinds < 12) failures.push(`opening: the desk mounts ${kinds} kinds of item, fewer than 12`)
      if (!(await page.locator(`.showcase.desk a[href$='/playground/src/demos/${DESK_DEMO}.tsx']`).count())) failures.push("opening: the desk does not link its source")
      const linked = new Set(await page.locator(".desk-legend a").evaluateAll((els) => els.map((el) => el.getAttribute("href"))))
      for (const [path, group] of pageGroups) if (group !== "Get Started" && group !== "Themes" && !linked.has(path)) failures.push(`opening: the desk's legend does not link ${path}`)
      console.log(`ok  opening page: the desk, ${kinds} kinds of item on it, ${Math.round(await frameHeight(page, DESK_DEMO))}px, ${linked.size} items linked under it`)
    } else {
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
    }
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
    const entries = (await index.json()) as SearchPage[]
    const groupOf = new Map(entries.map((entry) => [entry.path, entry.group]))
    const labelOf = new Map(entries.map((entry) => [entry.path, entry.label]))
    const groups = [...new Set(groupOf.values())]
    if (!groups.includes("Components") || groups.length < 3) failures.push(`docs: the index groups the pages as ${groups.join(", ")}`)
    await page.goto(`${base}/docs/components/`, { waitUntil: "load" })
    for (const item of paged) {
      const link = page.locator(`.item-list a[href='/docs/${item}/']`)
      const count = await link.count()
      const group = groupOf.get(`/docs/${item}/`)
      if (group === "Components" && !count) failures.push(`components: no link for ${item}`)
      if (group !== "Components" && count) failures.push(`components: a link for ${item}, which is in ${group}`)
      // The list names a page as the sidebar does, by its title, never by its slug.
      if (count) {
        const text = await link.textContent()
        if (text !== labelOf.get(`/docs/${item}/`)) failures.push(`components: ${item} is listed as ${text}, its page is ${labelOf.get(`/docs/${item}/`)}`)
      }
    }
    // Names alone: no kind, no description, no code in the list.
    if (await page.locator(".item-list code, .item-list .kind, .item-list p").count()) failures.push("components: the list carries more than the names")
    // The docs groups alone: the sidebar also holds the phone menu's part, hidden here, with a heading of its own.
    const headings = await page.locator(".docs-nav h2").evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    if (headings.join(",") !== groups.join(",")) failures.push(`docs: the sidebar is grouped as ${headings.join(", ")}, the index as ${groups.join(", ")}`)
    for (const item of paged) {
      const heading = await page.locator(`.docs-nav ul:has(a[href='/docs/${item}/'])`).locator("xpath=preceding-sibling::h2[1]").textContent()
      if (heading !== groupOf.get(`/docs/${item}/`)) failures.push(`docs: ${item} is listed under ${heading}, the index says ${groupOf.get(`/docs/${item}/`)}`)
    }
    const changelog = await page.goto(`${base}/docs/changelog/`, { waitUntil: "load" })
    if (!changelog?.ok()) failures.push(`changelog: /docs/changelog/ answered ${changelog?.status()}`)
    if (!(await page.locator("article h1", { hasText: "Changelog" }).count())) failures.push("changelog: no Changelog title")
    if (!(await page.locator("article h2").count())) failures.push("changelog: no release on the page")
    const intro = await page.goto(`${base}/docs/`, { waitUntil: "load" })
    if (!intro?.ok()) failures.push(`docs: /docs/ answered ${intro?.status()}`)
    if (!(await page.locator(".docs-nav a[href='/docs/'][aria-current='page']").count())) failures.push("docs: /docs/ is not the Introduction in the sidebar")
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
    if (pages.length < paged.length + 5) failures.push(`search: the index has ${pages.length} pages for ${paged.length} previews with pages and the site's own pages`)
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
    await page.waitForFunction(() => document.querySelector("dialog.search .search-page")?.textContent?.startsWith("Flash Cell"), undefined, { timeout: 5_000 })
    await page.fill("dialog.search input", "")
    // Text that is on one item's page finds that page's heading.
    await page.keyboard.type("32nds")
    await page.waitForFunction(() => document.querySelector("dialog.search [role='option'][href='/docs/format/#prices']"), undefined, { timeout: 5_000 })
    if (!(await dialog.locator("mark", { hasText: "32nds" }).count())) failures.push("search: the matched word is not marked in the results")
    // An item's page answers to every name the index carries for it, and comes first for each: the name `shadcn add`
    // takes (`data-grid`), its own heading (`DataGrid` on main; `data-grid` at a tag whose doc was still headed by the
    // slug), and the name the sidebar shows (`Data Grid`). Read from the index, not assumed: the live pages are the
    // tag's docs, and a dispatch of a tag from before a heading changed has to pass its own check.
    const grid = pages.find((entry) => entry.path === "/docs/data-grid/")
    if (!grid) failures.push("search: the index has no page for data-grid")
    const gridNames = new Set([grid?.name, grid?.title, grid?.label].filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase()))
    for (const query of gridNames) {
      await page.fill("dialog.search input", query)
      await page.waitForFunction(() => document.querySelector("dialog.search .search-page")?.textContent?.startsWith("Data Grid"), undefined, { timeout: 5_000 }).catch(() => failures.push(`search: "${query}" does not put Data Grid first`))
    }
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

// The version menu. First among the header's links, before the search: every release with pages, from /versions.json
// at the root, newest first, this page's selected. A release's own tree lives under /vX.Y.Z/ with every path under
// it (its pages, its previews, its search); the root is the latest's. A pick goes to the same page under that
// release, the latest's at the root, or to its docs when the page is not there, which a HEAD that answers 404 finds
// out; Chromium logs that answer as a console error, and that one line is expected here.
{
  const page = await context.newPage()
  page.on("pageerror", (error) => failures.push(`versions: page error: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) failures.push(`versions: console error: ${message.text()}`)
  })
  const select = page.locator(".site-header .version-select")
  const versionOf = (p: Page) => p.evaluate(() => document.documentElement.dataset.version ?? "")
  const baseOf = (p: Page) => p.evaluate(() => document.documentElement.dataset.base ?? "")
  try {
    const listing = await page.request.get(`${base}/${VERSIONS_INDEX}`)
    if (!listing.ok()) failures.push(`versions: /${VERSIONS_INDEX} answered ${listing.status()}`)
    const { latest, versions } = (await listing.json()) as { latest: string; versions: string[] }
    if (!versions.length || versions[0] !== latest) failures.push(`versions: the list is ${versions.join(", ")} with ${latest} as the latest`)
    if ([...versions].sort(compareTags).join() !== versions.join()) failures.push(`versions: the list is not newest first: ${versions.join(", ")}`)
    await page.goto(`${base}/docs/`, { waitUntil: "load" })
    const current = await versionOf(page)
    if (current !== latest) failures.push(`versions: the root's pages are ${current}, the list's latest is ${latest}`)
    if ((await baseOf(page)) !== "") failures.push(`versions: the root's pages say their base is "${await baseOf(page)}"`)
    const first = await page.locator(".site-header nav.side > *").evaluateAll((els) => els.slice(0, 2).map((el) => el.className))
    if (first.join(",") !== "version-pick,search-button") failures.push(`versions: the header's links start ${first.join(", ")}, not the version menu then the search`)
    if (!(await select.isVisible())) failures.push("versions: no version menu in the header")
    // The header's menu; the phone menu's copy, hidden here, fills from the same list.
    await page.waitForFunction((count) => document.querySelectorAll(".site-header .version-select option").length === count, versions.length, { timeout: 5_000 })
    const options = await select.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
    if (options.join() !== versions.join()) failures.push(`versions: the menu lists ${options.join(", ")}, the list ${versions.join(", ")}`)
    if ((await select.inputValue()) !== current) failures.push(`versions: the menu shows ${await select.inputValue()} on ${current}'s pages`)
    // The latest release's own tree: the same page under /<tag>/, every path under it, the preview up, its search finding its own pages, canonical at the root.
    const tree = `/${current}`
    const item = itemPreviews[0]!
    const own = await page.goto(`${base}${tree}/docs/${item}/`, { waitUntil: "load" })
    if (!own?.ok()) failures.push(`versions: ${tree}/docs/${item}/ answered ${own?.status()}`)
    if ((await baseOf(page)) !== tree) failures.push(`versions: the tree's page says its base is "${await baseOf(page)}"`)
    if ((await versionOf(page)) !== current) failures.push(`versions: the tree's page is ${await versionOf(page)}'s`)
    if ((await select.inputValue()) !== current) failures.push(`versions: the tree's menu shows ${await select.inputValue()}`)
    const outside = await page.evaluate(
      (prefix) =>
        [...document.querySelectorAll("a[href^='/'], link[href^='/'], script[src^='/'], iframe[src^='/']")]
          .map((el) => el.getAttribute("href") ?? el.getAttribute("src") ?? "")
          .filter((path) => !path.startsWith(`${prefix}/`) && !path.startsWith("/r/")),
      tree,
    )
    if (outside.length) failures.push(`versions: ${tree}'s page reaches outside its tree: ${[...new Set(outside)].slice(0, 5).join(", ")}`)
    const canonical = await page.locator("link[rel='canonical']").getAttribute("href")
    if (canonical !== `https://tradecn.dev/docs/${item}/`) failures.push(`versions: the tree's page is canonical at ${canonical}, not the root's`)
    await page.waitForFunction((name) => parseFloat((document.querySelector(`.preview[data-preview='${name}'] iframe`) as HTMLIFrameElement | null)?.style.height ?? "0") > 40, item, { timeout: 15_000 })
    await page.locator(".site-header .search-button").click()
    const hit = page.locator("dialog.search [role='option']").first()
    await hit.waitFor({ timeout: 10_000 })
    if (!(await hit.getAttribute("href"))?.startsWith(`${tree}/docs/`)) failures.push(`versions: the tree's search links ${await hit.getAttribute("href")}, outside its tree`)
    await page.keyboard.press("Escape")
    // The tree's root answers with and without the slash: a dot before a digit is a release, not a file.
    for (const route of [`${tree}/`, tree]) {
      const answer = await page.request.get(`${base}${route}`)
      if (!answer.ok()) failures.push(`versions: ${route} answered ${answer.status()}`)
    }
    // Picking the latest from its own tree goes to the same page where it lives, at the root.
    await select.selectOption(latest)
    await page.waitForURL(`${base}/docs/${item}/`, { timeout: 10_000 })
    await page.waitForLoadState("load")
    // Picking an older release from the root goes under its tree: this page there, or its docs when the page came later.
    const older = versions.find((version) => version !== latest)
    if (older) {
      await select.selectOption(older)
      await page.waitForURL((url) => url.pathname.startsWith(`/${older}/docs/`), { timeout: 10_000 })
      await page.waitForLoadState("load")
      if ((await versionOf(page)) !== older) failures.push(`versions: after picking ${older} the page is ${await versionOf(page)}'s`)
      if ((await select.inputValue()) !== older) failures.push(`versions: after picking ${older} the menu shows ${await select.inputValue()}`)
    }
    console.log(`ok  versions: ${versions.length} release(s) on the menu${older ? `, ${older} reached from the root` : ""}, ${current}'s own tree with its preview and search, and the latest back at the root`)
  } catch (error) {
    failures.push(`versions: ${firstLine(error)}`)
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
    // The menu sits left of the mode button and offers the themes the page declares, the site's own first. Those are
    // main's themes, while the pages are the tag's, so an older tag may have theme pages the menu lacks; each still wears its own.
    const [menuBox, buttonBox] = [await select.boundingBox(), await button.boundingBox()]
    if (!menuBox || !buttonBox || menuBox.x + menuBox.width > buttonBox.x || Math.abs(menuBox.y + menuBox.height / 2 - (buttonBox.y + buttonBox.height / 2)) > 4) failures.push(`theme: the menu (${JSON.stringify(menuBox)}) is not left of the mode button (${JSON.stringify(buttonBox)}) on its line`)
    const themes = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    const declared = await page.evaluate(() => (document.querySelector('meta[name="tradecn-themes"]') as HTMLMetaElement | null)?.content.split(" ") ?? [])
    if (themes.join(" ") !== declared.join(" ")) failures.push(`theme: the menu offers ${themes.join(", ")}, the page declares ${declared.join(", ")}`)
    if (themes[0] !== THEME_ITEM) failures.push(`theme: the menu offers ${themes[0]} first, not ${THEME_ITEM}`)
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

// The phone. The header folds: the name and the sections give way to a Menu button, the version and theme menus
// leave the header, and the sidebar is the panel the button opens, over the page from under the header to the bottom
// of the screen, holding the two menus, Home and the sections, then the groups the wide sidebar shows, each name at
// a thumb's size. The page behind holds still; Escape closes it and hands focus back; a link closes it and goes. The
// opening page has the button and a panel of the menus, Home, and the sections alone. At a laptop's width none of
// this shows and the sidebar is in the page; without a script the sidebar is in the page on a phone too.
{
  const page = await context.newPage()
  watch(page, "menu")
  const toggle = page.locator(".site-header .menu-toggle")
  const panel = page.locator("#site-menu")
  const hidden = async (selector: string) => !(await page.locator(selector).isVisible())
  const expanded = () => toggle.getAttribute("aria-expanded")
  const headings = () => panel.locator("h2").evaluateAll((els) => els.map((el) => el.textContent ?? ""))
  const pageOverflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow)
  try {
    const index = await page.request.get(`${base}/${SEARCH_INDEX}`)
    const groups = [...new Set(((await index.json()) as SearchPage[]).map((entry) => entry.group))]
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    if (!(await toggle.isVisible())) failures.push("menu: no Menu button in the header at 390px")
    if ((await toggle.innerText()).trim() !== "Menu") failures.push(`menu: the button reads "${await toggle.innerText()}"`)
    for (const [what, selector] of [
      ["the name", ".site-header .name"],
      ["the sections", ".site-header nav[aria-label='Sections']"],
      ["the version menu", ".site-header .version-pick"],
      ["the theme menu", ".site-header .theme-pick"],
    ]) {
      if (!(await hidden(selector!))) failures.push(`menu: ${what} shows in the header at 390px`)
    }
    for (const selector of [".site-header .search-button", ".site-header a.github", ".site-header .mode-toggle"]) if (await hidden(selector)) failures.push(`menu: ${selector} is gone from the header at 390px`)
    // One row: the button, then the search, the GitHub mark, and the mode button.
    const header = await page.locator(".site-header").boundingBox()
    if (!header || header.height > 56) failures.push(`menu: the header is ${header ? Math.round(header.height) : "not"}px tall at 390px, more than one row`)
    if (!(await hidden("#site-menu"))) failures.push("menu: the sidebar shows before the button is pressed")
    if ((await expanded()) !== "false") failures.push(`menu: the button says aria-expanded=${await expanded()} while closed`)
    await toggle.click()
    if ((await expanded()) !== "true") failures.push("menu: the button does not say it is expanded")
    if (!(await panel.isVisible())) failures.push("menu: the panel did not open")
    // The panel covers the page from under the header to the bottom of the screen, edge to edge, and the page behind holds still.
    const box = await panel.boundingBox()
    if (!box || !header) failures.push("menu: the open panel has no box")
    else if (Math.abs(box.y - (header.y + header.height)) > 1 || Math.round(box.width) !== 390 || Math.abs(box.y + box.height - 844) > 1) {
      failures.push(`menu: the panel sits at y=${Math.round(box.y)}, ${Math.round(box.width)}x${Math.round(box.height)}, under a header ending at ${Math.round(header.y + header.height)} on an 844px screen`)
    }
    if ((await pageOverflow()) !== "hidden") failures.push(`menu: the page behind the open menu has overflow ${await pageOverflow()}`)
    // The version and theme menus lead, then Home and the sections, then the groups the wide sidebar shows, at a thumb's size.
    if (!(await panel.locator(".version-select").isVisible()) || !(await panel.locator(".theme-select").isVisible())) failures.push("menu: the version or theme menu is not in the panel")
    const links = await panel.locator(".menu-sections a").evaluateAll((els) => els.map((el) => `${el.textContent}=${el.getAttribute("href")}`))
    if (links.join(" ") !== "Home=/ Docs=/docs/ Components=/docs/components/ Changelog=/docs/changelog/ registry.json=/r/registry.json") failures.push(`menu: the panel opens with ${links.join(" ")}`)
    const grouped = await headings()
    if (grouped.join(",") !== ["Menu", ...groups].join(",")) failures.push(`menu: the panel is grouped as ${grouped.join(", ")}, not Menu then ${groups.join(", ")}`)
    const size = await panel.locator(".docs-nav li a").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    if (size < 18) failures.push(`menu: the panel's names are ${size}px`)
    // Escape closes it and hands focus back to the button; the page scrolls again.
    await page.keyboard.press("Escape")
    if (await panel.isVisible()) failures.push("menu: Escape did not close the panel")
    if ((await expanded()) !== "false") failures.push("menu: the button still says it is expanded after Escape")
    if (!(await toggle.evaluate((el) => el === document.activeElement))) failures.push("menu: focus did not return to the button after Escape")
    if ((await pageOverflow()) === "hidden") failures.push("menu: the page is still held after the menu closed")
    // A link closes it and goes.
    await toggle.click()
    await panel.locator(".docs-nav a[href='/docs/installation/']").click()
    await page.waitForURL(`${base}/docs/installation/`, { timeout: 10_000 })
    await page.waitForLoadState("load")
    if (await panel.isVisible()) failures.push("menu: the panel is open on the next page")
    if ((await expanded()) !== "false") failures.push("menu: the button says it is expanded on the next page")
    // The opening page has the button and a panel of the two menus, Home, and the sections alone.
    await page.goto(`${base}/`, { waitUntil: "load" })
    if (!(await toggle.isVisible())) failures.push("menu: no Menu button on the opening page at 390px")
    if (!(await hidden("#site-menu"))) failures.push("menu: the opening page's panel shows before the button is pressed")
    await toggle.click()
    if (!(await panel.isVisible())) failures.push("menu: the opening page's panel did not open")
    const home = await headings()
    if (home.join(",") !== "Menu") failures.push(`menu: the opening page's panel is grouped as ${home.join(", ")}, not Menu alone`)
    if (!(await panel.locator(".theme-select").isVisible()) || !(await panel.locator(".menu-sections a[href='/docs/']").isVisible())) failures.push("menu: the opening page's panel lacks the theme menu or the Docs link")
    await page.keyboard.press("Escape")
    // At a laptop's width the button is gone, the header shows everything, and the sidebar is in the page with the groups alone.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    if (await toggle.isVisible()) failures.push("menu: the Menu button shows at 1280px")
    for (const selector of [".site-header .name", ".site-header nav[aria-label='Sections']", ".site-header .version-select", ".site-header .theme-select"]) if (await hidden(selector)) failures.push(`menu: ${selector} is gone from the header at 1280px`)
    if (!(await page.locator("#site-menu .docs-nav").isVisible())) failures.push("menu: the sidebar is not in the page at 1280px")
    if (!(await hidden("#site-menu .menu-only"))) failures.push("menu: the phone menu's part shows in the sidebar at 1280px")
    console.log(`ok  menu: the header folds at 390px into a Menu button over a panel of the menus, Home, the sections, and ${groups.length} groups; nothing of it at 1280px`)
  } catch (error) {
    failures.push(`menu: ${firstLine(error)}`)
  } finally {
    await page.close()
  }
  // Without a script the button would open nothing, so it is not there, and the sidebar stays in the page, every group above the article.
  const still = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })
  const plain = await still.newPage()
  try {
    await plain.goto(`${base}/docs/${itemPreviews[0]}/`, { waitUntil: "load" })
    if (await plain.locator(".site-header .menu-toggle").isVisible()) failures.push("menu: the Menu button shows without a script")
    if (!(await plain.locator(".site-header .name").isVisible()) || !(await plain.locator(".site-header .version-select").isVisible())) failures.push("menu: the name or the version menu is gone from the header without a script")
    if (!(await plain.locator("#site-menu .docs-nav").isVisible())) failures.push("menu: the sidebar is not in the page without a script")
    if (await plain.locator("#site-menu .menu-only").isVisible()) failures.push("menu: the phone menu's part shows without a script")
    console.log("ok  menu: without a script the sidebar stays in the page")
  } catch (error) {
    failures.push(`menu (no script): ${firstLine(error)}`)
  } finally {
    await still.close()
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

// The crawlers' two files at the root. robots.txt names the sitemap, and every address the sitemap lists answers
// with a page that names that address as its canonical and carries no robots meta; the opening page, the docs
// index, and every page with a preview of its own are among them. A preview and a missing page carry noindex
// and are not listed, so a crawler that finds them through the frames leaves them out and indexes the pages.
{
  try {
    const robots = await context.request.get(`${base}/${ROBOTS_FILE}`)
    if (robots.status() !== 200) failures.push(`crawlers: /${ROBOTS_FILE} answered ${robots.status()}`)
    else if (!(await robots.text()).includes(`Sitemap: ${SITE_URL}/${SITEMAP_FILE}`)) failures.push(`crawlers: /${ROBOTS_FILE} does not name /${SITEMAP_FILE}`)
    const response = await context.request.get(`${base}/${SITEMAP_FILE}`)
    if (response.status() !== 200) failures.push(`crawlers: /${SITEMAP_FILE} answered ${response.status()}`)
    const locs = [...(await response.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]!)
    for (const route of ["/", "/docs/", ...paged.map((name) => `/docs/${name}/`)]) {
      if (!locs.includes(`${SITE_URL}${route}`)) failures.push(`crawlers: ${route} is not in the sitemap`)
    }
    for (const loc of locs) {
      if (!loc.startsWith(`${SITE_URL}/`)) {
        failures.push(`crawlers: ${loc} is not on ${SITE_URL}`)
        continue
      }
      const route = loc.slice(SITE_URL.length)
      const listed = await context.request.get(`${base}${route}`)
      const html = await listed.text()
      if (listed.status() !== 200) failures.push(`crawlers: ${route} answered ${listed.status()}`)
      if (!html.includes(`<link rel="canonical" href="${loc}">`)) failures.push(`crawlers: ${route} does not name ${loc} as its canonical`)
      if (html.includes('name="robots"')) failures.push(`crawlers: ${route} carries a robots meta`)
    }
    for (const route of [`/${PREVIEW_PATH}/${itemPreviews[0]}/`, "/no-such-page/"]) {
      const html = await (await context.request.get(`${base}${route}`)).text()
      if (!html.includes('<meta name="robots" content="noindex">')) failures.push(`crawlers: ${route} is not noindex`)
      if (locs.includes(`${SITE_URL}${route}`)) failures.push(`crawlers: ${route} is in the sitemap`)
    }
    console.log(`ok  crawlers: robots.txt names the sitemap, its ${locs.length} pages answer at their canonicals with no robots meta, a preview and a missing page are noindex and unlisted`)
  } catch (error) {
    failures.push(`crawlers: ${firstLine(error)}`)
  }
}

await browser.close()
server?.stop(true)
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`\n${items.length} previews, the opening page, the docs pages, the search, both modes, the themes, and the crawlers' files checked at ${base}`)
