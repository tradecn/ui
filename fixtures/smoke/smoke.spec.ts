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
  // Exact: the quick-size buttons are named "Quantity 1" and so on, and getByLabel matches a substring by default.
  const quantity = ticket.getByLabel("Quantity", { exact: true })
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
  // Quick sizes: a press puts the size in the field and wears the mark; mod+1 from inside the price field puts the first.
  await ticket.getByRole("button", { name: "Quantity 10" }).click()
  await expect(quantity).toHaveValue("10")
  await expect(ticket.getByRole("button", { name: "Quantity 10" })).toHaveAttribute("aria-pressed", "true")
  await price.click()
  await page.keyboard.press("ControlOrMeta+1")
  await expect(quantity).toHaveValue("1")
  // The desk's lines: 20 is past the ask-again line, so the key asks once and the second press sends; 60 is past the block, so the button goes and the field says why.
  await quantity.fill("20")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect(ticket.getByRole("button", { name: "Send anyway?" })).toBeVisible()
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-ticket-sent")) ?? "[]").length).toBe(1)
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-ticket-sent")) ?? "[]").length).toBe(2)
  await quantity.fill("60")
  await expect(ticket.getByText("60 is above the size limit of 50.")).toBeVisible()
  await expect(ticket.getByRole("button", { name: /^Send/ })).toBeDisabled()
  await quantity.fill("5")
  await expect(ticket.getByRole("button", { name: /^Send/ })).toBeEnabled()
  // The server allows nothing: no buttons, a line that says so, and the key does nothing.
  await scene.getByRole("button", { name: "close market" }).click()
  await expect(ticket.getByRole("button", { name: /^Send/ })).toHaveCount(0)
  await expect(ticket.getByText("Nothing can be done with this ticket right now.")).toBeVisible()
  await quantity.click()
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-ticket-sent")) ?? "[]").length).toBe(2)
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
  // Seven ticks over the offer is past the desk's four-tick line, a confirm here: the key asks once, a new level withdraws the question.
  await offer.fill("99-20")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect(ticket.getByRole("button", { name: "Quote anyway?" })).toBeVisible()
  await expect(state).toHaveAttribute("data-rfq-sent", "[]")
  await offer.fill("99-16+")
  await expect(ticket.getByRole("button", { name: "Quote anyway?" })).toHaveCount(0)
  // Quick sizes: the inquiry's own 5mm leads the row and is in force; mod+2 quotes for the second of the desk's, and the sent draft carries it.
  await expect(ticket.getByRole("group", { name: "For" }).getByRole("button")).toHaveText(["5mm", "1mm", "2mm"])
  await expect(ticket.getByRole("button", { name: "For 5mm" })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ControlOrMeta+2")
  await expect(ticket.getByRole("button", { name: "For 2mm" })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect.poll(async () => JSON.parse((await state.getAttribute("data-rfq-sent")) ?? "[]")).toEqual([{ inquiryId: "Q-7", bid: null, ask: 99.515625, quantity: 2_000_000 }])
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
test("an rfq stack marks the active inquiry, moves on when the venue ends it, parks one and moves on, picks on Enter, and hides small auto quotes under the threshold", async ({ page }) => {
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
  // Parked: q1 keeps its place, muted and marked, and the ticket moves on; let back, it waits its turn.
  await scene.getByRole("button", { name: "park q1", exact: true }).click()
  await expect(state).toHaveAttribute("data-rfq-active", "q3")
  await expect(state).toHaveAttribute("data-rfq-parked", "q1")
  await expect(stack.locator("[data-row-id='q1']")).toHaveAttribute("data-state", "parked")
  await expect(stack.locator("[data-row-id='q1']")).toHaveAttribute("aria-description", "Parked")
  await scene.getByRole("button", { name: "unpark q1", exact: true }).click()
  await expect(state).toHaveAttribute("data-rfq-parked", "")
  await expect(stack.locator("[data-row-id='q1']")).not.toHaveAttribute("data-state", "parked")
  await expect(state).toHaveAttribute("data-rfq-active", "q3")
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

// Six readings of one calendar through the installed lib: a trading morning, its post-close, a Saturday, a
// holiday, an early-close afternoon, and the first morning on daylight time, each read in New York's zone.
test("a session calendar reads a trading day, a weekend, a holiday, an early close, and daylight saving in the venue's zone", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("section[data-scene='session-calendar'] [data-slot='tradecn-session-calendar']")).toHaveText("open post closed holiday post open")
})

// One check through the installed lib: a size past the ask-again line and a level too far from the market, each
// named with its level, field, and rule.
test("a limits check says what is over a line, at which level, and by which rule", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("section[data-scene='limits'] [data-slot='tradecn-limits']")).toHaveText("confirm:quantity:maxQuantity block:price:maxDistance")
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

// The tape preset in a real scroll box: mounted at the tail, ten appended rows keep it there with no hand
// on the wheel, a click on a row stops the following, the next ten count up on the pill, and the pill goes
// back to the end. The footer's total is of the rows on screen and follows each batch.
test("a tape grid follows its tail, stops on a touch, counts the new rows on a pill, returns on it, and totals its rows in the footer", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='data-grid']")
  const grid = scene.locator("[data-slot='tradecn-data-grid']")
  const box = grid.locator(".overflow-auto")
  const footer = grid.locator("[data-grid-footer] [data-col='px']")
  const pill = grid.locator("[data-grid-behind]")
  const atTail = () => box.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
  await expect(grid).toHaveAttribute("aria-rowcount", "52")
  await expect(footer).toHaveText("6225")
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect.poll(atTail).toBe(true)
  await scene.getByRole("button", { name: "append 10" }).click()
  await expect(grid).toHaveAttribute("aria-rowcount", "62")
  await expect(footer).toHaveText("7770")
  await expect.poll(atTail).toBe(true)
  await expect(pill).toHaveCount(0)
  // A touch stops the following: the next arrivals count, and the box stays where it was.
  await grid.locator("[data-row-id='r59'] [role='gridcell']").first().click()
  await scene.getByRole("button", { name: "append 10" }).click()
  await expect(pill).toHaveText("10 new")
  await expect.poll(atTail).toBe(false)
  await expect(footer).toHaveText("9415")
  await pill.click()
  await expect(pill).toHaveCount(0)
  await expect.poll(atTail).toBe(true)
  await expect(grid).toHaveAttribute("aria-rowcount", "72")
})

