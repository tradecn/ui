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
  const style = (el: Element, pseudo?: string) => view.getComputedStyle(el, pseudo)
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
  // box. A checkbox, a radio, a slider or a color well shows no text of its own. A file picker shows the browser's
  // words and the chosen file's name, which no rule reads: the floor measures them by their styles instead. Read by
  // tag so an element from another window's realm still counts.
  const isField = (el: Element) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
  const isFilePicker = (el: Element) => el.tagName === "INPUT" && (el as HTMLInputElement).type.toLowerCase() === "file"
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
      // A submit or reset button with no value attribute wears the browser's own word; an empty one wears nothing.
      if (type === "submit" || type === "reset") return input.hasAttribute("value") ? input.value : type === "submit" ? "Submit" : "Reset"
      if (/^(checkbox|radio|range|color|file|image|hidden)$/.test(type)) return ""
    }
    return isField(el) ? (el as HTMLInputElement).value : ""
  }
  // The text an element shows of its own: a field's value, or its own text nodes.
  const textOf = (el: Element) => (isField(el) ? field(el) : own(el))
  // Only a text field or a text area shows its placeholder.
  const placeholderOf = (el: Element) =>
    el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|url|tel|email|password|number)$/.test((el as HTMLInputElement).type.toLowerCase())) ? (el.getAttribute("placeholder") ?? "") : ""
  const svgText = (el: Element) => el.namespaceURI === "http://www.w3.org/2000/svg" && /^(text|tspan|textPath)$/.test(el.tagName)
  const hidden = (el: Element): boolean => {
    if (el.closest("[hidden]")) return true
    // A display: contents element has no box of its own, and what it holds still draws, so its parent decides.
    if (style(el).display === "contents") return style(el).visibility === "hidden" || (el.parentElement ? hidden(el.parentElement) : false)
    if (typeof el.checkVisibility === "function") return !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
    for (let node: Element | null = el; node; node = node.parentElement) {
      const s = style(node)
      if (s.display === "none" || s.visibility === "hidden") return true
    }
    return false
  }
  // A paint that shows nothing: none, transparent, or any color at zero alpha. A browser always resolves a paint, so an
  // empty one is unknown rather than clear.
  const transparent = (paint: string) => paint === "none" || paint === "transparent" || /^rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0*)?\)$/.test(paint) || /\/\s*0(?:\.0*)?%?\s*\)$/.test(paint)
  // A box a reader never sees: faded to nothing, or clipped down to a pixel, the screen-reader-only pattern.
  const unseenBox = (el: Element) => {
    const s = style(el)
    if (s.display === "contents") return false
    if (parseFloat(s.opacity) === 0) return true
    const clips = [s.overflowX, s.overflowY].some((v) => v !== "" && v !== "visible") || /rect\(/.test(s.clip) || (s.clipPath !== "" && s.clipPath !== "none")
    const box = el.getBoundingClientRect()
    return clips && box.width <= 1 && box.height <= 1
  }
  // A number a browser resolves; an empty one is unknown, so it counts as showing.
  const positive = (value: string) => value === "" || parseFloat(value) > 0
  // SVG paint shows when it has a color, an opacity above zero and, for a stroke, a width.
  const fillShows = (s: CSSStyleDeclaration) => !transparent(s.fill) && positive(s.fillOpacity)
  const strokeShows = (s: CSSStyleDeclaration) => !transparent(s.stroke) && positive(s.strokeOpacity) && positive(s.strokeWidth)
  // Glyphs drawn in something other than transparent: a color for text, a fill or a stroke that shows for SVG text.
  const inked = (el: Element) => {
    const s = style(el)
    return svgText(el) ? fillShows(s) || strokeShows(s) : !transparent(s.color)
  }
  // Laid out, and inside no box that fades it or clips it away.
  const placed = (el: Element) => {
    if (hidden(el)) return false
    for (let node: Element | null = el; node; node = node.parentElement) if (unseenBox(node)) return false
    return true
  }
  // Text a reader sees: placed and inked.
  const drawn = (el: Element) => placed(el) && inked(el)
  // An element's role: the first of its role tokens that names a role the browser knows, WAI-ARIA's, Graphics ARIA's
  // or DPUB-ARIA's, in any case, as a browser reads a fallback list such as "switch checkbox". With none, the element
  // keeps its native role, which the rules read by tag.
  const ariaRoles = new Set([
    ..."alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading image img insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox sectionfooter sectionheader separator slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem".split(" "),
    ..."document object symbol".split(" ").map((role) => `graphics-${role}`),
    ..."abstract acknowledgments afterword appendix backlink biblioentry bibliography biblioref chapter colophon conclusion cover credit credits dedication endnote endnotes epigraph epilogue errata example footnote foreword glossary glossref index introduction noteref notice pagebreak pagefooter pageheader pagelist part preface prologue pullquote qna subtitle tip toc".split(" ").map((role) => `doc-${role}`),
  ])
  const roleOf = (el: Element) => (el.getAttribute("role") ?? "").toLowerCase().split(/\s+/).find((token) => ariaRoles.has(token))
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
    const text = (isField(el) ? field(el) || placeholderOf(el) : own(el) || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
    report.findings.push({ rule, where: where(el), text, detail })
  }

  if (rules.has("floor")) {
    for (const el of elements) {
      // A file picker draws the chosen file's name, or the browser's word for none, in its own style, and its button's
      // word in the style ::file-selector-button gives it. Both are measured and neither is read, so no finding carries
      // a file's name.
      if (isFilePicker(el)) {
        if (!placed(el)) continue
        report.checked.floor++
        const parts: [string, CSSStyleDeclaration][] = [["font-size", style(el)], ["the button's font-size", style(el, "::file-selector-button")]]
        const under = parts.filter(([, s]) => s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) !== 0 && !transparent(s.color) && parseFloat(s.fontSize) < floor - 0.01)
        if (under.length) find("floor", el, `${under.map(([part, s]) => `${part} ${s.fontSize}`).join(" and ")} ${under.length > 1 ? "are" : "is"} under the ${floor} px floor`)
        continue
      }
      const value = textOf(el)
      const text = value || placeholderOf(el)
      if (!text) continue
      // An empty field draws its placeholder in the style ::placeholder gives it, with its own size, color and opacity.
      const pseudo = value ? undefined : "::placeholder"
      const s = style(el, pseudo)
      if (pseudo ? !placed(el) || transparent(s.color) || parseFloat(s.opacity) === 0 : !drawn(el)) continue
      report.checked.floor++
      const size = s.fontSize
      // SVG text takes its size in the viewBox's units, so it is measured as drawn, through the scale above it.
      const matrix = svgText(el) ? (el as SVGGraphicsElement).getScreenCTM?.() : null
      const px = matrix ? parseFloat(size) * Math.hypot(matrix.c, matrix.d) : parseFloat(size)
      if (px < floor - 0.01) find("floor", el, `font-size ${size}${Math.abs(px - parseFloat(size)) > 0.01 ? ` draws at ${px.toFixed(1)}px, which` : ""} is under the ${floor} px floor`)
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
    // The colors a property resolves the direction tokens to, each with the directions it stands for: one, or both where
    // a theme draws up and down alike.
    const paints = (property: "color" | "backgroundColor" | "fill" | "stroke", tokens: readonly string[]) => {
      const found = new Map<string, Set<string>>()
      for (const token of tokens) {
        const value = resolve(property, token)
        if (value) found.set(value, new Set([...(found.get(value) ?? []), token.replace(/-soft$/, "")]))
      }
      return found
    }
    // Text is drawn in its color, and SVG text in its fill and stroke whatever its color says.
    const inks = { color: paints("color", ["up", "down"]), fill: paints("fill", ["up", "down"]), stroke: paints("stroke", ["up", "down"]) }
    const fills = paints("backgroundColor", ["up", "down", "up-soft", "down-soft"])
    probe.remove()
    // The direction ink an element's glyphs are drawn in, the property that carries it, and the directions it stands for.
    const inkOf = (el: Element) => {
      const s = style(el)
      const shows = { color: true, fill: fillShows(s), stroke: strokeShows(s) }
      for (const property of svgText(el) ? (["fill", "stroke"] as const) : (["color"] as const)) {
        const directions = shows[property] ? inks[property].get(s[property]) : undefined
        if (directions) return { property, value: s[property], directions }
      }
      return null
    }
    // The first background behind the text, however far out, up to the checked root: a tinted cell, a flash, a badge. A
    // direction fill comes with the directions it stands for.
    const fillBehind = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const background = style(node).backgroundColor
        if (background && !transparent(background)) {
          const directions = fills.get(background)
          return directions ? { node, color: background, directions } : null
        }
        if (node === scope) break
      }
      return null
    }
    // A value with a number in it is held to the rule whatever its units say. A word that states the direction is a
    // cue of its own, the way a sign or an arrow is.
    const saysDirection = /\b(?:up|down|buys?|sells?|bought|sold|bids?|asks?|offers?|offered|long|short|paid|given|gains?|loss(?:es)?|rises?|falls?|higher|lower)\b/i
    // A cue in marks or words: a leading sign, a sign on a number further in (a currency symbol may sit between), an
    // arrow, or a word that states the direction. A dash inside a number, as in 99-16, is no sign.
    const cued = (text: string) => /^[+\-−]/.test(text) || /[^\w.,][+\-−][$€£¥₹]?\d/.test(text) || /[▲▼△▽↑↓]/.test(text) || saysDirection.test(text)
    // The cell and the row that hold a value, by role, or by tag where the element has none.
    const holder = (el: Element, roles: RegExp, tags: RegExp) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const role = roleOf(node)
        if (role ? roles.test(role) : tags.test(node.tagName)) return node
      }
      return null
    }
    const cellOf = (el: Element) => holder(el, /^(gridcell|cell|columnheader|rowheader)$/, /^(TD|TH)$/)
    const rowOf = (el: Element) => holder(el, /^row$/, /^TR$/)
    // A direction marker counts on the value, anywhere in its colored run, or on the cell or the row that holds it,
    // never on a container that has a side of its own, such as a ticket for a buy.
    const marked = (el: Element, run: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.matches("[data-direction], [data-side]")) return true
        if (node === run) break
      }
      return [cellOf(el), rowOf(el)].some((node) => node?.matches("[data-direction], [data-side]"))
    }
    // ARIA prohibits naming a generic element, a span or a div without a role, so a screen reader reading the text never
    // hears an aria-label there. A description reaches it: aria-description, aria-describedby, a title.
    const unnamed = /^(generic|presentation|none|paragraph|caption|code|deletion|emphasis|insertion|strong|subscript|superscript)$/
    const genericTags = new Set(["SPAN", "DIV", "B", "I", "U", "S", "SMALL", "EM", "STRONG", "CODE", "DEL", "INS", "SUB", "SUP", "P", "Q", "SAMP", "VAR", "BDI", "BDO", "DATA"])
    const nameable = (node: Element) => {
      const role = roleOf(node)
      return role ? !unnamed.test(role) : !genericTags.has(node.tagName)
    }
    // A screen reader skips everything under aria-hidden, its labels and descriptions with its text.
    const unheard = (node: Element) => Boolean(node.closest("[aria-hidden=true]"))
    // An accessible label or description that states the direction: its own, one it points to, or a native label.
    const says = (node: Element | null) =>
      Boolean(
        node &&
          !unheard(node) &&
          [nameable(node) ? node.getAttribute("aria-label") : null, nameable(node) ? refs(node, "aria-labelledby") : "", node.getAttribute("aria-description"), node.getAttribute("title"), refs(node, "aria-describedby"), nativeLabels(node)].some((text) => text && cued(text)),
      )
    // A grid rule's tone is the rule's color, not a direction. The rule names itself in data-rule and data-tone and says
    // what it matched in its description, the channel scripts/color.test.ts records for it. Only the rule nearest the
    // value, on it or in its colored run, counts, and only when its tone is the direction color that was found.
    const ruled = (el: Element, run: Element, directions: Set<string>) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.matches("[data-rule]")) return !unheard(node) && directions.has(node.getAttribute("data-tone") ?? "") && Boolean((node.getAttribute("aria-description") ?? "").trim() || refs(node, "aria-describedby"))
        if (node === run) break
      }
      return false
    }
    // A label that states the direction counts on the value or anywhere in its colored run, and, read on their own, on
    // the cell and the row that hold it.
    const saysAlong = (el: Element, run: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (says(node)) return true
        if (node === run) break
      }
      return false
    }
    // What a run shows, in order: its text, with a field's value where the field sits. Hidden parts reach nobody, so
    // they show nothing. Asked for what a sighted reader sees, it also leaves out a box that fades or clips away (the
    // screen-reader-only pattern) and glyphs inked in nothing, and reads through a boxless display: contents wrapper.
    // Under aria-hidden, which a screen reader skips, only what a sighted reader sees shows.
    // Its pieces join with gap: nothing, to read a sign as drawn, so a 99 and a -16 in two spans stay one price, or a
    // space, to read words, so an Up and a 10 in two spans stay two words, as a text alternative joins them.
    const shown = (node: Node, visible: boolean, gap: string): string => {
      if (node.nodeType === 3) return !visible || !node.parentElement || inked(node.parentElement) ? (node.textContent ?? "") : ""
      if (node.nodeType !== 1) return ""
      const el = node as Element
      const sighted = visible || el.getAttribute("aria-hidden") === "true"
      if (hidden(el) || (sighted && unseenBox(el))) return ""
      if (isField(el)) return !sighted || inked(el) ? field(el) : ""
      return [...el.childNodes].map((child) => shown(child, sighted, gap)).join(gap)
    }
    for (const el of elements) {
      const text = textOf(el)
      if (!/\d/.test(text) || !drawn(el)) continue
      const ink = inkOf(el)
      const tint = ink ? null : fillBehind(el)
      const paint = ink ?? tint
      if (!paint) continue
      const painted = ink?.value ?? tint?.color
      report.checked.direction++
      // The colored run: a tinted box whole, or the element and up to three wrappers around it that share its ink, the
      // checked root among them, so a sign in a sibling span counts and a panel painted one color doesn't become one run.
      let run: Element = tint?.node ?? el
      if (ink) for (let depth = 0; depth < 3 && run !== scope && run.parentElement && style(run.parentElement)[ink.property] === ink.value; depth++) run = run.parentElement
      const seen = (gap: string) => shown(run, Boolean(options.visibleCue) || unheard(run), gap)
      if (cued(seen("").trim()) || saysDirection.test(seen(" "))) continue
      if (!options.visibleCue && (marked(el, run) || ruled(el, run, paint.directions) || saysAlong(el, run) || says(cellOf(el)) || says(rowOf(el)))) continue
      find("direction", el, `painted ${painted} with no sign, arrow, word${options.visibleCue ? "" : ", data-direction or label"} saying the direction`)
    }
  }

  if (rules.has("name")) {
    const editable = "[contenteditable]:not([contenteditable=false])"
    const control = (el: Element) =>
      el.matches(`button, a[href], details > summary, input:not([type=hidden]), select, textarea, ${editable}`) ||
      /^(button|link|checkbox|radio|switch|tab|treeitem|menuitem|menuitemcheckbox|menuitemradio|option|combobox|slider|spinbutton|textbox|searchbox|grid|treegrid|listbox|tree)$/.test(roleOf(el) ?? "")
    // A field's value is not its name, and neither is the text inside a combobox, a slider, a grid, a list box or an
    // editable region: only the other controls take a name from their content, and only from the part of it that
    // isn't hidden.
    const authorNamed = (el: Element) => el.matches(`input, select, textarea, ${editable}`) || /^(combobox|slider|spinbutton|textbox|searchbox|grid|treegrid|listbox|tree)$/.test(roleOf(el) ?? "")
    for (const el of elements) {
      if (!control(el) || el.closest("[aria-hidden=true], [inert]") || hidden(el)) continue
      report.checked.name++
      // A button-like input is named by the words it shows, and an image input by its alt.
      const type = el.tagName === "INPUT" ? (el as HTMLInputElement).type.toLowerCase() : ""
      const value = /^(submit|reset|button)$/.test(type) ? field(el) : type === "image" ? (el.getAttribute("alt") ?? "") : ""
      const name = [refs(el, "aria-labelledby"), el.getAttribute("aria-label"), nativeLabels(el), el.getAttribute("title"), placeholderOf(el), value, authorNamed(el) ? "" : textAlternative(el, { referenced: false, hiddenOk: false })].map((part) => (part ?? "").trim()).find(Boolean)
      if (!name) find("name", el, `${roleOf(el) ?? el.tagName.toLowerCase()} with no accessible name`)
    }
  }

  return report
}
