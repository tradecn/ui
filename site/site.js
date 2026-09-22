// The site's one script, on the landing page and every docs page: the preview card's tabs and the
// iframe's height from the message its page posts, the package-manager tabs on every install block,
// the copy button on every code block, the phone's menu, the version menu, and the search. A file, not
// an inline script, so the site's Content-Security-Policy can keep script-src to 'self'.
// Loaded in <head> and not deferred, on purpose: the parser stops here until it has run, so the
// message listener below exists before any preview iframe is even parsed, let alone loaded (a
// deferred copy lost that race on the live site, where the preview bundle is cached and this file is
// fetched fresh), and the package-manager choice is on <html> before the first install block is
// parsed, so a page never shows npm for a frame and then swaps.

// The stylesheet hides the copy buttons and the package-manager tabs until this runs: without a script they would do nothing.
document.documentElement.classList.add("js")

// Which release this page describes, and where its tree is served from: "" at the root, which is the latest
// release's, or "/v1.2.0" on a release's own tree. Every site path this script builds goes under the base; the
// registry and the list of releases stay at the root, since there is one of each.
const VERSION = document.documentElement.dataset.version ?? ""
const BASE = document.documentElement.dataset.base ?? ""

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

// The version menu. First among the header's links, it lists every release with pages, from /versions.json
// at the root (never this tree's own copy: a page on an older tree learns about the releases after it from
// there), newest first, this page's selected. A pick goes to this same page under that release, or to that
// release's docs when the page is not there (an item that came later), or to its opening page; a HEAD says
// which exists. The latest release lives at the root and every other under /vX.Y.Z/.
const VERSIONS_INDEX = "/versions.json"

/** This page's path within its tree: what it is at the root, and what it would be under any release. */
const pagePath = () => (BASE && location.pathname.startsWith(`${BASE}/`) ? location.pathname.slice(BASE.length) : location.pathname)

/** Go to `version`'s tree, which is the root for the latest: this page there, else its docs, else its opening page. */
async function goToVersion(version, latest) {
  const root = version === latest ? "" : `/${version}`
  // Already reading this release where it lives.
  if (root === BASE) return
  const path = pagePath()
  for (const candidate of [path, "/docs/", "/"]) {
    const url = `${root}${candidate}`
    try {
      const response = await fetch(url, { method: "HEAD" })
      if (response.ok) {
        location.assign(candidate === path ? `${url}${location.hash}` : url)
        return
      }
    } catch {
      // The network failed this one; the next may answer, and the last is taken on faith.
    }
  }
  location.assign(`${root}/`)
}