// Editing through the installed grid, against a pretend server 150 ms away: a value typed in place goes out
// as a change and waits as pending until the server's row comes back with it, a refused one keeps the old value
// with the server's words in the cell, the box asks and never flips itself, Escape reverts, Tab moves along the
// row, and a row the server allows nothing on is read-only with a disabled box.
test("a parameter grid types a value in place, waits for the server, prints a refusal, asks through the box, and keeps a locked row read-only", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='parameter-grid']")
  const grid = scene.getByRole("grid", { name: "Parameters" })
  const cell = (id: string, key: string) => grid.locator(`[data-row-id='${id}'] [data-col='${key}']`)
  await expect(grid).toHaveAttribute("data-preset", "parameters")
  await expect(grid).toHaveAttribute("data-editable", "")
  await expect(scene.locator("[data-parameter-asof]")).toHaveText("As of +120s")
  await expect(cell("zn", "skew")).toHaveText("0.50")
  await expect(cell("zn", "maxSize")).not.toHaveAttribute("data-editable", "")
  // Changed since: ZB moved after the moment, ZN before it.
  await expect(cell("zb", "name").locator("[data-parameter-changed]")).toHaveCount(1)
  await expect(cell("zn", "name").locator("[data-parameter-changed]")).toHaveCount(0)
  await expect(grid.locator("[data-row-id='zb']")).toHaveAttribute("aria-description", "Changed")
  // Type a value: the editor opens on the value, steps, takes the text, and the cell waits for the server.
  await cell("zn", "skew").dblclick()
  const skew = grid.getByRole("textbox", { name: "Skew" })
  await expect(skew).toHaveValue("0.50")
  await expect(skew).toBeFocused()
  await page.keyboard.press("ArrowUp")
  await expect(skew).toHaveValue("0.75")
  await skew.fill("1.25")
  await page.keyboard.press("Enter")
  await expect(cell("zn", "skew")).toHaveAttribute("data-pending", "true")
  await expect(cell("zn", "skew")).toHaveText("1.25")
  await expect(cell("zn", "skew")).not.toHaveAttribute("data-pending")
  await expect(cell("zn", "skew")).toHaveText("1.25")
  await expect(cell("zn", "updated")).toContainText("smoke")
  await expect(grid).toBeFocused()
  // Refused: the old value stands, and the server's words are in the cell.
  await cell("zn", "width").dblclick()
  await grid.getByRole("textbox", { name: "Width" }).fill("12")
  await page.keyboard.press("Enter")
  await expect(cell("zn", "width")).toHaveAttribute("data-rejected", "Risk declined it")
  await expect(cell("zn", "width")).toHaveText("2.00Risk declined it")
  // Past the line: the editor stays and says why; Escape reverts it.
  await cell("zn", "skew").dblclick()
  await skew.fill("9")
  await page.keyboard.press("Enter")
  await expect(skew).toHaveAttribute("aria-invalid", "true")
  await expect(skew).toHaveAttribute("aria-description", "9.00 is above the maximum of 5.00.")
  await page.keyboard.press("Escape")
  await expect(skew).toHaveCount(0)
  await expect(cell("zn", "skew")).toHaveText("1.25")
  // Tab commits and opens the next editable cell; the read-only max size is skipped, so the row's end hands the keyboard back.
  await cell("zb", "skew").dblclick()
  await page.keyboard.press("Tab")
  await expect(grid.getByRole("textbox", { name: "Width" })).toHaveValue("3.00")
  await page.keyboard.press("Tab")
  await expect(grid.getByRole("textbox")).toHaveCount(0)
  await expect(grid).toBeFocused()
  // The box asks the server: still the server's word while pending, then the row comes back off.
  const box = grid.getByRole("checkbox", { name: "Disable ZN" })
  await box.click()
  await expect(cell("zn", "enabled")).toHaveAttribute("data-pending", "true")
  await expect(box).toHaveAttribute("data-parameter-enabled", "true")
  await expect(grid.getByRole("checkbox", { name: "Enable ZN" })).toHaveAttribute("data-parameter-enabled", "false")
  await expect(cell("zn", "enabled")).not.toHaveAttribute("data-pending")
  // The server allows nothing on TU: its cells are read-only and its box is disabled.
  await expect(cell("tu", "skew")).toHaveAttribute("aria-readonly", "true")
  await expect(grid.getByRole("checkbox", { name: "Disable TU" })).toBeDisabled()
  await cell("tu", "skew").dblclick()
  await expect(grid.getByRole("textbox")).toHaveCount(0)
  expect(errors).toEqual([])
})

