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
   * Holds direction to what a reader sees: a leading sign, an arrow or a word in the visible text. Off by default,
   * when `data-direction`, `data-side` and an accessible label or description count too, as they do in the contract.
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

  // A select's options show through the select, which the rules read as a field.
  const skip = new Set(["HEAD", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TITLE", "META", "LINK", "OPTION", "OPTGROUP", "DATALIST"])
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
  // What a field shows: the value of an input or a text area, a drop-down's chosen option, or every option of a list
  // box. A checkbox, a radio, a slider, a color well or a file picker shows no text of its own. Read by tag so an
  // element from another window's realm still counts.
  const isField = (el: Element) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
  const field = (el: Element) => {
    if (el.tagName === "SELECT") {
      const select = el as HTMLSelectElement
      const showing = select.multiple || select.size > 1 ? [...select.options] : [select.options[select.selectedIndex]]
      return showing.map((option) => (option ? option.label || (option.textContent ?? "") : "")).join(" ").trim()
    }
    if (el.tagName === "INPUT") {
      const input = el as HTMLInputElement
      const type = input.type.toLowerCase()
      // A password shows as dots, so the check sees that it holds something and never what.
      if (type === "password") return input.value ? "••••" : ""
      // A submit or reset button with no value wears the browser's own word.
      if (type === "submit" || type === "reset") return input.value || (type === "submit" ? "Submit" : "Reset")
      if (/^(checkbox|radio|range|color|file|image|hidden)$/.test(type)) return ""
    }
    return isField(el) ? (el as HTMLInputElement).value : ""
  }
  // The text an element shows of its own: a field's value, or its own text nodes.
  const textOf = (el: Element) => (isField(el) ? field(el) : own(el))
  const svgText = (el: Element) => el.namespaceURI === "http://www.w3.org/2000/svg" && /^(text|tspan|textPath)$/.test(el.tagName)
  const hidden = (el: Element) => {
    if (el.closest("[hidden]")) return true
    if (typeof el.checkVisibility === "function") return !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
    for (let node: Element | null = el; node; node = node.parentElement) {
      const s = style(node)
      if (s.display === "none" || s.visibility === "hidden") return true
    }
    return false
  }
  // A node's text alternative, read the way the accessible name computation reads it: a hidden part says nothing
  // unless a reference points straight at it, an element's own label outranks its text, an image says its alt, a
  // field says what it holds, and a reference is followed one level deep. The control being named stays out of it.
  const textAlternative = (node: Node, walk: { referenced: boolean; hiddenOk: boolean; self?: Element }): string => {
    if (node.nodeType === 3) return node.textContent ?? ""
    if (node.nodeType !== 1) return ""
    const el = node as Element
    if (el === walk.self) return ""
    // An SVG's title names it though it is never drawn.
    if (el.namespaceURI === "http://www.w3.org/2000/svg" && el.tagName === "title") return el.textContent ?? ""
    if (!walk.hiddenOk && (el.getAttribute("aria-hidden") === "true" || hidden(el))) return ""
    const pointed = walk.referenced ? "" : refs(el, "aria-labelledby")
    if (pointed) return pointed
    const label = (el.getAttribute("aria-label") ?? "").trim()
    if (label) return label
    if (el.tagName === "IMG" || (el.tagName === "INPUT" && (el as HTMLInputElement).type.toLowerCase() === "image")) return el.getAttribute("alt") ?? ""
    if (isField(el)) return field(el)
    return [...el.childNodes].map((child) => textAlternative(child, walk)).join(" ")
  }
  // The text alternative of the elements an ID list points to, as aria-labelledby and aria-describedby read them. An
  // element pointed at counts even when hidden, and a reference to nothing reads as nothing.
  const refs = (el: Element, attribute: string): string =>
    (el.getAttribute(attribute) ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const target = doc.getElementById(id)
        return target ? textAlternative(target, { referenced: true, hiddenOk: target.getAttribute("aria-hidden") === "true" || hidden(target) }) : ""
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  // The text of the <label>s a form control has, wrapping it or pointing at it with for, the control left out.
  const nativeLabels = (el: Element) =>
    "labels" in el
      ? [...((el as HTMLInputElement).labels ?? [])]
          .map((label) => textAlternative(label, { referenced: false, hiddenOk: false, self: el }))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      : ""
  const where = (el: Element) => {
    const slot = el.closest("[data-slot^='tradecn-']")?.getAttribute("data-slot") ?? "page"
    const attrs = [...el.attributes]
      .filter((a) => a.name.startsWith("data-") && a.name !== "data-slot")
      .map((a) => `[${a.name}${a.value ? `=${a.value.slice(0, 40)}` : ""}]`)
      .join("")
    return `${slot} ${el.tagName.toLowerCase()}${attrs}`
  }
  const find = (rule: ContractRule, el: Element, detail: string) => {
    const text = (isField(el) ? field(el) : own(el) || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
    report.findings.push({ rule, where: where(el), text, detail })
  }

  if (rules.has("floor")) {
    for (const el of elements) {
      const text = textOf(el) || (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? (el.getAttribute("placeholder") ?? "") : "")
      if (!text || hidden(el)) continue
      report.checked.floor++
      const size = style(el).fontSize
      // SVG text takes its size in the viewBox's units, so it is measured as drawn, through the scale above it.
      const matrix = svgText(el) ? (el as SVGGraphicsElement).getScreenCTM?.() : null
      const drawn = matrix ? parseFloat(size) * Math.hypot(matrix.c, matrix.d) : parseFloat(size)
      if (drawn < floor - 0.01) find("floor", el, `font-size ${size}${Math.abs(drawn - parseFloat(size)) > 0.01 ? ` draws at ${drawn.toFixed(1)}px, which` : ""} is under the ${floor} px floor`)
    }
  }

  // The site's smoke check, for a consumer's page: every element under a tradecn slot whose own text holds a
  // digit, every field under one holding a number, and every node marked data-numeric.
  if (rules.has("numeric")) {
    for (const el of elements) {
      const marked = el.hasAttribute("data-numeric")
      if (!marked && !el.closest("[data-slot^='tradecn-']")) continue
      if (!marked && !/\d/.test(textOf(el))) continue
      report.checked.numeric++
      const variant = style(el).fontVariantNumeric
      if (!variant.includes("lining-nums") || !variant.includes("tabular-nums")) find("numeric", el, `font-variant-numeric is "${variant}", where lining-nums tabular-nums belongs`)
    }
  }

  // A value painted with a direction token, its text or the fill behind it, needs another channel. Text with no
  // number in it (Buy, Live, Filled) carries its own meaning, so it isn't held to it. The tokens are resolved
  // through a probe so the comparison uses the same serialization the page's own colors do.
  if (rules.has("direction")) {
    const probe = doc.createElement("span")
    probe.style.display = "none"
    ;(doc.body ?? doc.documentElement).append(probe)
    const resolve = (property: "color" | "backgroundColor" | "fill" | "stroke", token: string) => {
      if (!rootStyle.getPropertyValue(`--${token}`).trim()) return null
      probe.style[property] = `var(--${token})`
      const value = style(probe)[property]
      probe.style[property] = ""
      return value
    }
    const both = (property: "color" | "fill" | "stroke") => new Set([resolve(property, "up"), resolve(property, "down")].filter((value): value is string => Boolean(value)))
    // Text is drawn in its color, and SVG text in its fill and stroke whatever its color says.
    const inks = { color: both("color"), fill: both("fill"), stroke: both("stroke") }
    const fills = new Set(["up", "down", "up-soft", "down-soft"].map((token) => resolve("backgroundColor", token)).filter((value): value is string => Boolean(value)))
    probe.remove()
    // The direction ink an element's glyphs are drawn in, and the property that carries it.
    const inkOf = (el: Element) => {
      const s = style(el)
      for (const property of svgText(el) ? (["fill", "stroke"] as const) : (["color"] as const)) if (inks[property].has(s[property])) return { property, value: s[property] }
      return null
    }
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
    // A value with a number in it is held to the rule whatever its units say. A word that states the direction is a
    // cue of its own, the way a sign or an arrow is.
    const saysDirection = /\b(?:up|down|buys?|sells?|bought|sold|bids?|asks?|offers?|offered|long|short|paid|given|gains?|loss(?:es)?|rises?|falls?|higher|lower)\b/i
    const cell = "[role=gridcell], [role=cell], [role=row], td, th, tr"
    // An accessible label or description that says something: its own, one it points to, or a native label.
    const labelled = (node: Element | null) =>
      Boolean(node && [node.getAttribute("aria-label"), node.getAttribute("aria-description"), node.getAttribute("title"), refs(node, "aria-labelledby"), refs(node, "aria-describedby"), nativeLabels(node)].some((text) => text?.trim()))
    // What a run shows, in order: its text, with a field's value where the field sits. Hidden parts reach nobody, so
    // they show nothing. Asked for what a sighted reader sees, it also leaves out screen-reader-only runs (a clipped
    // box of a pixel or less) and transparent ones.
    const shown = (node: Node, visible: boolean): string => {
      if (node.nodeType === 3) return node.textContent ?? ""
      if (node.nodeType !== 1) return ""
      const el = node as Element
      if (hidden(el)) return ""
      if (isField(el)) return field(el)
      if (visible) {
        const box = el.getBoundingClientRect()
        if (box.width <= 1 && box.height <= 1 && el.childNodes.length) return ""
        if (parseFloat(style(el).opacity) === 0) return ""
      }
      return [...el.childNodes].map((child) => shown(child, visible)).join("")
    }
    for (const el of elements) {
      const text = textOf(el)
      if (!/\d/.test(text) || hidden(el)) continue
      const ink = inkOf(el)
      const tint = ink ? null : fillBehind(el)
      if (!ink && !tint) continue
      const painted = ink?.value ?? tint?.color
      report.checked.direction++
      // The colored run: a tinted box whole, or the element and the ancestors that share its ink, so a sign in a
      // sibling span counts.
      let run: Element = tint?.node ?? el
      if (ink) for (let depth = 0; depth < 3 && run.parentElement && run.parentElement !== scope && style(run.parentElement)[ink.property] === ink.value; depth++) run = run.parentElement
      const seen = shown(run, Boolean(options.visibleCue)).trim()
      if (/^[+\-−]/.test(seen) || /[▲▼△▽↑↓]/.test(seen) || saysDirection.test(seen)) continue
      if (!options.visibleCue && (el.closest("[data-direction], [data-side]") || labelled(el) || labelled(el.closest(cell)))) continue
      find("direction", el, `painted ${painted} with no sign, arrow, word${options.visibleCue ? "" : ", data-direction or label"} saying the direction`)
    }
  }

  if (rules.has("name")) {
    const control =
      "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=combobox], [role=slider], [role=spinbutton], [role=textbox], [role=searchbox]"
    // A field's value is not its name, and neither is a combobox's or a slider's text: only the other controls take
    // a name from their content, and only from the part of it that isn't hidden.
    const authorNamed = "input, select, textarea, [role=combobox], [role=slider], [role=spinbutton], [role=textbox], [role=searchbox]"
    for (const el of elements) {
      if (!el.matches(control) || el.closest("[aria-hidden=true], [inert]") || hidden(el)) continue
      report.checked.name++
      // A button-like input is named by the words it shows, and an image input by its alt.
      const type = el.tagName === "INPUT" ? (el as HTMLInputElement).type.toLowerCase() : ""
      const value = /^(submit|reset|button)$/.test(type) ? field(el) : type === "image" ? (el.getAttribute("alt") ?? "") : ""
      const name = [refs(el, "aria-labelledby"), el.getAttribute("aria-label"), nativeLabels(el), el.getAttribute("title"), el.getAttribute("placeholder"), value, el.matches(authorNamed) ? "" : textAlternative(el, { referenced: false, hiddenOk: false })].map((part) => (part ?? "").trim()).find(Boolean)
      if (!name) find("name", el, `${el.getAttribute("role") ?? el.tagName.toLowerCase()} with no accessible name`)
    }
  }

  return report
}
