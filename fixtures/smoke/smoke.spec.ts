import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"

// Every installed tradecn item renders, the page is error-free, and the tokens it declared exist.
test("tradecn items render in this consumer", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  // Report a crash as the exception it was, not as a missing element.
  expect(errors, "page errors on load").toEqual([])
  await expect(page.locator("main[data-smoke]")).toBeVisible()
  // Every scene shows its own item. Asked scene by scene and not as one count of slots on the page:
  // a preset wraps a grid, so its scene shows two, and a count can come out right while the wrong
  // scene is the empty one.
  const expected = Number(await page.locator("main[data-smoke]").getAttribute("data-scenes"))
  const scenes = await page.locator("main[data-smoke] > section[data-scene]").evaluateAll((els) => els.map((el) => el.getAttribute("data-scene") ?? ""))
  expect(scenes).toHaveLength(expected)
  for (const name of scenes) await expect(page.locator(`section[data-scene='${name}'] [data-slot='tradecn-${name}']`).first(), `the ${name} scene shows its item`).toBeVisible({ timeout: 10_000 })
  const tokens = (await page.locator("main[data-smoke]").getAttribute("data-tokens"))?.split(" ").filter(Boolean) ?? []
  for (const token of tokens) {
    const value = await page.evaluate((t) => getComputedStyle(document.documentElement).getPropertyValue(`--${t}`).trim(), token)
    expect(value, `--${token} is defined`).not.toBe("")
  }
  // A token that exists as a custom property proves the CLI wrote it, not that anything uses it. These
  // two hold only when the consumer's stylesheet has utility CSS for the installed files: the grid
  // keeps to the 200 px its scene gives it, and `bg-up` on a connected feed's dot paints a color.
  // Soft, so a page that lost its styles reports both.
  const grid = await page.locator("section[data-scene='data-grid'] [data-slot='tradecn-data-grid']").boundingBox()
  expect.soft(grid?.height, "the grid is clipped to its container").toBeLessThanOrEqual(200)
  const dot = await page.locator("[data-feed='md'] span[aria-hidden]").first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect.soft(dot, "bg-up resolves to a color").not.toBe("rgba(0, 0, 0, 0)")
  expect(errors).toEqual([])
})

// Contract rule 14: every number a tradecn item renders is set in lining, tabular figures, whatever font
// the consumer chose. Asked of the page as the browser drew it, not of the source: every element under a
// tradecn slot whose own text holds a digit, every input under one holding a number, and every node marked
// data-numeric. A bare `tabular-nums` from a shadcn built-in or a consumer class would show up here as
// "tabular-nums" alone, because Tailwind's utilities replace the whole property.
test("every number in a tradecn item is set in lining tabular figures", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await expect(page.locator("main[data-smoke]")).toBeVisible()
  const problems = await page.evaluate(() => {
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
  expect(problems, "contract rule 14: lining-nums tabular-nums on every numeric node").toEqual([])
})

// Real key events through the real listener: a chord from the page, then a panel key that only
// counts with focus inside its scope.
test("hotkeys reach their handlers", async ({ page }) => {
  await page.goto("/")
  const readout = page.locator("[data-slot='tradecn-use-hotkeys']")
  await expect(readout).toBeVisible()
  await page.keyboard.press("x")
  await expect(readout).toHaveAttribute("data-panel", "0")
  await page.keyboard.press("g")
  await expect(readout).toHaveAttribute("data-pending", "g")
  await page.keyboard.press("s")
  await expect(readout).toHaveAttribute("data-chords", "1")
  await expect(readout).toHaveAttribute("data-pending", "")
  await page.locator("[data-hotkeys-focus]").focus()
  await page.keyboard.press("x")
  await expect(readout).toHaveAttribute("data-panel", "1")
})

// The dialog is where the bases differ, so open it for real: its own hotkey, a shortcut rendered
// from the registry, Shift+Enter for the second action, then a symbol through the adapter.
test("the command palette opens, runs both actions, and finds a symbol", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const last = page.locator("[data-palette-last]")
  const palette = page.locator("[data-slot='tradecn-command-palette'][data-variant='palette']")
  await expect(palette).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+k")
  await expect(palette).toBeVisible()
  // The row's last key cap is its shortcut; the ones before it belong to the Shift+Enter hint.
  await expect(palette.locator("[data-row='action:ticket.new'] [data-slot='kbd']").last()).toHaveText("T")
  await page.keyboard.type("ticket")
  await expect(palette.locator("[data-row='action:ticket.new'] [data-secondary]")).toBeVisible()
  await page.keyboard.press("Shift+Enter")
  await expect(last).toHaveAttribute("data-palette-last", "ticket-sell")
  await expect(palette).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+k")
  await page.keyboard.type("zn")
  await expect(palette.locator("[data-row='symbol:ZN:CBOT']")).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(last).toHaveAttribute("data-palette-last", "symbol:ZN")
  await expect(palette).toHaveCount(0)
  // The inline variant: focus it with its own key, run the first row.
  await page.keyboard.press("/")
  await page.keyboard.type("blotter")
  await page.keyboard.press("Enter")
  await expect(last).toHaveAttribute("data-palette-last", "blotter")
  expect(errors).toEqual([])
})

// The symbol tag is the consumer's own input, so it is where the bases can differ. Type the instant
// the field appears, with no wait for focus. Then the two things the panel promises: the link
// carries the symbol, and focus comes back inside the panel so its keys still work.
test("a panel retypes its symbol, carries it through a link group, and keeps its keys", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  // Scoped to its scene: a workspace's panels are panels too.
  const panel = page.locator("section[data-scene='panel'] [data-slot='tradecn-panel']")
  const follower = page.locator("[data-panel-follower]")
  await expect(panel).toHaveAttribute("data-hotkey-scope", "panel:smoke-panel")
  await expect(follower).toHaveAttribute("data-panel-follower", "ZN")
  // The panel's own token, as a utility: the dot for group 1 paints `bg-link-1`.
  const dot = await panel.getByRole("button", { name: "Link group 1, change" }).evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(dot, "bg-link-1 resolves to a color").not.toBe("rgba(0, 0, 0, 0)")
  await panel.getByRole("button", { name: "Symbol ZN, change" }).click()
  await page.keyboard.type("es")
  await page.keyboard.press("Enter")
  await expect(follower).toHaveAttribute("data-panel-follower", "ES")
  const tag = panel.getByRole("button", { name: "Symbol ES, change" })
  await expect(tag).toBeFocused()
  await page.keyboard.press("k")
  await expect(panel).toHaveAttribute("data-panel-keys", "1")
  // Escape puts it back, and the letters typed into the field never reached the panel's key.
  await tag.click()
  await page.keyboard.type("kk")
  await page.keyboard.press("Escape")
  await expect(panel.getByRole("button", { name: "Symbol ES, change" })).toBeFocused()
  await expect(follower).toHaveAttribute("data-panel-follower", "ES")
  await expect(panel).toHaveAttribute("data-panel-keys", "1")
  // Leaving the group: the follower keeps what it has, the panel moves on alone.
  await panel.getByRole("button", { name: "Link group 1, change" }).click()
  await expect(panel.getByRole("button", { name: "Link group 2, change" })).toBeVisible()
  expect(errors).toEqual([])
})