// A book through the installed grid: the position printed with its sign and its side named, a loss painted with
// the down token through the installed hook's class, the totals under the body, and a mark moving on the
// server carrying the P&L and the total with it.
test("a positions grid prints the sign and names the side, colors a loss by the token, and totals the book under it", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='positions']")
  const grid = scene.getByRole("grid", { name: "Positions" })
  const cell = (id: string, key: string) => grid.locator(`[data-row-id='${id}'] [data-col='${key}']`)
  await expect(grid).toHaveAttribute("aria-rowcount", "5")
  await expect(cell("ty", "position")).toHaveText("−25mm")
  await expect(cell("ty", "position").locator("[data-side]")).toHaveAttribute("data-side", "short")
  await expect(cell("zn", "position")).toHaveText("+120")
  await expect(cell("zn", "position").locator("[data-side]")).toHaveAttribute("data-side", "long")
  await expect(cell("fv", "position")).toHaveText("0")
  await expect(grid.locator("[data-row-id='ty']")).toHaveAttribute("aria-description", "short")
  await expect(grid.getByRole("columnheader", { name: /DV01/ })).toBeVisible()
  const painted = await page.evaluate(() => {
    const loss = document.querySelector("section[data-scene='positions'] [data-row-id='ty'] [data-col='dayPnl'] span > span")!
    const probe = document.createElement("i")
    probe.style.color = "var(--down)"
    document.body.append(probe)
    const out = { color: getComputedStyle(loss).color, down: getComputedStyle(probe).color }
    probe.remove()
    return out
  })
  expect(painted.color, "a loss is painted with the down token").toBe(painted.down)
  const footer = grid.locator("[data-grid-footer]")
  await expect(footer.locator("[data-col='instrument']")).toHaveText("3 positions")
  await expect(footer.locator("[data-col='dayPnl']")).toHaveText("−50,000")
  await expect(footer.locator("[data-col='risk']")).toHaveText("−12,600")
  await expect(footer.locator("[data-col='position']")).toHaveText("")
  await scene.getByRole("button", { name: "mark moves" }).click()
  await expect(cell("ty", "mark")).toHaveText("99.75")
  await expect(cell("ty", "dayPnl")).toHaveText("+62,500")
  await expect(footer.locator("[data-col='dayPnl']")).toHaveText("+75,000")
})

// One order's life through the installed grid: the tape with its columns, one event's changes in the pane
// beside it, the difference between two selected through the consumer's real modifier click, the next event
// landing at the tail, and the CSV of what is shown handed back through onExport.
test("an audit trail lists the events, shows one event's changes and the difference between two, follows the tail, and exports CSV", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='audit-trail']")
  const grid = scene.getByRole("grid", { name: "Audit trail" })
  const pane = scene.getByRole("region", { name: "Changes" })
  const row = (id: string) => grid.locator(`[data-row-id='${id}']`)
  await expect(grid).toHaveAttribute("data-preset", "tape")
  await expect(grid).toHaveAttribute("aria-rowcount", "5")
  await expect(row("e2")).toContainText("t1200")
  await expect(row("e2")).toContainText("Acknowledged")
  await expect(row("e1").locator("[data-col='changes']")).toHaveText("3 fields")
  await expect(pane).toHaveAttribute("data-audit-pane", "none")
  await row("e3").locator("[role='gridcell']").first().click()
  await expect(pane).toHaveAttribute("data-audit-pane", "event")
  await expect(pane.getByRole("heading")).toHaveText("PartiallyFilled at t4000")
  await expect(pane.locator("[data-audit-change='filled'] [data-audit-from]")).toHaveText("0")
  await expect(pane.locator("[data-audit-change='filled'] [data-audit-to]")).toHaveText("2000")
  await row("e1").locator("[role='gridcell']").first().click({ modifiers: ["ControlOrMeta"] })
  await expect(pane).toHaveAttribute("data-audit-pane", "diff")
  await expect(pane.getByRole("heading")).toHaveText("New t0 to PartiallyFilled t4000")
  await expect(pane.locator("[data-audit-change]")).toHaveCount(2)
  await expect(pane.locator("[data-audit-change='status'] [data-audit-to]")).toHaveText("PartiallyFilled")
  await expect(pane.locator("[data-audit-change='filled'] [data-audit-from]")).toHaveText("–")
  await scene.getByRole("button", { name: "next event" }).click()
  await expect(grid).toHaveAttribute("aria-rowcount", "6")
  await expect(row("e5")).toContainText("Filled")
  await scene.getByRole("button", { name: "Export CSV" }).click()
  const csv = (await scene.locator("[data-audit-csv]").getAttribute("data-audit-csv")) ?? ""
  expect(csv.split("\r\n")[0]).toBe("Time,Event,By,Message,Changes")
  expect(csv).toContain("t12000,Filled,venue,,2 fields")
  expect(csv.trim().split("\r\n")).toHaveLength(6)
})