function versions() {
  // Two menus on a page, the header's and the phone menu's; the stylesheet shows one at a time and both say the same.
  const selects = [...document.querySelectorAll(".version-select")]
  if (!selects.length || !VERSION) return
  // Until the list arrives the menu holds the releases the page was built with, the newest of them first.
  let latest = selects[0].options[0]?.value ?? VERSION
  fetch(VERSIONS_INDEX)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${VERSIONS_INDEX} answered ${response.status}`))))
    .then((index) => {
      const listed = Array.isArray(index.versions) ? index.versions.filter((version) => typeof version === "string") : []
      // A list without this release (its tree is being published) leaves the menu as built.
      if (!listed.includes(VERSION)) return
      latest = typeof index.latest === "string" ? index.latest : listed[0]
      for (const select of selects) select.replaceChildren(...listed.map((version) => new Option(version, version, false, version === VERSION)))
    })
    .catch(() => {
      // The list did not load: the menu keeps the releases it was built with.
    })
  for (const select of selects) {
    select.addEventListener("change", () => {
      goToVersion(select.value, latest)
    })
  }
}

// The menu. On a phone the header folds: its name and its sections give way to a Menu button, and the sidebar is
// the panel it opens, over the page under the header, with the version and theme menus, Home, and the sections
// ahead of the docs groups (the opening page has a panel of its own with just those). The state is on <html> as
// data-menu, which the stylesheet reads, and the page behind holds still while it is open. Escape closes it and
// hands focus back to the button; a link inside closes it too, so a heading on this same page is not scrolled to
// behind it; widening the window past the fold closes it, since the sidebar is in the page again there.
const MENU_OPEN = "open"
const NARROW = "(max-width: 48rem)"

function menu() {
  const toggle = document.querySelector(".menu-toggle")
  const header = document.querySelector(".site-header")
  const panel = document.getElementById(toggle?.getAttribute("aria-controls") ?? "")
  if (!toggle || !header || !panel) return
  const root = document.documentElement
  // The panel starts where the header ends, whatever height the header takes: one row, or two on the narrowest phone.
  new ResizeObserver(() => root.style.setProperty("--header-height", `${header.offsetHeight}px`)).observe(header)
  const isOpen = () => root.dataset.menu === MENU_OPEN
  const set = (open) => {
    if (open) root.dataset.menu = MENU_OPEN
    else delete root.dataset.menu
    toggle.setAttribute("aria-expanded", String(open))
  }
  toggle.addEventListener("click", () => {
    set(!isOpen())
    if (isOpen()) panel.focus({ preventScroll: true })
  })
  addEventListener("keydown", (event) => {
    // The search dialog's Escape is its own.
    if (event.key !== "Escape" || !isOpen() || document.querySelector("dialog[open]")) return
    set(false)
    toggle.focus()
  })
  panel.addEventListener("click", (event) => {
    if (event.target.closest("a")) set(false)
  })
  const narrow = matchMedia(NARROW)
  narrow.addEventListener("change", () => {
    if (!narrow.matches) set(false)
  })
}

// The search. The button in the header and mod+k open a native dialog over every page's title, headings,
// and text, from /search.json, which the builder writes beside the pages of every tree and this fetches
// the first time the search opens. Every word of the query has to land somewhere: the page's title beats
// a heading, which beats the text under it, and a page's hits stay together under its name. Enter goes to
// the highlighted hit. Keys pressed inside a preview iframe stay in that document, so a demo's mod+k opens
// the demo's own palette and never this, and this never opens from inside a demo.
const SEARCH_INDEX = "/search.json"
const MAC = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? "")
const MAX_HITS = 20
/** What the results call a page: the sidebar's name for it, or its title on an index written before there was one. */
const nameOf = (page) => page.label ?? page.title

/** How well the words fit one hit: 0 when a word fits nowhere. The page's names count most, then the heading, then the text. */
function scoreOf(words, names, heading, text) {
  let score = 0
  for (const word of words) {
    if (names.some((name) => name.startsWith(word))) score += 5
    else if (names.some((name) => name.includes(word))) score += 4
    else if (heading.startsWith(word)) score += 4
    else if (heading.includes(word)) score += 3
    else if (text.includes(word)) score += 1
    else return 0
  }
  return score
}

/** The hits for a query, best page first with its hits together, pages in nav order when tied. An empty query lists every page. */
function findHits(pages, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = []
  pages.forEach((page, order) => {
    // The index names a page by its path within the tree; the link is that path under this tree's base.
    if (!words.length) {
      hits.push({ page, order, score: 0, href: `${BASE}${page.path}` })
      return
    }
    // A page answers to the item's name (`data-grid`, what `shadcn add` takes), to its title (`DataGrid`, the doc's
    // heading), and to the name the sidebar shows (`Data Grid`), whichever of them differ.
    const names = [...new Set([page.name, page.title, nameOf(page)].filter(Boolean))].map((name) => name.toLowerCase())
    const pageScore = scoreOf(words, names, "", page.text.toLowerCase())
    if (pageScore) hits.push({ page, order, score: pageScore, href: `${BASE}${page.path}`, text: page.text })
    for (const section of page.sections) {
      const heading = section.heading.toLowerCase()
      const text = section.text.toLowerCase()
      // A section answers for a word in its own heading or text. A word that fits only the page's title is the page's hit, or every section would repeat it.
      if (!words.some((word) => heading.includes(word) || text.includes(word))) continue
      const score = scoreOf(words, names, heading, text)
      if (score) hits.push({ page, order, score, section, href: `${BASE}${page.path}#${section.id}`, text: section.text })
    }
  })
  const best = new Map()
  for (const hit of hits) best.set(hit.page, Math.max(best.get(hit.page) ?? 0, hit.score))
  hits.sort((a, b) => best.get(b.page) - best.get(a.page) || a.order - b.order || b.score - a.score)
  // A query shows its best hits; the empty query is the table of contents, every page of it.
  return words.length ? hits.slice(0, MAX_HITS) : hits
}

/** About a line of the text around the first word that is in it, or its start when none is (the hit was in the heading). */
function snippetOf(text, words) {
  const lower = text.toLowerCase()
  let at = -1
  for (const word of words) {
    const index = lower.indexOf(word)
    if (index >= 0 && (at < 0 || index < at)) at = index
  }
  const start = Math.max(0, at < 0 ? 0 : at - 40)
  const end = Math.min(text.length, start + 120)
  return `${start ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`
}

/** The text as nodes, each word of the query in a mark. */
function marked(text, words) {
  const fragment = document.createDocumentFragment()
  if (!words.length) {
    fragment.append(text)
    return fragment
  }
  const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi")
  let last = 0
  for (const match of text.matchAll(pattern)) {
    fragment.append(text.slice(last, match.index))
    const mark = document.createElement("mark")
    mark.textContent = match[0]
    fragment.append(mark)
    last = match.index + match[0].length
  }
  fragment.append(text.slice(last))
  return fragment
}