// The scene gives the sparkline no size, so everything drawn here came through the shared
// ResizeObserver, which a test environment with no layout cannot exercise.
test("a sparkline measures its box, draws in its direction's color, and walks its readings", async ({ page }) => {
  await page.goto("/")
  const chart = page.locator("[data-slot='tradecn-sparkline']")
  await expect(chart.locator("svg")).toHaveAttribute("viewBox", "0 0 240 40")
  const line = chart.locator("path").last()
  // One subpath before the gap and one after it.
  expect((await line.getAttribute("d"))?.match(/M/g)).toHaveLength(2)
  await expect(chart).toHaveAttribute("data-direction", "up")
  const colors = await page.evaluate(() => {
    const path = document.querySelector("[data-slot='tradecn-sparkline'] path:last-of-type")!
    const probe = document.createElement("i")
    probe.style.color = "var(--up)"
    document.body.append(probe)
    const out = { stroke: getComputedStyle(path).stroke, up: getComputedStyle(probe).color }
    probe.remove()
    return out
  })
  expect(colors.stroke, "stroke-up resolves to the --up token").toBe(colors.up)
  await chart.focus()
  await expect(chart).toHaveAttribute("aria-valuetext", "t5 103")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  // Three steps back from t5 is t1: the gap at t2 is stepped over.
  await expect(chart).toHaveAttribute("aria-valuetext", "t1 101")
  await expect(chart.locator("[data-sparkline-readout]")).toHaveText("t1 101")
})

// A watchlist goes through three of the consumer's own components: their input, their button, and
// their context menu, which is the one the bases build differently.
test("a watchlist adds through the field, finds a symbol it already has, and removes three ways", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const list = page.locator("[data-slot='tradecn-watchlist']")
  const grid = list.getByRole("grid", { name: "Watchlist" })
  const row = (symbol: string) => list.locator(`[data-row-id='${symbol}']`)
  await expect(row("ZN")).toBeVisible()
  await expect(row("ZN")).toContainText("+0.25")
  const field = list.getByRole("textbox", { name: "Add symbol" })
  await field.click()
  await page.keyboard.type("cl")
  await page.keyboard.press("Enter")
  await expect(row("CL")).toBeVisible()
  await expect(field).toHaveValue("")
  await expect(field).toBeFocused()
  // Already there: nothing is added, the row is selected.
  await page.keyboard.type("zn")
  await page.keyboard.press("Enter")
  await expect(grid).toHaveAttribute("aria-rowcount", "4")
  await expect(row("ZN")).toHaveAttribute("aria-selected", "true")
  // One: the button on the row, which only shows on hover.
  await row("CL").hover()
  await row("CL").getByRole("button", { name: "Remove CL" }).click()
  await expect(row("CL")).toHaveCount(0)
  // Two: Delete, with the row in hand.
  await row("ES").click()
  await page.keyboard.press("Delete")
  await expect(row("ES")).toHaveCount(0)
  // Three: the consumer's context menu.
  await row("ZN").click({ button: "right" })
  await page.getByRole("menuitem", { name: "Remove ZN" }).click()
  await expect(row("ZN")).toHaveCount(0)
  await expect(grid).toHaveAttribute("aria-rowcount", "1")
  expect(errors).toEqual([])
})

// The blotter's selection goes through the consumer's checkbox, and its actions through their button
// and their context menu. Two orders allow a cancel and one is already filled.
test("a blotter offers an action only for the orders the server allows, and says how many", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='blotter']")
  const blotter = scene.locator("[data-slot='tradecn-blotter']")
  const row = (id: string) => blotter.locator(`[data-row-id='${id}']`)
  const action = blotter.locator("button[data-action='cancel']")
  await expect(row("o1")).toContainText("PartiallyFilled")
  await expect(action).toBeDisabled()
  await blotter.getByRole("button", { name: "New order" }).click()
  await expect(scene.locator("[data-blotter-new]")).toHaveAttribute("data-blotter-new", "1")
  // All three, through the consumer's checkbox. One of them is filled and does not allow a cancel.
  for (const id of ["o1", "o2", "o3"]) await row(id).getByRole("checkbox").click()
  await expect(action).toHaveText("Cancel 2 of 3")
  await action.click()
  await expect(row("o1")).toContainText("Cancelled")
  await expect(row("o2")).toContainText("Cancelled")
  // The filled order was left alone, and nothing allows a cancel any more.
  await expect(row("o3")).toContainText("Filled")
  await expect(action).toBeDisabled()
  // The menu has nothing to offer for a filled order, and says so.
  await row("o3").click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "Nothing to do here" })).toBeVisible()
  await page.keyboard.press("Escape")
  expect(errors).toEqual([])
})