// The list through the consumer's input, button, and badge: save the current layout under a name, load it, paste
// one that needs a kind the workspace lacks and see the ask before it opens, rename, duplicate, export, delete on
// the second press, and reset.
test("a layout manager saves, loads, warns before loading a layout with an unknown kind, renames, duplicates, exports, deletes on the second press, and resets", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='layout-manager']")
  const state = scene.locator("[data-lm-loaded]")
  const manager = scene.getByRole("region", { name: "Layouts" })
  const field = manager.getByRole("textbox", { name: "Layout name" })
  await field.fill("Morning")
  await manager.getByRole("button", { name: "Save current" }).click()
  const morning = manager.locator("[data-layout-template='t-1']")
  await expect(morning.locator("[data-layout-name]")).toHaveText("Morning")
  await expect(morning.locator("[data-layout-panels]")).toHaveText("2 panels")
  await morning.getByRole("button", { name: "Load" }).click()
  await expect(state).toHaveAttribute("data-lm-loaded", "Morning")
  // A pasted layout that asks for a ladder: named on the row, and Load asks again before it opens.
  await manager.getByRole("button", { name: "Import" }).click()
  const layout = { version: 1, kind: "tradecn-workspace", dockview: { grid: { root: {} }, panels: { "ladder-1": {} } }, panels: { "ladder-1": { kind: "ladder", title: "Ladder", state: {} } } }
  await manager.getByRole("textbox", { name: "Paste a layout's JSON" }).fill(JSON.stringify(layout))
  await manager.getByRole("textbox", { name: "Layout name" }).nth(1).fill("With ladder")
  await manager.getByRole("button", { name: "Add" }).click()
  const ladder = manager.locator("[data-layout-template='t-2']")
  await expect(ladder.locator("[data-layout-unknown]")).toHaveText("Needs ladder")
  await ladder.getByRole("button", { name: "Load", exact: true }).click()
  await expect(state).toHaveAttribute("data-lm-loaded", "Morning")
  await ladder.getByRole("button", { name: "Load anyway?" }).click()
  await expect(state).toHaveAttribute("data-lm-loaded", "With ladder")
  // Rename in place, duplicate beside, export the JSON.
  await morning.getByRole("button", { name: "Rename: Morning" }).click()
  await manager.getByRole("textbox", { name: "Rename: Morning" }).fill("Open")
  await page.keyboard.press("Enter")
  await expect(morning.locator("[data-layout-name]")).toHaveText("Open")
  await morning.getByRole("button", { name: "Duplicate: Open" }).click()
  await expect(manager.locator("[data-layout-name]")).toHaveText(["Open", "Copy of Open", "With ladder"])
  await morning.getByRole("button", { name: "Export: Open" }).click()
  expect(JSON.parse((await state.getAttribute("data-lm-export")) ?? "{}")).toMatchObject({ kind: "tradecn-workspace" })
  // Delete asks once; the second press deletes. Reset is the consumer's seed.
  await ladder.getByRole("button", { name: "Delete: With ladder" }).click()
  await expect(ladder).toHaveCount(1)
  await ladder.getByRole("button", { name: "Delete?: With ladder" }).click()
  await expect(ladder).toHaveCount(0)
  await manager.getByRole("button", { name: "Reset to default" }).click()
  await expect(state).toHaveAttribute("data-lm-resets", "1")
})

// A feed's actions through the consumer's real dropdown menu: the market-data feed offers the two the server
// allows, the RFQ feed has no menu, a press marks the feed pending with the tier untouched, and the pretend
// server's new state settles it.
test("a feed's menu offers what the server allows, marks a press pending, and settles when the feed reports back", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='feed-health']")
  const md = scene.locator("[data-feed='md']")
  await expect(scene.getByRole("button", { name: "Actions: RFQ" })).toHaveCount(0)
  await scene.getByRole("button", { name: "Actions: Market data" }).click()
  const items = page.getByRole("menuitem")
  await expect(items).toHaveText(["Reconnect", "Pause"])
  await items.filter({ hasText: "Reconnect" }).click()
  await expect(scene.locator("[data-feed-acted]")).toHaveAttribute("data-feed-acted", "reconnect:md")
  await expect(md).toHaveAttribute("data-pending", "reconnect")
  await expect(md.locator("[data-feed-pending]")).toContainText("Reconnect")
  await expect(md).toHaveAttribute("data-tier", "live")
  await expect(md).toHaveAttribute("data-state", "connecting")
  await expect(md).not.toHaveAttribute("data-pending")
})

// The field over the consumer's own command: a CUSIP is read as one and said so, the server is asked with the hint
// and its answer listed with the identifier that matched, Enter picks and clears; a run's phrase is read as a coupon
// and maturity; a ticker's list moves with the arrows; a query the server does not know says so.
test("an instrument search reads a CUSIP, a run's phrase, and a ticker, lists the server's answers, and picks on Enter", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='instrument-search']")
  const root = scene.locator("[data-slot='tradecn-instrument-search']")
  const field = scene.getByRole("combobox")
  await field.click()
  await page.keyboard.type("037833100")
  await expect(root).toHaveAttribute("data-query-kind", "cusip")
  await expect(scene.locator("[data-instrument-hint]")).toHaveText("Read as CUSIP")
  const aapl = scene.locator("[data-instrument-hit='aapl']")
  await expect(aapl).toContainText("AAPL")
  await expect(aapl).toContainText("Apple Inc.")
  await expect(aapl).toContainText("037833100")
  await expect(aapl).toContainText("Equity")
  await page.keyboard.press("Enter")
  await expect(scene.locator("[data-instrument-picked]")).toHaveAttribute("data-instrument-picked", "aapl:cusip")
  await expect(field).toHaveValue("")
  await expect(root).not.toHaveAttribute("data-query-kind")
  // A run's phrase.
  await page.keyboard.type("4 1/8 05/34")
  await expect(root).toHaveAttribute("data-query-kind", "coupon-maturity")
  await expect(scene.locator("[data-instrument-hint]")).toContainText("Read as Coupon and maturity")
  await expect(scene.locator("[data-instrument-hit='t10']")).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(scene.locator("[data-instrument-picked]")).toHaveAttribute("data-instrument-picked", "t10:coupon-maturity")
  // A ticker with two answers: the arrows move the highlight, Enter picks the second.
  await page.keyboard.type("z")
  await expect(root).toHaveAttribute("data-query-kind", "ticker")
  await expect(scene.locator("[data-instrument-hit]")).toHaveCount(2)
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(scene.locator("[data-instrument-picked]")).toHaveAttribute("data-instrument-picked", "zb:ticker")
  // Nothing the server knows.
  await page.keyboard.type("qqq")
  await expect(scene.getByText("Nothing matches qqq.")).toBeVisible()
})

