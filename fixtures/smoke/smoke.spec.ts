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
  await expect.poll(async () => Number(await state.getAttribute("data-ws-saves"))).toBeGreaterThan(saves + 1)
  await page.reload()
  await expect(state).toHaveAttribute("data-ws-restored", "yes")
  await expect(tabs).toHaveCount(3)
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
    return Object.keys(vars).filter((name) => name !== "radius").map((name) => [name, resolve(name)] as [string, string])
  }
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
  // What those variables do to the page: the body is the theme's background, corners are square, the sans stack is the theme's.
  const drawn = await page.evaluate(() => {
    const probe = document.createElement("i")
    probe.style.backgroundColor = "var(--background)"
    document.body.append(probe)
    const out = {
      body: getComputedStyle(document.body).backgroundColor,
      background: getComputedStyle(probe).backgroundColor,
      radius: getComputedStyle(document.querySelector("[data-slot='tradecn-panel']")!).borderTopLeftRadius,
      font: getComputedStyle(document.documentElement).fontFamily,
    }
    probe.remove()
    return out
  })
  expect(drawn.body, "the body is painted with --background").toBe(drawn.background)
  expect(drawn.radius, "rounded-md is square").toBe("0px")
  expect(drawn.font.replace(/["']/g, ""), "font-sans is the theme's stack").toBe(theme.cssVars.theme?.["font-sans"]?.replace(/["']/g, ""))
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  expect(await mismatches(expected(theme.cssVars.dark)), `${name}: every dark color`).toEqual([])
})