function search() {
  const dialog = document.querySelector("dialog.search")
  const button = document.querySelector(".search-button")
  if (!dialog || !button) return
  const input = dialog.querySelector("input")
  const results = dialog.querySelector(".search-results")
  const key = button.querySelector("kbd")
  if (key) key.textContent = MAC ? "⌘K" : "Ctrl K"

  let loading = null
  let pages = null
  let failed = false
  let hits = []
  let active = 0

  const load = () => {
    loading ??= fetch(BASE + SEARCH_INDEX)
      .then((response) => {
        if (!response.ok) throw new Error(`${BASE}${SEARCH_INDEX} answered ${response.status}`)
        return response.json()
      })
      .then((index) => {
        pages = index
      })
      .catch(() => {
        failed = true
        loading = null // Try again the next time the search opens.
      })
      .then(render)
    return loading
  }

  const element = (tag, attributes, className) => {
    const node = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    if (className) node.className = className
    return node
  }

  const note = (text) => {
    const node = element("p", {}, "search-note")
    node.textContent = text
    return node
  }

  /** Highlight one hit; the arrow keys and the pointer both land here. */
  function select(index) {
    if (!hits.length) return
    active = (index + hits.length) % hits.length
    for (const option of results.querySelectorAll("[role='option']")) option.setAttribute("aria-selected", String(Number(option.dataset.hit) === active))
    input.setAttribute("aria-activedescendant", `search-hit-${active}`)
    results.querySelector(`[data-hit="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }

  function render() {
    const query = input.value.trim()
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    results.replaceChildren()
    input.removeAttribute("aria-activedescendant")
    hits = []
    if (!pages) {
      results.append(note(failed ? "The search index did not load." : "Loading…"))
      return
    }
    hits = findHits(pages, query)
    if (!hits.length) {
      results.append(note(`No results for “${query}”.`))
      return
    }
    // With no query the list is the table of contents, grouped like the sidebar; a query groups its hits by page.
    const byPage = words.length > 0
    let group = null
    let current = null
    hits.forEach((hit, index) => {
      const key = byPage ? hit.page : hit.page.group
      if (key !== current) {
        current = key
        group = element("div", { role: "group", "aria-labelledby": `search-page-${index}` })
        const label = element("div", { id: `search-page-${index}` }, "search-page")
        label.append(byPage ? nameOf(hit.page) : hit.page.group)
        if (byPage) {
          const kind = element("span", {}, "kind")
          kind.textContent = hit.page.group
          label.append(kind)
        }
        group.append(label)
        results.append(group)
      }
      const option = element("a", { role: "option", id: `search-hit-${index}`, href: hit.href, "aria-selected": "false" })
      option.dataset.hit = String(index)
      const heading = element("span", {}, "search-hit")
      if (hit.section?.parent) {
        const parent = element("span", {}, "parent")
        parent.textContent = `${hit.section.parent} › `
        heading.append(parent)
      }
      heading.append(marked(hit.section ? hit.section.heading : nameOf(hit.page), words))
      option.append(heading)
      if (hit.text) {
        const snippet = element("span", {}, "search-snippet")
        snippet.append(marked(snippetOf(hit.text, words), words))
        option.append(snippet)
      }
      group.append(option)
    })
    select(0)
  }

  /** Go to a hit: close first, so a heading on this same page scrolls into a page with no dialog over it. */
  function go(hit) {
    dialog.close()
    const url = new URL(hit.href, location.origin)
    if (url.pathname !== location.pathname) {
      location.assign(url.href)
      return
    }
    if (url.hash === location.hash) document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView()
    else location.assign(url.href)
  }

  function open() {
    if (dialog.open) return
    input.value = ""
    active = 0
    dialog.showModal()
    input.focus()
    render()
    if (!pages) load()
  }

  button.addEventListener("click", open)
  // Fetch the index as the pointer reaches the button, so the first open has it.
  button.addEventListener("pointerenter", load, { once: true })
  dialog.querySelector(".search-close").addEventListener("click", () => dialog.close())
  // A click on the backdrop lands on the dialog element itself; one inside lands on a child.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close()
  })
  addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
    event.preventDefault()
    if (dialog.open) dialog.close()
    else open()
  })
  input.addEventListener("input", () => {
    active = 0
    render()
  })
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") select(active + 1)
    else if (event.key === "ArrowUp") select(active - 1)
    else if (event.key === "Enter" && hits[active]) go(hits[active])
    else return
    event.preventDefault()
  })
  results.addEventListener("pointermove", (event) => {
    const option = event.target.closest("[role='option']")
    if (option && Number(option.dataset.hit) !== active) select(Number(option.dataset.hit))
  })
  // A plain click follows the link the browser's way; the dialog closes first so a same-page heading is not scrolled to behind it.
  results.addEventListener("click", (event) => {
    const option = event.target.closest("[role='option']")
    if (!option || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go(hits[Number(option.dataset.hit)])
  })
}

addEventListener("DOMContentLoaded", () => {
  menu()
  versions()
  search()
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
