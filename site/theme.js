// Light or dark: the reader's last choice in this browser, or the system's until they make one. On
// every page and every preview, blocking in <head>, so the first paint is already in the right mode
// and a demo mounts into it. The pages and the previews share an origin, so they share the choice,
// and the storage event carries a change to every open document: the previews on a page follow its
// button, and so does every other tab. A file, not an inline script, so the site's
// Content-Security-Policy can keep script-src to 'self'.
const MODE_KEY = "tradecn-theme"
const MODES = ["light", "dark"]
const systemDark = matchMedia("(prefers-color-scheme: dark)")

// The choice, held here too, so the button still works where storage is blocked or full.
let chosen = storedMode()

function storedMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    return MODES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

/** The mode the page is in: the choice, or the system's when there is none. */
function currentMode() {
  return chosen ?? (systemDark.matches ? "dark" : "light")
}

/** Puts the mode on <html> as a class, which is where the palette and the components read it, and says on the button what a press would do. */
function applyMode() {
  const mode = currentMode()
  const root = document.documentElement
  for (const other of MODES) root.classList.toggle(other, other === mode)
  for (const button of document.querySelectorAll(".mode-toggle")) button.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode")
}

applyMode()
// The system changes under a page that follows it (a scheduled switch at dusk, say).
systemDark.addEventListener("change", applyMode)
// Another document on this origin made a choice: a page's button, with this a preview inside it, or another tab.
addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== MODE_KEY) return
  chosen = storedMode()
  applyMode()
})

addEventListener("DOMContentLoaded", () => {
  // The button exists now; its label catches up with the mode the head set.
  applyMode()
  for (const button of document.querySelectorAll(".mode-toggle")) {
    button.addEventListener("click", () => {
      chosen = currentMode() === "dark" ? "light" : "dark"
      try {
        localStorage.setItem(MODE_KEY, chosen)
      } catch {
        // Storage that is blocked or full: the choice still holds for this page.
      }
      applyMode()
    })
  }
})