// The installed ladder over a small book in 32nds: the mid rung in the middle of the box, prices in the
// convention, the desk's own size in its chip, the bid column painted with the up token under a header that
// says Bid, a click in it staging a buy and holding the ladder still while the market moves, Recenter and
// Home putting the mid back, one level's change reaching one cell, and the keys walking the rungs.
test("a depth ladder centers on the mid, prints prices in 32nds, marks the desk's size, stages from a click, holds still under a hand, and recenters", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='depth-ladder']")
  const ladder = scene.getByRole("grid", { name: "ZN ladder" })
  const box = ladder.locator(".overflow-auto")
  const rung = (tick: number) => ladder.locator(`[data-tick='${tick}']`)
  const staged = scene.locator("[data-ladder-staged]")
  // How far a rung's middle sits from the box's middle, in px.
  const offCenter = async (tick: number) => {
    const a = await rung(tick).boundingBox()
    const b = await box.boundingBox()
    return a && b ? Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) : Infinity
  }
  await expect(ladder).toHaveAttribute("aria-rowcount", "82")
  await expect(ladder).toHaveAttribute("data-following", "true")
  await expect(rung(6369)).toHaveAttribute("data-mid", "")
  await expect(rung(6369).locator("[data-col='price']")).toHaveText("99-16+")
  await expect(rung(6368).locator("[data-col='price']")).toHaveText("99-16")
  await expect(rung(6372).locator("[data-col='price']")).toHaveText("99-18")
  await expect.poll(() => offCenter(6369)).toBeLessThan(22)
  await expect(rung(6368)).toHaveAttribute("data-mine", "bid")
  await expect(rung(6368).locator("[data-col='bid'] [data-mine-size]")).toHaveText("5 yours")
  await expect(rung(6368).locator("[data-col='bid']")).toContainText("120")
  await expect(rung(6371)).toHaveAttribute("data-mine", "ask")
  await expect(rung(6369).locator("[data-col='bid']")).toHaveText("")
  await expect(ladder.getByRole("columnheader")).toHaveText(["Bid", "Price", "Ask"])
  const painted = await page.evaluate(() => {
    const bid = document.querySelector("section[data-scene='depth-ladder'] [data-tick='6367'] [data-col='bid']")!
    const probe = document.createElement("i")
    probe.style.color = "var(--up)"
    document.body.append(probe)
    const out = { color: getComputedStyle(bid).color, up: getComputedStyle(probe).color }
    probe.remove()
    return out
  })
  expect(painted.color, "a bid size is painted with the up token").toBe(painted.up)
  // A click in the bid column stages a buy at that price, and is a hand on the ladder.
  await rung(6368).locator("[data-col='bid']").click()
  await expect(staged).toHaveText("buy 99.5")
  await expect(ladder).toHaveAttribute("data-following", "false")
  await expect(ladder.locator("[data-ladder-recenter]")).toBeVisible()
  // The market moves two ticks while held: the new mid is marked, the prices on screen stay put.
  await scene.getByRole("button", { name: "mid moves up" }).click()
  await expect(rung(6371)).toHaveAttribute("data-mid", "")
  await expect.poll(() => offCenter(6369)).toBeLessThan(22)
  await expect.poll(() => offCenter(6371)).toBeGreaterThan(30)
  // Recenter puts the mid in the middle and follows again.
  await ladder.locator("[data-ladder-recenter]").click()
  await expect(ladder).toHaveAttribute("data-following", "true")
  await expect(ladder.locator("[data-ladder-recenter]")).toHaveCount(0)
  await expect.poll(() => offCenter(6371)).toBeLessThan(22)
  // One level's change reaches its cell.
  await scene.getByRole("button", { name: "bid grows" }).click()
  await expect(rung(6368).locator("[data-col='bid']")).toContainText("150")
  // The keys walk from the rung the click focused: Up one tick, Right twice to the ask column, Enter stages a
  // sell there; Home follows again.
  await ladder.focus()
  await expect(rung(6368)).toHaveAttribute("data-focused", "true")
  await page.keyboard.press("ArrowUp")
  await expect(ladder).toHaveAttribute("data-following", "false")
  await expect(rung(6369)).toHaveAttribute("data-focused", "true")
  await expect(rung(6369).locator("[data-col='bid']")).toHaveAttribute("data-focused-col", "true")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await expect(rung(6369).locator("[data-col='ask']")).toHaveAttribute("data-focused-col", "true")
  await page.keyboard.press("Enter")
  await expect(staged).toHaveText("sell 99.515625")
  await page.keyboard.press("Home")
  await expect(ladder).toHaveAttribute("data-following", "true")
  await expect.poll(() => offCenter(6371)).toBeLessThan(22)
})