// The first item with a third-party stylesheet in play, and a `css` block written into the consumer's
// own. So: the dock has geometry (its stylesheet arrived), the theme class landed and maps onto the
// consumer's tokens, a tab click aims the keyboard at that panel and only that panel, a change is
// saved and comes back after a reload, and a popout carries the keys and the theme class with it.
test("a workspace docks its panels, keeps their keys apart, saves, restores, and pops out", async ({ page, context }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='workspace']")
  const state = scene.locator("[data-ws-saves]")
  const workspace = scene.locator("[data-slot='tradecn-workspace']")
  const book = scene.locator("[data-ws-book='book-1']")
  const chart = scene.locator("[data-ws-chart='chart-1']")
  await expect(book).toBeVisible()
  await expect(chart).toBeVisible()
  await expect(state).toHaveAttribute("data-ws-restored", "no")
  // Geometry: the dock laid the two out side by side, which needs its stylesheet.
  const left = await book.boundingBox()
  const right = await chart.boundingBox()
  expect(left!.width, "the dock gave the book a width").toBeGreaterThan(200)
  expect(right!.x, "the chart is to the right of the book").toBeGreaterThan(left!.x + left!.width - 1)
  // The theme: our class on the dock, and the tab strip painted with the consumer's --muted.
  await expect(workspace.locator(".dockview-theme-tradecn")).toHaveCount(1)
  const strip = await page.evaluate(() => {
    const strip = document.querySelector("section[data-scene='workspace'] .dv-tabs-and-actions-container")!
    const probe = document.createElement("i")
    probe.style.backgroundColor = "var(--muted)"
    document.body.append(probe)
    const out = { strip: getComputedStyle(strip).backgroundColor, muted: getComputedStyle(probe).backgroundColor }
    probe.remove()
    return out
  })
  expect(strip.strip, "the tab strip is painted with --muted").toBe(strip.muted)
  expect(strip.strip).not.toBe("rgba(0, 0, 0, 0)")
  // Keys: clicking a tab puts the keyboard in that panel.
  await scene.locator("[data-workspace-tab='chart-1']").click()
  await page.keyboard.press("k")
  await expect(chart).toHaveAttribute("data-ws-keys", "1")
  await expect(book).toHaveAttribute("data-ws-keys", "0")
  await scene.locator("[data-workspace-tab='book-1']").click()
  await page.keyboard.press("k")
  await expect(book).toHaveAttribute("data-ws-keys", "1")
  await expect(chart).toHaveAttribute("data-ws-keys", "1")
  // A change is saved, and comes back. The new book joins the active group as a tab, so it is the one
  // showing and the first book is behind it: a group draws one panel at a time.
  const tabs = scene.locator("[data-workspace-tab]")
  const saves = Number(await state.getAttribute("data-ws-saves"))
  await scene.getByRole("button", { name: "add book" }).click()
  await expect(tabs).toHaveCount(3)
  // Named by its kind: the seed's `book-1` was an explicit id.
  await expect(scene.locator("[data-ws-book='ws-book-1']")).toBeVisible()
  await expect(book).toHaveCount(0)
  await expect.poll(async () => Number(await state.getAttribute("data-ws-saves"))).toBeGreaterThan(saves)
  await scene.locator("[data-workspace-tab='book-1']").click()
  await book.getByRole("button", { name: "to ES" }).click()
  await expect(book.locator("[data-ws-symbol]")).toHaveText("ES")
  // The save is debounced and adding the book may have saved twice, so a count can pass before the ES save
  // lands and a reload then restores the older layout, with the second book in front and ZN behind it.
  // Wait for the stored layout to carry ES instead.
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("tradecn-smoke-workspace") ?? "{}") as { panels?: Record<string, { state?: { symbol?: string } }> }).panels?.["book-1"]?.state?.symbol ?? null)).toBe("ES")
  await page.reload()
  await expect(state).toHaveAttribute("data-ws-restored", "yes")
  await expect(tabs).toHaveCount(3)
  // A group draws one panel at a time: bring the first book to the front before reading it.
  await scene.locator("[data-workspace-tab='book-1']").click()
  await expect(book.locator("[data-ws-symbol]")).toHaveText("ES")
  // Closing from the tab: the second book goes, the first stays.
  await scene.getByRole("button", { name: "Close Book" }).last().click()
  await expect(tabs).toHaveCount(2)
  await expect(book).toBeVisible()
  // A popout: the panel moves to the new window with its state, the theme class follows, and its key still counts.
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  const [popup] = await Promise.all([context.waitForEvent("page"), scene.getByRole("button", { name: "pop out book" }).click()])
  await popup.waitForLoadState()
  const outBook = popup.locator("[data-ws-book='book-1']")
  await expect(outBook).toBeVisible()
  await expect(outBook).toHaveAttribute("data-ws-location", "popout")
  await expect(outBook.locator("[data-ws-symbol]")).toHaveText("ES")
  await expect.poll(() => popup.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true)
  await outBook.click()
  await popup.keyboard.press("k")
  await expect(outBook).toHaveAttribute("data-ws-keys", "1")
  // As a person closes it: the dock hears about the window through beforeunload.
  await popup.close({ runBeforeUnload: true })
  await expect(scene.locator("[data-ws-book='book-1']")).toBeVisible()
  await expect(scene.locator("[data-ws-book='book-1']")).toHaveAttribute("data-ws-location", "grid")
  expect(errors).toEqual([])
})

// The first block, and seven of the consumer's components in one place. The price field goes
// through the consumer's input-group, the side through their button-group, the errors through their
// field. Then the two rules: buttons are what the server allowed, and the status is what it said.
test("a ticket types a price in 32nds, steps it, sends from a key, and shows only what the server allows", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='ticket']")
  const state = scene.locator("[data-ticket-sent]")
  const ticket = scene.getByRole("group", { name: "Order ticket ZN" })
  const price = ticket.getByLabel("Price", { exact: true })
  const quantity = ticket.getByLabel("Quantity")
  await expect(ticket).toBeVisible()
  // The notation, in and out, through the consumer's input-group.
  await price.click()
  await page.keyboard.type("99-16+")
  await quantity.click()
  await expect(price).toHaveValue("99-16+")
  await price.click()
  await page.keyboard.press("ArrowUp")
  await expect(price).toHaveValue("99-17")
  await page.keyboard.press("Shift+ArrowDown")
  await expect(price).toHaveValue("99-12")
  await ticket.getByRole("button", { name: "Price up one tick" }).click()
  await expect(price).toHaveValue("99-12+")
  // Not a price: said under the field, through the consumer's field.
  await price.fill("abc")
  await quantity.click()
  await expect(price).toHaveAttribute("aria-invalid", "true")
  await expect(ticket.getByText("Not a price in this instrument's notation.")).toBeVisible()
  // A reference price is one click.
  await ticket.getByRole("button", { name: /^Ask 99-16\+/ }).click()
  await expect(price).toHaveValue("99-16+")
  await expect(price).not.toHaveAttribute("aria-invalid", "true")
  // The side, through the consumer's button-group.
  await ticket.getByRole("button", { name: "Sell" }).click()
  await expect(ticket).toHaveAttribute("data-side", "sell")
  await ticket.getByRole("button", { name: "Buy" }).click()
  await expect(ticket).toHaveAttribute("data-side", "buy")
  // No quantity: the check stops it and says so. Then a quantity, and mod+enter from inside the field sends.
  await ticket.getByRole("button", { name: /^Send/ }).click()
  await expect(ticket.getByText("Enter a quantity above zero.")).toBeVisible()
  await expect(state).toHaveAttribute("data-ticket-sent", "[]")
  await quantity.click()
  await page.keyboard.type("5")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-ticket-sent")) ?? "[]")).toEqual([{ side: "buy", quantity: 5, price: 99.515625, type: "limit", tif: "day", account: null }])
  // The status is the scene's word for the server's, printed as is; the acknowledgement rings the box.
  await expect(ticket.locator("[data-ticket-status]")).toHaveText("Sent")
  await scene.getByRole("button", { name: "acknowledge" }).click()
  await expect(ticket.locator("[data-ticket-status]")).toHaveText("Acknowledged")
  await expect(ticket.locator("[data-direction='flat']")).toHaveCount(1)
  // The server allows nothing: no buttons, a line that says so, and the key does nothing.
  await scene.getByRole("button", { name: "close market" }).click()
  await expect(ticket.getByRole("button", { name: /^Send/ })).toHaveCount(0)
  await expect(ticket.getByText("Nothing can be done with this ticket right now.")).toBeVisible()
  await quantity.click()
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-ticket-sent")) ?? "[]").length).toBe(1)
  expect(errors).toEqual([])
})

