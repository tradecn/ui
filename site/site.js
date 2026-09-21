// The site's one script, on the landing page and every docs page: the preview card's tabs and the
// iframe's height from the message its page posts, the package-manager tabs on every install block,
// and the copy button on every code block. A file, not an inline script, so the site's
// Content-Security-Policy can keep script-src to 'self'.
// Loaded in <head> and not deferred, on purpose: the parser stops here until it has run, so the
// message listener below exists before any preview iframe is even parsed, let alone loaded (a
// deferred copy lost that race on the live site, where the preview bundle is cached and this file is
// fetched fresh), and the package-manager choice is on <html> before the first install block is
// parsed, so a page never shows npm for a frame and then swaps.

// The stylesheet hides the copy buttons and the package-manager tabs until this runs: without a script they would do nothing.
document.documentElement.classList.add("js")

// pnpm, npm, yarn, or bun: the last one picked, in this browser. The pages' CSS shows the matching command.
const MANAGER_KEY = "tradecn-pm"
const MANAGERS = ["pnpm", "npm", "yarn", "bun"]
const DEFAULT_MANAGER = "npm"

function storedManager() {
  try {
    const stored = localStorage.getItem(MANAGER_KEY)
    return MANAGERS.includes(stored) ? stored : DEFAULT_MANAGER
  } catch {
    return DEFAULT_MANAGER
  }
}

/** Every install block on the page follows the choice, and with `remember` so does the next page. */
function selectManager(name, remember) {
  document.documentElement.dataset.pm = name
  for (const tab of document.querySelectorAll(".managers [role='tab']")) {
    const on = tab.dataset.pm === name
    tab.setAttribute("aria-selected", String(on))
    tab.tabIndex = on ? 0 : -1
  }
  if (!remember) return
  try {
    localStorage.setItem(MANAGER_KEY, name)
  } catch {
    // Storage that is blocked or full: the choice still holds for this page.
  }
}

document.documentElement.dataset.pm = storedManager()

addEventListener("message", (event) => {
  if (event.origin !== location.origin || !event.data || event.data.type !== "tradecn-preview") return
  // Every preview frame: a docs page's card and the opening page's showcase alike.
  for (const frame of document.querySelectorAll("iframe[data-preview]")) {
    if (frame.contentWindow === event.source) frame.style.height = Math.ceil(event.data.height) + "px"
  }
})

/** A tablist: click and the arrow keys select, and focus follows the selection, so Tab leaves the list. */
function tablist(list, select) {
  const tabs = [...list.querySelectorAll("[role='tab']")]
  const pick = (tab, focus) => {
    select(tab)
    for (const other of tabs) other.tabIndex = other === tab ? 0 : -1
    if (focus) tab.focus()
  }
  const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0]
  for (const tab of tabs) tab.tabIndex = tab === selected ? 0 : -1
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => pick(tab, false))
    tab.addEventListener("keydown", (event) => {
      const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key]
      if (to === undefined) return
      event.preventDefault()
      pick(tabs[(to + tabs.length) % tabs.length], true)
    })
  })
}

/** The button copies the code beside it: the one visible command in an install block, the whole block otherwise. */
function copyButton(button) {
  let timer
  button.addEventListener("click", async () => {
    const block = button.closest(".code")
    const code = block.querySelector(`pre[data-pm="${document.documentElement.dataset.pm}"] code`) ?? block.querySelector("pre code")
    try {
      // Without the trailing newline: a command pasted into a terminal should wait for Enter.
      await navigator.clipboard.writeText(code.textContent.trimEnd())
    } catch {
      return // No clipboard here (an insecure page, or permission refused): the button stays a button.
    }
    button.dataset.copied = ""
    button.setAttribute("aria-label", "Copied")
    clearTimeout(timer)
    timer = setTimeout(() => {
      delete button.dataset.copied
      button.setAttribute("aria-label", "Copy")
    }, 1500)
  })
}

addEventListener("DOMContentLoaded", () => {
  // Tabbed cards: the preview's Preview / Code and the Installation's Command / Manual. The card's bar is its
  // own first child tablist; a package-manager bar inside one of its panels is wired separately below.
  for (const card of document.querySelectorAll("[data-tabs]")) {
    const list = card.querySelector(":scope > [role='tablist']")
    if (!list) continue
    tablist(list, (tab) => {
      for (const other of list.querySelectorAll("[role='tab']")) {
        const on = other === tab
        other.setAttribute("aria-selected", String(on))
        const panel = document.getElementById(other.getAttribute("aria-controls"))
        if (panel) panel.hidden = !on
      }
    })
  }
  for (const list of document.querySelectorAll(".managers")) tablist(list, (tab) => selectManager(tab.dataset.pm, true))
  // The markup selects npm; the tabs catch up with the choice the head set on <html>.
  selectManager(document.documentElement.dataset.pm, false)
  for (const button of document.querySelectorAll(".copy")) copyButton(button)
  // Belt and braces: a preview that is already up answers this with its height. One that is not up
  // yet ignores it and reports on its own when it mounts, which the listener above is waiting for.
  for (const frame of document.querySelectorAll("iframe[data-preview]")) {
    const ask = () => frame.contentWindow?.postMessage({ type: "tradecn-preview-ask" }, location.origin)
    ask()
    frame.addEventListener("load", ask)
  }
})
