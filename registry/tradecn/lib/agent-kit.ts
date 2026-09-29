// The contract read off a rendered screen: what a coding agent, or an end-to-end test, checks on a page built
// with tradecn before calling the work done. Text under the size floor, a number set in figures that are not
// lining and tabular, a value colored by direction with nothing else saying which way, and a control with no
// accessible name. The rules are 14 and 15 of the item contract plus the name every control needs.
//
// The whole check is one function with nothing outside it, so a test can hand it to the browser as it stands:
// `page.evaluate(checkContract, { root: "main" })`. The helpers live inside it for that reason.

/** The checks, by name. `floor` and `numeric` are rule 14, `direction` is rule 15, `name` is every control's accessible name. */
export type ContractRule = "floor" | "numeric" | "direction" | "name"

/** Every rule, in the order the report counts them. */
export const CONTRACT_RULES: readonly ContractRule[] = ["floor", "numeric", "direction", "name"]

export interface ContractOptions {
  /** The subtree to check: an element, or a selector for one. The whole document when omitted. */
  root?: ParentNode | string
  /** The rules to run. All four when omitted. */
  rules?: readonly ContractRule[]
  /** The smallest text size in px. Omitted, it is `--tradecn-text-size-grid-min`, or 12 when that is unset. */
  floorPx?: number
  /** A selector for subtrees to leave out. `[data-contract-ignore]` when omitted, and an empty string leaves nothing out. */
  ignore?: string
  /**
   * Holds direction to what a reader sees: a leading sign or an arrow in the visible text. Off by default, when
   * `data-direction`, `data-side` and an accessible label or description count too, as they do in the contract.
   */
  visibleCue?: boolean
}

export interface ContractFinding {
  rule: ContractRule
  /** The nearest tradecn slot, then the element's tag and its data attributes. */
  where: string
  /** The element's text, trimmed to 80 characters. */
  text: string
  /** What is wrong, in words. */
  detail: string
}

export interface ContractReport {
  findings: ContractFinding[]
  /** How many elements each rule looked at, so a check that looked at nothing shows as zero rather than as a pass. */
  checked: Record<ContractRule, number>
}

/**
 * Check a rendered subtree against the contract and return what breaks it. Runs in the page: in a component, a
 * test's `page.evaluate`, or a browser console. Throws when `root` names nothing, so a mistyped selector fails.
 */