// Four timers: one with time to spare, one in its last seconds that runs out during the test, one that
// was over before the page drew it, and one with the digits alone.
test("a countdown says how long is left, turns in the last seconds, and stops at zero", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='countdown']")
  await expect(scene.getByRole("timer")).toHaveCount(4)
  const long = scene.getByRole("timer", { name: "Long" })
  const soon = scene.getByRole("timer", { name: "Soon" })
  const over = scene.getByRole("timer", { name: "Over" })
  await expect(long).toHaveAttribute("data-tier", "plenty")
  await expect(long.locator("[data-countdown-digits]")).toHaveText(/^1:[2-3]\d$/)
  await expect(soon).toHaveAttribute("data-tier", "soon")
  await expect(over).toHaveAttribute("data-tier", "expired")
  await expect(over.locator("[data-countdown-digits]")).toHaveText("0:00")
  // The compact one has digits and no bar.
  const compact = scene.getByRole("timer", { name: "Compact" })
  await expect(compact.locator("span[aria-hidden]")).toHaveCount(0)
  await expect(long.locator("span[aria-hidden] > span")).toHaveCount(1)
  // The last seconds paint with the expiring token, through the consumer's utility CSS.
  const color = await soon.evaluate((el) => getComputedStyle(el).color)
  const plain = await long.evaluate((el) => getComputedStyle(el).color)
  expect(color).not.toBe(plain)
  // Then it runs out, and stays at zero.
  await expect(soon).toHaveAttribute("data-tier", "expired", { timeout: 8000 })
  await expect(soon.locator("[data-countdown-digits]")).toHaveText("0:00")
  await page.waitForTimeout(1100)
  await expect(soon.locator("[data-countdown-digits]")).toHaveText("0:00")
})

// A bill on discount: a decimal in, snapped to the step, stepped by it, and marked when it is not one.
test("a quote field reads a quote in the instrument's basis, snaps it, steps it, and marks what is not one", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='quote-field']")
  const field = scene.getByLabel("Discount", { exact: true })
  await field.click()
  await page.keyboard.type("4.2531")
  await expect(scene.locator("[data-quote-value]")).toHaveAttribute("data-quote-value", "4.253")
  await field.blur()
  await expect(field).toHaveValue("4.253")
  await field.click()
  await page.keyboard.press("ArrowUp")
  await expect(field).toHaveValue("4.254")
  await page.keyboard.press("Shift+ArrowDown")
  await expect(field).toHaveValue("4.244")
  await scene.getByRole("button", { name: "Discount up one tick" }).click()
  await expect(field).toHaveValue("4.245")
  await field.fill("4-16")
  await field.blur()
  await expect(field).toHaveAttribute("aria-invalid", "true")
  await expect(scene.getByText("Not a discount in this instrument's notation.")).toBeVisible()
  await field.fill("")
  await field.blur()
  await expect(field).not.toHaveAttribute("aria-invalid", "true")
  // Blank, so a step starts from the reference beside it.
  await field.click()
  await page.keyboard.press("ArrowDown")
  await expect(field).toHaveValue("4.249")
})

// A client buys, so the dealer offers: one field against the market's offer, a suggested level in one
// click, the check before a send, the send from a key, then the venue's words and nothing else.
test("an rfq ticket shows the inquiry, quotes against the market, sends from a key, and shows only what the venue allows", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='rfq-ticket']")
  const ticket = scene.getByRole("group", { name: "Inquiry Q-7" })
  const state = scene.locator("[data-rfq-sent]")
  await expect(ticket).toBeVisible()
  await expect(ticket.locator("[data-rfq-headline]")).toHaveText(/Client A\s*buys\s*5mm\s*T 4 1\/8 05\/15\/34/)
  await expect(ticket.getByRole("timer", { name: "Inquiry Q-7" })).toHaveAttribute("data-tier", "plenty")
  const offer = ticket.getByLabel("Offer", { exact: true })
  await expect(ticket.getByLabel("Bid", { exact: true })).toHaveCount(0)
  await expect(ticket.locator("[data-rfq-market-level='ask']")).toHaveText("99-16+")
  // A level typed against the market, measured in ticks.
  await offer.click()
  await page.keyboard.type("99-17")
  await expect(ticket.locator("[data-rfq-distance='ask']")).toHaveText("+1 vs market")
  // The suggested level, in one click.
  await ticket.locator("[data-rfq-suggested]").click()
  await expect(offer).toHaveValue("99-17+")
  await expect(ticket.locator("[data-rfq-distance='ask']")).toHaveText("+2 vs market")
  // A blank quote is stopped and said; then a level and mod+enter from inside the field sends.
  await offer.fill("")
  await ticket.getByRole("button", { name: /^Quote/ }).click()
  await expect(ticket.getByText("An offer is needed.")).toBeVisible()
  await expect(state).toHaveAttribute("data-rfq-sent", "[]")
  await offer.click()
  await page.keyboard.type("99-16+")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-rfq-sent")) ?? "[]")).toEqual([{ inquiryId: "Q-7", bid: null, ask: 99.515625 }])
  // The venue takes it: its word for the status, the quoted level, one ring on the box.
  await scene.getByRole("button", { name: "venue takes it" }).click()
  await expect(ticket.locator("[data-rfq-status]")).toHaveText("Quoted")
  await expect(ticket.locator("[data-rfq-quoted='ask']")).toHaveText("99-16+")
  await expect(ticket.locator("[data-direction='flat']")).toHaveCount(1)
  // The venue ends it: no buttons, a line that says so, a field that is not live, a key that does nothing.
  await scene.getByRole("button", { name: "venue ends it" }).click()
  await expect(ticket.getByRole("button", { name: /^Quote/ })).toHaveCount(0)
  await expect(ticket.getByText("Nothing can be done with this inquiry right now.")).toBeVisible()
  await expect(offer).toBeDisabled()
  await expect(ticket).toHaveAttribute("data-status", "Done away")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-rfq-sent")) ?? "[]").length).toBe(1)
  expect(errors).toEqual([])
})