// The installed matrix over three notes: headers with the unit, each cell the row less the column with its sign in
// the row's own tick, the diagonal blank, the structures under it in basis points, one note's move reaching the
// four cells and the two structures it is part of and flashing each by direction (the fill painted with the soft
// token, since motion is reduced here), and the basis flipping every cell to basis points.
test("a spread matrix prints signed spreads in the row's ticks, flashes the cells a moved quote is part of, lists structures, and flips its basis", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const scene = page.locator("section[data-scene='spread-matrix']")
  const matrix = scene.getByRole("table", { name: "Curve spreads" })
  const structures = scene.getByRole("table", { name: "Curve structures" })
  const cell = (row: string, column: string) => matrix.locator(`td[data-row='${row}'][data-column='${column}']`)
  const spread = (id: string) => structures.locator(`tr[data-structure='${id}'] td[data-spread]`)
  await expect(matrix.getByRole("columnheader")).toHaveText(["Instrument (ticks)", "2Y", "5Y", "10Y"])
  await expect(matrix.getByRole("rowheader")).toHaveText(["2Y", "5Y", "10Y"])
  // 5Y at 99-24 over 10Y at 99-16+ is 15 ticks of 1/64; 2Y counts its half point over 5Y in its own 1/128ths.
  await expect(cell("5Y", "10Y")).toHaveText("+15")
  await expect(cell("10Y", "5Y")).toHaveText("−15")
  await expect(cell("2Y", "5Y")).toHaveText("+64")
  await expect(cell("5Y", "2Y")).toHaveText("−32")
  await expect(cell("5Y", "5Y")).toHaveAttribute("data-diagonal", "")
  await expect(cell("5Y", "5Y")).toHaveText("")
  await expect(structures.getByRole("columnheader")).toHaveText(["Structure", "Legs", "Spread (bp)"])
  await expect(spread("2s10s")).toHaveText("+12.5")
  await expect(spread("2s5s10s")).toHaveText("−37.5")
  await expect(structures.locator("tr[data-structure='2s10s'] td[data-legs]")).toHaveText("2Y / 10Y")
  // 10Y cheapens two ticks and a basis point: its row and its column reprint and flash; a cell it is not part of does neither.
  await scene.getByRole("button", { name: "10Y cheapens" }).click()
  await expect(cell("5Y", "10Y")).toHaveText("+17")
  await expect(cell("5Y", "10Y")).toHaveAttribute("data-direction", "up")
  const painted = await page.evaluate(() => {
    const el = document.querySelector("section[data-scene='spread-matrix'] td[data-row='5Y'][data-column='10Y']")!
    const probe = document.createElement("i")
    probe.style.backgroundColor = "var(--up-soft)"
    document.body.append(probe)
    const out = { color: getComputedStyle(el).backgroundColor, up: getComputedStyle(probe).backgroundColor }
    probe.remove()
    return out
  })
  expect(painted.color, "a rising spread is filled with the up-soft token").toBe(painted.up)
  await expect(cell("10Y", "5Y")).toHaveText("−17")
  await expect(cell("10Y", "5Y")).toHaveAttribute("data-direction", "down")
  await expect(cell("2Y", "10Y")).toHaveText("+98")
  await expect(cell("2Y", "5Y")).toHaveText("+64")
  await expect(cell("2Y", "5Y")).not.toHaveAttribute("data-direction")
  await expect(spread("2s10s")).toHaveText("+13.5")
  await expect(spread("2s10s")).toHaveAttribute("data-direction", "up")
  await expect(spread("2s5s10s")).toHaveText("−38.5")
  // The basis flips: the unit moves in the corner header and every cell reprints from the yields.
  await scene.getByRole("button", { name: "basis flips" }).click()
  await expect(matrix.getByRole("columnheader").first()).toHaveText("Instrument (bp)")
  await expect(cell("10Y", "2Y")).toHaveText("+13.5")
  await expect(cell("5Y", "2Y")).toHaveText("−12.5")
})

