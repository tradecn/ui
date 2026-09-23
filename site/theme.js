// Color mode, palette, and preview alignment: the reader's last choices in this browser, or the defaults until they
// make one (the system's mode, the site's theme). On every page and every preview, blocking in <head>, so
// the first paint is already in the right mode and theme and a demo mounts into them. The pages and the
// previews share an origin, so they share the choices, and the storage event carries a change to every
// open document: the previews on a page follow its button and its menu, and so does every other tab.
// A file, not an inline script, so the site's Content-Security-Policy can keep script-src to 'self'.
const MODE_KEY = "tradecn-theme"
const THEME_KEY = "tradecn-palette"
const ALIGNMENT_KEY = "tradecn-preview-alignment"
const MODES = ["light", "dark"]
const ALIGNMENTS = ["left", "center", "right"]
// The themes this page can wear, from the meta the builder writes before this script: the site's own first,
// which is the page's :root palette and what it wears until the reader picks another.
const THEMES = (document.querySelector('meta[name="tradecn-themes"]')?.content ?? "").split(" ").filter(Boolean)
const systemDark = matchMedia("(prefers-color-scheme: dark)")

// The choices, held here too, so the button and the menu still work where storage is blocked or full.
let chosen = storedMode()
let chosenTheme = storedTheme()
let chosenAlignment = storedAlignment()

function storedAlignment() {
  try {
    const stored = localStorage.getItem(ALIGNMENT_KEY)
    return ALIGNMENTS.includes(stored) ? stored : "center"
  } catch {
    return "center"
  }
}

function storedMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    return MODES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

function storedTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    // A theme this page does not know (one since removed, say) is no choice at all.
    return THEMES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

/** The mode the page is in: the choice, or the system's when there is none. */
function currentMode() {
  return chosen ?? (systemDark.matches ? "dark" : "light")
}

/** The theme the page wears: the choice, or the site's own when there is none. */
function currentTheme() {
  return chosenTheme ?? THEMES[0] ?? null
}

/** Puts the mode on <html> as a class, which is where the palette and the components read it, and says on the button what a press would do. */
function applyMode() {
  const mode = currentMode()
  const root = document.documentElement
  for (const other of MODES) root.classList.toggle(other, other === mode)
  for (const button of document.querySelectorAll(".mode-toggle")) button.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode")
}

/** Puts the theme on <html> as data-theme, which the page's palette blocks and the previews' are keyed on, and shows it in the menu. */
function applyTheme() {
  const theme = currentTheme()
  const root = document.documentElement
  if (theme) root.dataset.theme = theme
  else delete root.dataset.theme
  for (const select of document.querySelectorAll(".theme-select")) select.value = theme ?? ""
}

/** The frame follows the preference before paint; mounted alignment controls follow the change event. */
function applyAlignment() {
  document.documentElement.dataset.previewAlign = chosenAlignment
  dispatchEvent(new Event("tradecn-preview-alignment-change"))
}

applyAlignment()
applyMode()
applyTheme()
// The system changes under a page that follows it (a scheduled switch at dusk, say).
systemDark.addEventListener("change", applyMode)
// Another document on this origin made a choice: a page's button or menu, with this a preview inside it, or another tab.
addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== MODE_KEY && event.key !== THEME_KEY && event.key !== ALIGNMENT_KEY) return
  chosen = storedMode()
  chosenTheme = storedTheme()
  chosenAlignment = storedAlignment()
  applyMode()
  applyTheme()
  applyAlignment()
})

// A preview's controls request a choice; storage carries it to the other frames and tabs.
addEventListener("tradecn-preview-align", (event) => {
  if (!ALIGNMENTS.includes(event.detail)) return
  chosenAlignment = event.detail
  remember(ALIGNMENT_KEY, chosenAlignment)
  applyAlignment()
})

function remember(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage that is blocked or full: the choice still holds for this page.
  }
}

addEventListener("DOMContentLoaded", () => {
  // The button and the menu exist now; the label and the menu catch up with what the head set.
  applyMode()
  applyTheme()
  for (const button of document.querySelectorAll(".mode-toggle")) {
    button.addEventListener("click", () => {
      chosen = currentMode() === "dark" ? "light" : "dark"
      remember(MODE_KEY, chosen)
      applyMode()
    })
  }
  for (const select of document.querySelectorAll(".theme-select")) {
    select.addEventListener("change", () => {
      chosenTheme = THEMES.includes(select.value) ? select.value : null
      if (chosenTheme) remember(THEME_KEY, chosenTheme)
      applyTheme()
    })
  }
})