// Three inquiries sorted by size with the biggest in the ticket; the venue ends it and the next takes
// its place; Enter picks one; the threshold hides the small auto-quoted one and leaves the others.
test("an rfq stack marks the active inquiry, moves on when the venue ends it, picks on Enter, and hides small auto quotes under the threshold", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='rfq-stack']")
  const stack = scene.locator("[data-slot='tradecn-rfq-stack']")
  const state = scene.locator("[data-rfq-active]")
  await expect(stack.locator("[data-row-id]")).toHaveCount(3)
  await expect(state).toHaveAttribute("data-rfq-active", "q2")
  await expect(stack.locator("[data-row-id='q2']")).toHaveAttribute("data-state", "active")
  await expect(stack.locator("[data-row-id='q1'] [role='timer']")).toHaveAttribute("data-tier", "plenty")
  await scene.getByRole("button", { name: "venue ends q2" }).click()
  await expect(state).toHaveAttribute("data-rfq-active", "q1")
  await expect(stack.locator("[data-row-id='q1']")).toHaveAttribute("data-state", "active")
  await expect(stack.locator("[data-row-id='q2']")).not.toHaveAttribute("data-state", "active")
  // Enter on the focused row asks for it.
  await stack.locator("[data-row-id='q3'] [role='gridcell']").first().click()
  await page.keyboard.press("Enter")
  await expect(state).toHaveAttribute("data-rfq-active", "q3")
  // The threshold hides the auto-quoted 2mm inquiry and leaves the ones a person answers.
  await stack.getByLabel("Hide auto under").fill("5")
  await expect(stack.locator("[data-row-id]")).toHaveCount(2)
  await expect(stack.locator("[data-row-id='q3']")).toHaveCount(0)
})

// The frames are real: within a second the window has some, the histogram has its bars and the budget
// line, the lane reads its store, and a readout of the consumer's prints as given.
test("a perf monitor counts real frames, draws the histogram against the budget, and reads its lane", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='perf-monitor']")
  const monitor = scene.getByRole("group", { name: "Frame health" })
  await expect(monitor).toBeVisible()
  await expect.poll(async () => Number(await monitor.getAttribute("data-frames")), { timeout: 5000 }).toBeGreaterThan(10)
  await expect(monitor.locator("[data-perf='p50']")).toHaveText(/p50 \d+\.\d ms/)
  const chart = monitor.locator("[data-perf-histogram]")
  await expect(chart).toHaveAttribute("role", "img")
  await expect(chart.locator("rect")).toHaveCount(20)
  await expect(chart.locator("[data-perf-budget]")).toHaveText("16.7 ms")
  const lane = monitor.locator("[data-perf-lane='Quotes']")
  await expect(lane).toHaveAttribute("data-lane", "ordered")
  await expect(lane).toContainText("rows 2")
  await expect(lane.locator("[data-perf-seq]")).toContainText("seq 7")
  await expect(monitor.locator("[data-perf-readout='ipc batch']")).toHaveText("ipc batch 2 rows")
})

// Real keys through the consumer's button: a shortcut changed by pressing it, said back as key caps,
// handed to the app's persistence, then typed as a chord, then reset.
test("a hotkey editor changes a shortcut by pressing it, by typing it, and resets it, and the app hears each change", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='hotkey-editor']")
  const saved = scene.locator("[data-hotkey-saved]")
  const editor = scene.getByRole("region", { name: "Keyboard shortcuts" })
  await expect(editor).toBeVisible()
  const row = editor.locator("[data-hotkey-row='edit.go']")
  await expect(row.locator("kbd[data-slot='kbd']")).toHaveText(["G", "B"])
  await row.getByRole("button", { name: "Change: Go to the blotter" }).click()
  await page.keyboard.press("ControlOrMeta+Shift+L")
  // The caps come in the platform's order (⇧ ⌘ on a Mac, Ctrl Shift elsewhere); the keys underneath are one string.
  await expect(row.locator("[data-hotkey-keys]")).toHaveAttribute("data-hotkey-keys", /^(ctrl\+shift|shift\+meta)\+l$/)
  await expect(row.locator("kbd[data-slot='kbd']")).toHaveCount(3)
  await expect(row).toHaveAttribute("data-remapped", "true")
  await expect.poll(async () => JSON.parse((await saved.getAttribute("data-hotkey-saved")) ?? "{}")).toEqual({ "edit.go": expect.stringMatching(/^(ctrl\+shift|shift\+meta)\+l$/) })
  // A chord as text.
  const book = editor.locator("[data-hotkey-row='edit.book']")
  await book.getByRole("button", { name: "Type it: Go to the book" }).click()
  const input = book.getByLabel("Keys for Go to the book")
  await input.fill("g h")
  await input.press("Enter")
  await expect(book.locator("kbd[data-slot='kbd']")).toHaveText(["G", "H"])
  // A duplicate is said under both rows.
  await book.getByRole("button", { name: "Type it: Go to the book" }).click()
  await book.getByLabel("Keys for Go to the book").fill("x")
  await book.getByLabel("Keys for Go to the book").press("Enter")
  await expect(book.locator("[data-hotkey-conflicts]")).toContainText("Cancel the selected order")
  // Reset all takes everything back, and the app hears an empty map.
  await editor.getByRole("button", { name: "Reset all" }).click()
  await expect(row.locator("kbd[data-slot='kbd']")).toHaveText(["G", "B"])
  await expect(book.locator("kbd[data-slot='kbd']")).toHaveText(["G", "O"])
  await expect(saved).toHaveAttribute("data-hotkey-saved", "{}")
})