// The installed quote panel over three notes: the market's and the desk's two-way in 32nds, the server's status
// word and the buttons it allows per row, a level typed in place and written back by the server, a level too far
// off the market asking once and sending on the second Enter, a size over the line refused, a crossed ask refused,
// a row's action moving the server's word and its buttons only when the server answers, and Pull all asking
// again before it pulls every row the server allows it on.
test("a quote panel types levels in the instrument's notation, asks once past a limit, refuses a crossed level, and pulls all after asking again", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='quote-panel']")
  const grid = scene.getByRole("grid", { name: "Quotes" })
  const cell = (row: string, key: string) => grid.locator(`[data-row-id='${row}'] [data-col='${key}']`)
  const status = (row: string) => cell(row, "status").locator("[data-quote-status]")
  const log = scene.locator("[data-quote-log]")
  await expect(grid.getByRole("columnheader")).toHaveText(["Instrument", "Status", "Mkt bid", "Mkt ask", "Bid", "Ask", "Skew", "Width", "Bid size", "Ask size", "Actions"])
  await expect(status("2Y")).toHaveText("Quoting")
  await expect(cell("2Y", "marketBid")).toHaveText("100-07+")
  await expect(cell("2Y", "bid")).toHaveText("100-07")
  await expect(cell("2Y", "ask")).toHaveText("100-08+")
  await expect(cell("2Y", "width")).toHaveText("3")
  await expect(cell("2Y", "bidSize")).toHaveText("25,000,000")
  await expect(cell("10Y", "bid")).toHaveText("–")
  await expect(cell("2Y", "actions").getByRole("button")).toHaveText(["Pause", "Pull"])
  await expect(cell("10Y", "actions").getByRole("button")).toHaveText(["Resume", "Pull"])
  await expect(cell("30Y", "actions").getByRole("button")).toHaveText(["Resume"])
  // A level typed in the notation: sent, pending, then written back by the server.
  await cell("2Y", "bid").dblclick()
  const bid = grid.getByRole("textbox", { name: "Bid" })
  await expect(bid).toHaveValue("100-07")
  await bid.fill("100-06+")
  await bid.press("Enter")
  await expect(log).toHaveText("edit 2Y bid 100.203125")
  await expect(cell("2Y", "bid")).toHaveText("100-06+")
  await expect(cell("2Y", "bid")).not.toHaveAttribute("data-pending", "true")
  // Seven ticks off the market: the limit asks once, and the second Enter sends.
  await cell("2Y", "bid").dblclick()
  await bid.fill("100-04")
  await bid.press("Enter")
  await expect(bid).toHaveAttribute("aria-description", "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Enter again sends it.")
  await bid.press("Enter")
  await expect(log).toHaveText("edit 2Y bid 100.125")
  await expect(cell("2Y", "bid")).toHaveText("100-04")
  // A size over the line is refused; Escape leaves the editor.
  await cell("2Y", "bidSize").dblclick()
  const size = grid.getByRole("textbox", { name: "Bid size" })
  await size.fill("150000000")
  await size.press("Enter")
  await expect(size).toHaveAttribute("aria-description", "150,000,000 is above the size limit of 100,000,000.")
  await size.press("Escape")
  await expect(cell("2Y", "bidSize")).toHaveText("25,000,000")
  // An ask at or under the desk's bid is refused before anything is sent.
  await cell("2Y", "ask").dblclick()
  const ask = grid.getByRole("textbox", { name: "Ask" })
  await ask.fill("100-03")
  await ask.press("Enter")
  await expect(ask).toHaveAttribute("aria-description", "The ask would cross the bid.")
  await ask.press("Escape")
  await expect(log).toHaveText("edit 2Y bid 100.125")
  // A row's action: the server's word and its buttons move when the server answers, not on the click.
  await cell("2Y", "actions").getByRole("button", { name: "Pause" }).click()
  await expect(log).toHaveText("pause 2Y")
  await expect(status("2Y")).toHaveText("Paused")
  await expect(cell("2Y", "actions").getByRole("button")).toHaveText(["Resume", "Pull"])
  // Pull all asks again: Escape withdraws the question; the second press pulls the rows the server allows it on.
  const pullAll = scene.locator("[data-quote-pull-all]")
  await expect(pullAll).toHaveText("Pull all")
  await expect(pullAll).toHaveAttribute("data-quote-pull-all", "2")
  await pullAll.click()
  await expect(pullAll).toHaveText("Pull all anyway?")
  await page.keyboard.press("Escape")
  await expect(pullAll).toHaveText("Pull all")
  await pullAll.click()
  await pullAll.click()
  await expect(log).toHaveText("pull 2Y,10Y")
  await expect(status("2Y")).toHaveText("Pulled")
  await expect(status("10Y")).toHaveText("Pulled")
  await expect(pullAll).toHaveAttribute("data-quote-pull-all", "0")
  await expect(pullAll).toBeDisabled()
})