export function checkContract(options: ContractOptions = {}): ContractReport {
  const rules = new Set<ContractRule>(options.rules ?? ["floor", "numeric", "direction", "name"])
  const scope: ParentNode | null = typeof options.root === "string" ? document.querySelector(options.root) : (options.root ?? document)
  if (!scope) throw new Error(`checkContract: nothing matches ${String(options.root)}`)
  const doc = (scope as Node).ownerDocument ?? (scope as Document)
  const view = doc.defaultView ?? window
  const style = (el: Element) => view.getComputedStyle(el)
  const rootStyle = style(doc.documentElement)
  const floor = options.floorPx ?? (parseFloat(rootStyle.getPropertyValue("--tradecn-text-size-grid-min")) || 12)
  const ignore = options.ignore ?? "[data-contract-ignore]"
  const report: ContractReport = { findings: [], checked: { floor: 0, numeric: 0, direction: 0, name: 0 } }

  const skip = new Set(["HEAD", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TITLE", "META", "LINK"])
  const all = [...("tagName" in scope ? [scope as Element] : []), ...scope.querySelectorAll("*")]
  const elements = all.filter((el) => !skip.has(el.tagName.toUpperCase()) && !(ignore && el.closest(ignore)))

  // An element's own text, apart from its children's, with the whitespace folded.
  const own = (el: Element) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim()
  // What a field holds, read by tag so an element from another window's realm still counts.
  const field = (el: Element) => (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? (el as HTMLInputElement).value : "")
  const hidden = (el: Element) => {
    if (el.closest("[hidden]")) return true
    if (typeof el.checkVisibility === "function") return !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
    for (let node: Element | null = el; node; node = node.parentElement) {
      const s = style(node)
      if (s.display === "none" || s.visibility === "hidden") return true
    }
    return false
  }
  const where = (el: Element) => {
    const slot = el.closest("[data-slot^='tradecn-']")?.getAttribute("data-slot") ?? "page"
    const attrs = [...el.attributes]
      .filter((a) => a.name.startsWith("data-") && a.name !== "data-slot")
      .map((a) => `[${a.name}${a.value ? `=${a.value.slice(0, 40)}` : ""}]`)
      .join("")
    return `${slot} ${el.tagName.toLowerCase()}${attrs}`
  }
  const find = (rule: ContractRule, el: Element, detail: string) => {
    const text = (own(el) || field(el) || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
    report.findings.push({ rule, where: where(el), text, detail })
  }

  if (rules.has("floor")) {
    for (const el of elements) {
      const text = own(el) || field(el) || (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? (el.getAttribute("placeholder") ?? "") : "")
      if (!text || hidden(el)) continue
      report.checked.floor++
      const size = style(el).fontSize
      if (parseFloat(size) < floor - 0.01) find("floor", el, `font-size ${size} is under the ${floor} px floor`)
    }
  }

  // The site's smoke check, for a consumer's page: every element under a tradecn slot whose own text holds a
  // digit, every field under one holding a number, and every node marked data-numeric.
  if (rules.has("numeric")) {
    for (const el of elements) {
      const marked = el.hasAttribute("data-numeric")
      if (!marked && !el.closest("[data-slot^='tradecn-']")) continue
      if (!marked && !/\d/.test(own(el)) && !/\d/.test(field(el))) continue
      report.checked.numeric++
      const variant = style(el).fontVariantNumeric
      if (!variant.includes("lining-nums") || !variant.includes("tabular-nums")) find("numeric", el, `font-variant-numeric is "${variant}", where lining-nums tabular-nums belongs`)
    }
  }

  // A value painted with a direction token, its text or the fill behind it, needs another channel. Words carry
  // their own meaning (Buy, Live, Filled), so only a value that reads as a number is held to it. The tokens are
  // resolved through a probe so the comparison uses the same serialization the page's own colors do.
  if (rules.has("direction")) {
    const probe = doc.createElement("span")
    probe.style.display = "none"
    ;(doc.body ?? doc.documentElement).append(probe)
    const resolve = (property: "color" | "backgroundColor", token: string) => {
      if (!rootStyle.getPropertyValue(`--${token}`).trim()) return null
      probe.style[property] = `var(--${token})`
      const value = style(probe)[property]
      probe.style[property] = ""
      return value
    }
    const inks = new Set([resolve("color", "up"), resolve("color", "down")].filter((value): value is string => Boolean(value)))
    const fills = new Set(["up", "down", "up-soft", "down-soft"].map((token) => resolve("backgroundColor", token)).filter((value): value is string => Boolean(value)))
    probe.remove()
    const clear = (value: string) => value === "" || value === "transparent" || /^rgba\(0, 0, 0, 0\)$/.test(value)
    // The first background behind the text, within a few levels: a tinted cell, a flash, a badge.
    const fillBehind = (el: Element) => {
      let node: Element | null = el
      for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        const background = style(node).backgroundColor
        if (!clear(background)) return fills.has(background) ? { node, color: background } : null
      }
      return null
    }
    // A number with its units: digits, separators, a sign, and the short suffixes quotes carry (bp, mm, %).
    const numberLike = (text: string) => /\d/.test(text) && !/[A-Za-z]{2,}/.test(text.replace(/\b(?:bps?|mm|bn|[kmbx])\b/gi, ""))
    const cell = "[role=gridcell], [role=cell], [role=row], td, th, tr"
    const labelled = (node: Element | null) => Boolean(node && ["aria-label", "aria-description", "aria-describedby", "title"].some((name) => node.getAttribute(name)?.trim()))
    // Text a sighted reader sees, leaving out screen-reader-only runs: a clipped box of a pixel or less.
    const visibleText = (node: Node): string => {
      if (node.nodeType === 3) return node.textContent ?? ""
      if (node.nodeType !== 1) return ""
      const el = node as Element
      const box = el.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1 && el.childNodes.length) return ""
      return [...el.childNodes].map(visibleText).join("")
    }
    for (const el of elements) {
      const text = own(el)
      if (!text || !numberLike(text) || hidden(el)) continue
      const s = style(el)
      const tint = inks.has(s.color) ? null : fillBehind(el)
      if (!inks.has(s.color) && !tint) continue
      const painted = tint ? tint.color : s.color
      report.checked.direction++
      // The colored run: a tinted box whole, or the element and the ancestors that share its ink, so a sign in a
      // sibling span counts.
      let run: Element = tint?.node ?? el
      if (!tint) for (let depth = 0; depth < 3 && run.parentElement && run.parentElement !== scope && style(run.parentElement).color === s.color; depth++) run = run.parentElement
      const seen = (options.visibleCue ? visibleText(run) : (run.textContent ?? "")).trim()
      if (/^[+\-−]/.test(seen) || /[▲▼△▽↑↓]/.test(seen)) continue
      if (!options.visibleCue && (el.closest("[data-direction], [data-side]") || labelled(el) || labelled(el.closest(cell)))) continue
      find("direction", el, `painted ${painted} with no sign, arrow${options.visibleCue ? "" : ", data-direction or label"} saying the direction`)
    }
  }

  if (rules.has("name")) {
    const control =
      "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=combobox], [role=slider], [role=spinbutton], [role=textbox], [role=searchbox]"
    const spoken = (node: Node): string => {
      if (node.nodeType === 3) return node.textContent ?? ""
      if (node.nodeType !== 1) return ""
      const el = node as Element
      if (el.getAttribute("aria-hidden") === "true") return ""
      if (el.tagName === "IMG") return el.getAttribute("alt") ?? ""
      return [...el.childNodes].map(spoken).join(" ")
    }
    for (const el of elements) {
      if (!el.matches(control) || el.closest("[aria-hidden=true], [inert]") || hidden(el)) continue
      report.checked.name++
      const byId = (el.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => doc.getElementById(id)?.textContent ?? "")
        .join(" ")
      const labels = "labels" in el ? [...((el as HTMLInputElement).labels ?? [])].map((label) => label.textContent ?? "").join(" ") : ""
      const value = el.tagName === "INPUT" && /^(button|submit|reset)$/i.test((el as HTMLInputElement).type) ? (el as HTMLInputElement).value : ""
      const name = [byId, el.getAttribute("aria-label"), labels, el.getAttribute("title"), el.getAttribute("placeholder"), value, spoken(el)].map((part) => (part ?? "").trim()).find(Boolean)
      if (!name) find("name", el, `${el.getAttribute("role") ?? el.tagName.toLowerCase()} with no accessible name`)
    }
  }

  return report
}