// Rules as data through the installed lib: the tone classes live in lib/grid-rules.ts, so this is where
// it shows whether the consumer's Tailwind found them there. A price rule typed in 32nds colors its cell
// with the up token and a tint, a row rule marks the row, the filter drops the small inquiry, the sort
// runs largest first, and every decorated element says its rule in words.
test("a grid under rules colors by the token, filters, orders, and says each rule in words", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='grid-rules']")
  const grid = scene.getByRole("grid", { name: "Ruled" })
  await expect(grid).toHaveAttribute("aria-rowcount", "4")
  await expect(scene.locator("[data-row-id='small']")).toHaveCount(0)
  await expect(scene.locator("[data-row-id]")).toHaveText([/big/, /rich/, /plain/])
  const cell = scene.locator("[data-row-id='rich'] [data-col='px']")
  await expect(cell).toHaveAttribute("data-rule", "rich")
  await expect(cell).toHaveAttribute("data-tone", "up")
  await expect(cell).toHaveAttribute("aria-description", "Rich to the market")
  await expect(scene.locator("[data-row-id='plain'] [data-col='px']")).not.toHaveAttribute("data-rule", /./)
  const painted = await page.evaluate(() => {
    const cell = document.querySelector("section[data-scene='grid-rules'] [data-row-id='rich'] [data-col='px']")!
    const probe = document.createElement("i")
    probe.style.color = "var(--up)"
    document.body.append(probe)
    const out = { color: getComputedStyle(cell).color, up: getComputedStyle(probe).color, image: getComputedStyle(cell).backgroundImage }
    probe.remove()
    return out
  })
  expect(painted.color, "text-up from the installed lib resolves to the --up token").toBe(painted.up)
  expect(painted.image, "the tint is painted as a background image").toContain("linear-gradient")
  const big = scene.locator("[data-row-id='big']")
  await expect(big).toHaveAttribute("data-rule", "large")
  await expect(big).toHaveAttribute("data-tone", "primary")
  await expect(big).toHaveAttribute("aria-description", "Large")
  await expect(scene.locator("[data-row-id='big'] [data-col='size']")).not.toHaveAttribute("data-rule", /./)
})

// The chooser writes the grid's own column state, so everything it does shows in the grid's header: a
// column hidden here leaves the grid, a move here reorders the headers, a drag does too, a width the state
// holds shows here with its reset and the header narrows when it is reset. Then the dialog, through the
// consumer's dialog: open from the button, a checkbox inside changes the grid, Escape closes it.
test("a column chooser hides, reorders, and resets through the grid's own column state, and opens as a dialog", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='column-chooser']")
  const panel = scene.locator("[data-slot='tradecn-column-chooser']")
  const grid = scene.getByRole("grid", { name: "Chosen" })
  const headers = grid.locator("[role='columnheader']")
  await expect(headers).toHaveText(["RFQ", "Client", "Price", "Size", "Status"])
  await expect(panel.locator("li[data-column='px'] [data-column-rule='rich']")).toHaveText("Rich to the market")
  await panel.getByRole("checkbox", { name: "Show Price" }).click()
  await expect(headers).toHaveText(["RFQ", "Client", "Size", "Status"])
  await expect(panel.locator("[data-column-hidden-count]")).toHaveText("1 hidden")
  await panel.getByRole("checkbox", { name: "Show Price" }).click()
  await expect(headers).toHaveCount(5)
  await panel.getByRole("button", { name: "Move up: Status" }).click()
  await expect(headers).toHaveText(["RFQ", "Client", "Price", "Status", "Size"])
  await panel.locator("li[data-column='size']").dragTo(panel.locator("li[data-column='px']"))
  await expect(headers).toHaveText(["RFQ", "Client", "Size", "Price", "Status"])
  const priceHeader = grid.locator("[role='columnheader'][data-col='px']")
  const wide = (await priceHeader.boundingBox())!.width
  await expect(panel.locator("li[data-column='px'] [data-column-width]")).toHaveText("120 px")
  await panel.getByRole("button", { name: "Reset width: Price" }).click()
  await expect(panel.locator("li[data-column='px'] [data-column-width]")).toHaveText("80 px")
  expect((await priceHeader.boundingBox())!.width, "the grid's header narrowed with the reset").toBeLessThan(wide)
  await panel.locator("li[data-column='size']").focus()
  await page.keyboard.press("Alt+ArrowDown")
  await expect(headers).toHaveText(["RFQ", "Client", "Price", "Size", "Status"])
  await panel.getByRole("button", { name: "Reset all" }).click()
  await expect(scene.locator("[data-chooser-state]")).toHaveAttribute("data-chooser-state", JSON.stringify({ order: [], widths: {}, hidden: [] }))
  await scene.getByRole("button", { name: "open chooser" }).click()
  const dialog = page.getByRole("dialog", { name: "Columns" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("checkbox", { name: "Show Status" }).click()
  await expect(headers).toHaveCount(4)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})

// The editor's fields are the consumer's native-select and input, and every edit is a new rules object the
// grid reads at once: a highlight typed here colors a cell, a filter drops a row, a sort key reorders, and
// the chooser in the fourth tab hides a column. The count beside a rule reads the same store as the grid.
test("a rules editor builds a highlight, a filter, and a sort key that the grid follows, and holds the chooser in a tab", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='rules-editor']")
  const editor = scene.getByRole("region", { name: "Rules" })
  const grid = scene.getByRole("grid", { name: "Ruled by the editor" })
  await expect(grid).toHaveAttribute("aria-rowcount", "4")
  await editor.getByRole("button", { name: "Add highlight" }).click()
  const highlight = editor.locator("[data-rule-row='0']")
  await highlight.getByLabel(/^Column:/).selectOption("px")
  await highlight.getByLabel(/^Condition:/).selectOption("gte")
  await highlight.getByLabel(/^Value:/).fill("100")
  await expect(highlight.locator("[data-rule-count]")).toHaveAttribute("data-rule-count", "1")
  await highlight.getByLabel(/^Label:/).fill("Rich")
  const cell = grid.locator("[data-row-id='b'] [data-col='px']")
  await expect(cell).toHaveAttribute("data-tone", "up")
  await expect(cell).toHaveAttribute("aria-description", "Rich")
  await expect(grid.locator("[data-row-id='a'] [data-col='px']")).not.toHaveAttribute("data-rule", /./)
  await editor.getByRole("tab", { name: /^Filters/ }).click()
  await editor.getByRole("button", { name: "Add filter" }).click()
  const filter = editor.locator("[data-rule-row='0']")
  await filter.getByLabel(/^Column:/).selectOption("size")
  await filter.getByLabel(/^Condition:/).selectOption("gte")
  await filter.getByLabel(/^Value:/).fill("2000000")
  await expect(grid).toHaveAttribute("aria-rowcount", "3")
  await expect(grid.locator("[data-row-id='c']")).toHaveCount(0)
  await expect(editor.locator("[data-rules-shown]")).toHaveText("2 of 3 rows show")
  await editor.getByRole("tab", { name: /^Sort/ }).click()
  await editor.getByRole("button", { name: "Add sort key" }).click()
  const sort = editor.locator("[data-rule-row='0']")
  await sort.getByLabel(/^Column:/).selectOption("size")
  await sort.getByLabel(/^Direction:/).selectOption("desc")
  await expect(grid.locator("[data-row-id]").first()).toHaveAttribute("data-row-id", "b")
  await editor.getByRole("tab", { name: /^Columns/ }).click()
  await editor.getByRole("checkbox", { name: "Show Status" }).click()
  await expect(grid.locator("[role='columnheader']")).toHaveCount(4)
  await expect(scene.locator("[data-rules-state]")).toHaveAttribute("data-rules-state", /"sort":\[\{"key":"size","dir":"desc"\}\]/)
})