// The installed guard: the banner up inside the window with its countdown and its button, the readout in the warning
// phase, the wall at expiry over a note that keeps its text, Escape refused, a refused sign-in said as an alert, a
// sign-in that lands taking the wall down with the note still there, and the readout live again.
test("a session guard warns with a countdown, walls the desk at expiry without unmounting it, refuses to close on Escape, and steps back when the session is renewed", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='session-guard']")
  const guard = scene.locator("[data-slot='tradecn-session-guard']")
  const status = scene.locator("[data-session-status]")
  const asked = scene.locator("[data-session-asked]")
  const note = scene.getByRole("textbox", { name: "A half-typed note" })
  await expect(guard).toHaveAttribute("data-session-phase", "warning")
  const banner = guard.getByRole("status")
  await expect(banner).toContainText("Your session ends in")
  await expect(banner.locator("[data-slot='tradecn-countdown']")).toHaveAttribute("data-tier", "soon")
  await expect(banner.getByRole("button", { name: "Stay signed in" })).toBeVisible()
  await expect(status).toHaveAttribute("data-session-status", "warning")
  await expect(status).toContainText("Session")
  await note.fill("buy 10 ZN at 110-16")
  await scene.getByRole("button", { name: "refuse the next sign-in" }).click()
  // The end: the wall over everything, the consumer's sign-in inside it, and Escape no way through.
  await scene.getByRole("button", { name: "session ends" }).click()
  await expect(guard).toHaveAttribute("data-session-phase", "expired")
  const dialog = page.getByRole("dialog", { name: "Your session has ended" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("Your sign-in goes here.")
  await expect(guard.getByRole("status")).toHaveCount(0)
  await expect(status).toHaveAttribute("data-session-status", "expired")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  await expect(guard).toHaveAttribute("data-session-phase", "expired")
  // A refused sign-in is said beside the button; the next one lands, the wall comes down, and the note never moved.
  await dialog.getByRole("button", { name: "Sign in again" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("That did not work. Try again.")
  await expect(asked).toHaveText("1")
  await dialog.getByRole("button", { name: "Sign in again" }).click()
  await expect(asked).toHaveText("2")
  await expect(guard).toHaveAttribute("data-session-phase", "live")
  await expect(page.getByRole("dialog", { name: "Your session has ended" })).toHaveCount(0)
  await expect(note).toHaveValue("buy 10 ZN at 110-16")
  await expect(status).toHaveAttribute("data-session-status", "live")
  await expect(guard.getByRole("status")).toHaveCount(0)
})

// The installed window set over a pretend shell in the scene: restore opens the main window first and the blotters after
// it, a snapshot carries the bounds the shell reports and parses back as a set, a close through the set and one the
// shell made on its own both leave it, and an empty set snapshots as nothing.
test("a window set restores main first, hears the shell's own close, and snapshots the bounds back", async ({ page }) => {
  await page.goto("/")
  const scene = page.locator("section[data-scene='window-set']")
  const open = scene.locator("[data-window-open]")
  const snapshot = scene.locator("[data-window-snapshot]")
  await expect(open).toHaveText("")
  await scene.getByRole("button", { name: "restore" }).click()
  await expect(open).toHaveText("main,blotters")
  await scene.getByRole("button", { name: "restore" }).click()
  await expect(open).toHaveText("main,blotters")
  await scene.getByRole("button", { name: "snapshot" }).click()
  await expect(snapshot).toHaveText("main@40,20 blotters@1600,0|2")
  await scene.getByRole("button", { name: "close blotters" }).click()
  await expect(open).toHaveText("main")
  await scene.getByRole("button", { name: "shell closes main" }).click()
  await expect(open).toHaveText("")
  await scene.getByRole("button", { name: "snapshot" }).click()
  await expect(snapshot).toHaveText("|0")
})

// A price chart is a canvas, so the fixture is where its picture is proven: the page's tokens reach the paint
// (the tag at the last price is a solid box of the direction's color, found among the pixels), the readout
// prints the last with its sign, the keys and the pointer both move the crosshair, a tick into the open bar
// turns the chart down and repaints the tag, a later tick opens a bar, and the overlays are named beside
// swatches in the chart tokens the consumer's Tailwind compiled from the installed file.
test("a price chart paints in the page's tokens, prints the last with its sign, walks the bars with the keys and the pointer, follows a tick into the open bar, and names its overlays", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  const scene = page.locator("section[data-scene='price-chart']")
  const chart = scene.locator("[data-slot='tradecn-price-chart']")
  const plot = chart.getByRole("slider")
  const readout = chart.locator("[data-chart-readout]")
  await expect(chart).toHaveAttribute("data-direction", "up")
  await expect(chart.locator("[data-chart-last]")).toHaveText("110-18")
  await expect(chart.locator("[data-chart-change]")).toHaveText("+0-02 (+0.06%)")
  await expect(plot).toHaveAccessibleName("ZN, today: up, last 110-18, +0-02 (+0.06%), low 110-15, high 110-19, 3 bars")
  await expect(chart.locator(".uplot canvas")).toHaveCount(1)
  // How many pixels of the chart's canvas are exactly a token's color, the token painted through a second canvas so both went through the same conversion.
  const pixelsOf = (token: string) =>
    chart.evaluate((root, token) => {
      const canvas = root.querySelector("canvas")!
      const swatch = document.createElement("canvas")
      swatch.width = swatch.height = 1
      const ref = swatch.getContext("2d")!
      const probe = document.createElement("i")
      probe.style.color = `var(--${token})`
      document.body.append(probe)
      ref.fillStyle = getComputedStyle(probe).color
      probe.remove()
      ref.fillRect(0, 0, 1, 1)
      const [r, g, b] = ref.getImageData(0, 0, 1, 1).data
      const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
      let n = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] === r && data[i + 1] === g && data[i + 2] === b && data[i + 3] === 255) n++
      return n
    }, token)
  await expect.poll(() => pixelsOf("up"), { message: "the tag at the last price is painted with the up token" }).toBeGreaterThan(200)
  expect(await pixelsOf("down")).toBe(0)
  // The keys walk the bars from the last one, in New York time; Escape puts the crosshair away.
  await plot.focus()
  await expect(plot).toHaveAttribute("aria-valuenow", "2")
  await expect(readout).toHaveText("09:32:00 110-18 V 30")
  await page.keyboard.press("ArrowLeft")
  await expect(plot).toHaveAttribute("aria-valuenow", "1")
  await expect(readout).toHaveText("09:31:00 110-16 V 20")
  await page.keyboard.press("Escape")
  await expect(readout).toHaveText("")
  // The pointer just inside the plot area (uPlot's overlay, past the axis padding) lands on the first bar; leaving takes the crosshair with it.
  const box = (await chart.locator(".u-over").boundingBox())!
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await expect(readout).toHaveText("09:30:00 110-17 V 10")
  await page.mouse.move(0, 0)
  await expect(readout).toHaveText("")
  // A tick under the first open folds into the open bar: the last, the sign, the direction, and the tag all turn.
  await scene.getByRole("button", { name: "tick down", exact: true }).click()
  await expect(chart.locator("[data-chart-last]")).toHaveText("110-15+")
  await expect(chart.locator("[data-chart-change]")).toHaveText("−0-00+ (−0.01%)")
  await expect(chart).toHaveAttribute("data-direction", "down")
  await expect.poll(() => pixelsOf("down"), { message: "the tag repaints with the down token" }).toBeGreaterThan(200)
  await expect(plot).toHaveAttribute("aria-valuemax", "2")
  // A tick in the next minute opens a fourth bar.
  await scene.getByRole("button", { name: "new bar", exact: true }).click()
  await expect(plot).toHaveAttribute("aria-valuemax", "3")
  await expect(chart.locator("[data-chart-last]")).toHaveText("110-20")
  // The overlay is named, and its swatch wears the first chart token, a utility the consumer's Tailwind compiled from the installed file.
  const legend = chart.getByRole("list", { name: "Overlays" })
  await expect(legend.getByRole("listitem")).toHaveText(["3-bar average"])
  const swatch = await legend.locator("span").first().evaluate((el) => {
    const probe = document.createElement("i")
    probe.style.color = "var(--chart-1)"
    document.body.append(probe)
    const out = { swatch: getComputedStyle(el).backgroundColor, token: getComputedStyle(probe).color }
    probe.remove()
    return out
  })
  expect(swatch.swatch, "bg-chart-1 resolves to the token").toBe(swatch.token)
  expect(errors).toEqual([])
})
