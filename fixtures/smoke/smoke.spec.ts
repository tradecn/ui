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
  const expected = Number(await page.locator("main[data-smoke]").getAttribute("data-scenes"))
  await expect(page.locator("[data-slot^='tradecn-']")).toHaveCount(expected, { timeout: 10_000 })
  for (const slot of await page.locator("[data-slot^='tradecn-']").all()) await expect(slot).toBeVisible()
  const tokens = (await page.locator("main[data-smoke]").getAttribute("data-tokens"))?.split(" ").filter(Boolean) ?? []
  for (const token of tokens) {
    const value = await page.evaluate((t) => getComputedStyle(document.documentElement).getPropertyValue(`--${t}`).trim(), token)
    expect(value, `--${token} is defined`).not.toBe("")
  }
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