// The envelope's round trip through the installed lib: a template export carries the template slot alone,
// the person's export carries theirs too and never the session's, and an import under the template
// boundary lands only the template slot.
test("a preferences envelope keeps its boundaries through export and import", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("section[data-scene='preferences'] [data-slot='tradecn-preferences']")).toHaveText("layout | layout,hotkeys | layout")
})

// Four notices in the store, three in the strip: the severity word beside a bar painted with the tone's
// token, a repeat folded into its row with a climbing count, only the allowed action offered and run
// through the consumer's button, the whole list in the consumer's dialog as a grid, then dismiss and clear.
test("an alerts strip shows the newest notices in words and tone, folds a repeated key, offers only allowed actions, opens the list, and clears", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='alerts']")
  const strip = scene.getByRole("group", { name: "Notices" })
  await expect(strip).toHaveAttribute("data-count", "4")
  await expect(strip.locator("li[data-alert-id]")).toHaveCount(3)
  await expect(strip.locator("li[data-alert-id='up']")).toHaveCount(0)
  await expect(strip.locator("li[data-tone='destructive'] [data-alert-severity]")).toHaveText("critical")
  const painted = await page.evaluate(() => {
    const bar = document.querySelector("section[data-scene='alerts'] li[data-tone='destructive'] [data-alert-bar]")!
    const probe = document.createElement("i")
    probe.style.backgroundColor = "var(--destructive)"
    document.body.append(probe)
    const out = { bar: getComputedStyle(bar).backgroundColor, token: getComputedStyle(probe).backgroundColor }
    probe.remove()
    return out
  })
  expect(painted.bar, "the bar is painted with the tone's token").toBe(painted.token)
  expect(painted.bar).not.toBe("rgba(0, 0, 0, 0)")
  await scene.getByRole("button", { name: "slow feed again" }).click()
  await scene.getByRole("button", { name: "slow feed again" }).click()
  await expect(strip.locator("li[data-alert-id='slow'] [data-alert-count]")).toHaveText("×3")
  await expect(strip.locator("li[data-alert-id='slow']")).toContainText("2.0 s behind")
  await expect(strip).toHaveAttribute("data-count", "4")
  await expect(strip.locator("li[data-alert-id='slow'] [data-alert-action]")).toHaveText(["Reconnect"])
  await expect(strip.locator("li[data-alert-id='fill'] [data-alert-action]")).toHaveCount(0)
  await strip.locator("li[data-alert-id='slow'] [data-alert-action='reconnect']").click()
  await expect(scene.locator("[data-alerts-acted]")).toHaveAttribute("data-alerts-acted", "reconnect:slow")
  await strip.getByRole("button", { name: "1 more" }).click()
  const dialog = page.getByRole("dialog", { name: "All notices" })
  await expect(dialog.getByRole("grid", { name: "All notices" })).toHaveAttribute("aria-rowcount", "5")
  await expect(dialog.locator("[data-row-id]").first()).toHaveAttribute("data-row-id", "slow")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await strip.getByRole("button", { name: "Dismiss: Order rejected" }).click()
  await expect(strip).toHaveAttribute("data-count", "3")
  await strip.getByRole("button", { name: "Clear all" }).click()
  await expect(strip).toHaveAttribute("data-count", "0")
  await expect(strip.getByText("No notices.")).toBeVisible()
})

// The store alone through the installed lib: the keyed repeat is one row at a count of two, and the cap
// of three let the oldest plain notice go while the keyed one, which has an action, stayed.
test("an alert store folds a repeated key and keeps to its cap", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("section[data-scene='alert-store'] [data-slot='tradecn-alert-store']")).toHaveText("fill 2×1 fill 1×1 keyed×2")
})

// The environment as a word painted in its tone's token, a clock on the shared timer that moves within
// a few seconds, the user with the words a screen reader hears, and a child in the slot it was given.
test("a status bar names the environment in a word and a tone, ticks its clock, and holds what it is given", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='status-bar']")
  const bar = scene.getByRole("group", { name: "Status" })
  await expect(bar).toHaveAttribute("data-environment", "UAT")
  const env = bar.locator("[data-status-environment]")
  await expect(env).toHaveText("Environment: UAT")
  const painted = await page.evaluate(() => {
    const el = document.querySelector("section[data-scene='status-bar'] [data-status-environment]")!
    const probe = document.createElement("i")
    probe.style.color = "var(--stale)"
    document.body.append(probe)
    const out = { color: getComputedStyle(el).color, token: getComputedStyle(probe).color }
    probe.remove()
    return out
  })
  expect(painted.color, "the environment word is painted with the tone's token").toBe(painted.token)
  const time = bar.locator("[data-status-clock='UTC'] [data-status-time]")
  await expect(time).toHaveText(/^\d\d:\d\d:\d\d$/)
  const first = (await time.textContent()) ?? ""
  await expect(time).not.toHaveText(first, { timeout: 4000 })
  await expect(bar.locator("[data-status-user]")).toHaveText("Signed in as smoke")
  await expect(bar.locator("[data-status-slot='left'] [data-status-child]")).toHaveText("feeds ok")
})

