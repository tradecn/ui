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
  const panel = page.locator("[data-slot='tradecn-panel']")
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