// A theme has no element to look for, so it is read back out of the stylesheet instead. The matrix
// runs this once per theme, after installing that theme alone, and runs every test above again under
// it. Without TRADECN_THEME this is the plain run and there is no theme to check.
test("the installed theme is what the page is drawn with, in both modes", async ({ page }) => {
  const name = process.env.TRADECN_THEME
  test.skip(!name, "no theme installed in this run")
  const theme = JSON.parse(readFileSync(process.env.TRADECN_THEME_JSON!, "utf8")) as { cssVars: { theme?: Record<string, string>; light: Record<string, string>; dark: Record<string, string> } }
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  // Colors are compared as colors, not as text: the production build respells them (`oklch(0.26 0.03 70)`
  // comes back as `oklch(26% .03 70)`) and the browser hands back a var() already substituted. Both sides
  // go through one probe element, so the browser writes them the same way. A token given as
  // var(--color-x) is expected to be the theme's own x.
  const expected = (vars: Record<string, string>) => {
    const resolve = (name: string): string => {
      const ref = /^var\(--color-([\w-]+)\)$/.exec(vars[name] ?? "")
      return ref ? resolve(ref[1]!) : (vars[name] ?? "")
    }
    return Object.keys(vars).filter((name) => name !== "radius" && !TYPOGRAPHY.test(name)).map((name) => [name, resolve(name)] as [string, string])
  }
  // The typography tokens are not colors. Each is read back through the property it is for, both sides through
  // one probe, so a respelled font stack or a rounded weight compares the way the browser holds it.
  const TYPOGRAPHY = /^tradecn-(font-|text-size-|line-height-|numeric-variant$)/
  const typography = (vars: Record<string, string>) => Object.entries(vars).filter(([name]) => TYPOGRAPHY.test(name))
  const typographyMismatches = (pairs: [string, string][]) =>
    page.evaluate((list) => {
      const probe = document.createElement("i")
      document.body.append(probe)
      const prop = (name: string) => (name.startsWith("tradecn-font-weight-") ? "fontWeight" : name.startsWith("tradecn-font-") ? "fontFamily" : name.startsWith("tradecn-text-size-") ? "fontSize" : name.startsWith("tradecn-line-height-") ? "lineHeight" : "fontVariantNumeric") as "fontWeight" | "fontFamily" | "fontSize" | "lineHeight" | "fontVariantNumeric"
      const as = (name: string, value: string) => ((probe.style[prop(name)] = ""), (probe.style[prop(name)] = value), getComputedStyle(probe)[prop(name)])
      const out = list.flatMap(([name, want]) => {
        const got = as(name, `var(--${name})`)
        return got === as(name, want) && got !== "" ? [] : [`--${name}: wanted ${want}, the page has ${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || "nothing"}`]
      })
      probe.remove()
      return out
    }, pairs)
  const mismatches = (pairs: [string, string][]) =>
    page.evaluate((list) => {
      const probe = document.createElement("i")
      document.body.append(probe)
      const as = (value: string) => ((probe.style.color = ""), (probe.style.color = value), getComputedStyle(probe).color)
      const out = list.flatMap(([name, want]) => {
        const got = as(`var(--${name})`)
        return got === as(want) && got !== "" ? [] : [`--${name}: wanted ${want}, the page has ${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || "nothing"}`]
      })
      probe.remove()
      return out
    }, pairs)
  expect(await mismatches(expected(theme.cssVars.light)), `${name}: every light color`).toEqual([])
  expect(await typographyMismatches(typography(theme.cssVars.light)), `${name}: every typography token`).toEqual([])
  // The theme's base rules: the numeric variant on the root, and the accessibility remap once the attribute is on <html>.
  const base = await page.evaluate(() => {
    const probe = document.createElement("i")
    document.body.append(probe)
    const family = (value: string) => ((probe.style.fontFamily = ""), (probe.style.fontFamily = value), getComputedStyle(probe).fontFamily)
    const before = family("var(--tradecn-font-sans)")
    document.documentElement.setAttribute("data-accessibility", "hyperlegible")
    const remapped = family("var(--tradecn-font-sans)") === family("var(--tradecn-font-accessible)") && family("var(--tradecn-font-mono)") === family("var(--tradecn-font-accessible-mono)")
    document.documentElement.removeAttribute("data-accessibility")
    const restored = family("var(--tradecn-font-sans)") === before
    probe.remove()
    return { root: getComputedStyle(document.documentElement).fontVariantNumeric, remapped, restored, before }
  })
  expect(base.root, "the root is set in the numeric variant").toBe("lining-nums tabular-nums")
  expect(base.remapped, "data-accessibility=hyperlegible swaps the sans and the mono for the accessible pair").toBe(true)
  expect(base.restored, "removing the attribute restores the fonts").toBe(true)
  expect(base.before.replace(/["']/g, ""), "the sans is the theme's").toBe(theme.cssVars.light["tradecn-font-sans"]?.replace(/["']/g, ""))
  // What those variables do to the page: the body is the theme's background, the panel's corners follow the theme's radius
  // (square when a theme sets it to 0rem), and the sans stack is the theme's when the theme sets one.
  const drawn = await page.evaluate(() => {
    const probe = document.createElement("i")
    probe.style.backgroundColor = "var(--background)"
    // Tailwind's `@theme inline` inlines --radius-md into the utility and emits no variable for it, so the probe computes what rounded-md computes.
    probe.style.borderRadius = "calc(var(--radius) * 0.8)"
    document.body.append(probe)
    const out = {
      body: getComputedStyle(document.body).backgroundColor,
      background: getComputedStyle(probe).backgroundColor,
      radius: getComputedStyle(document.querySelector("[data-slot='tradecn-panel']")!).borderTopLeftRadius,
      radiusMd: getComputedStyle(probe).borderTopLeftRadius,
      font: getComputedStyle(document.documentElement).fontFamily,
    }
    probe.remove()
    return out
  })
  expect(drawn.body, "the body is painted with --background").toBe(drawn.background)
  expect(drawn.radius, "rounded-md is 0.8 of the theme's --radius").toBe(drawn.radiusMd)
  if (theme.cssVars.light.radius === "0rem") expect(drawn.radius, "a theme with --radius 0rem is square").toBe("0px")
  const stack = theme.cssVars.theme?.["font-sans"]
  if (stack) expect(drawn.font.replace(/["']/g, ""), "font-sans is the theme's stack").toBe(stack.replace(/["']/g, ""))
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  expect(await mismatches(expected(theme.cssVars.dark)), `${name}: every dark color`).toEqual([])
})
