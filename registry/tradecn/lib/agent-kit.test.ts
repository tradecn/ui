import { afterEach, describe, expect, it } from "vitest"
import { CONTRACT_RULES, checkContract, type ContractRule } from "@/registry/tradecn/lib/agent-kit"

// happy-dom computes font sizes, numeric variants and custom properties, which is what the floor, numeric and name
// rules read. It does not resolve var() inside a color, so the direction rule is proved in real browsers by the
// smoke scene, in every installed style and theme.

function mount(html: string) {
  document.head.innerHTML = "<style>:root { --tradecn-text-size-grid-min: 12px } .num { font-variant-numeric: lining-nums tabular-nums }</style>"
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

const rulesOf = (root: ParentNode, options: Parameters<typeof checkContract>[0] = {}) => [...new Set(checkContract({ root, ...options }).findings.map((f) => f.rule))].sort()

afterEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("checkContract", () => {
  it("names every rule in the order the report counts them", () => {
    expect(CONTRACT_RULES).toEqual(["floor", "numeric", "direction", "name"])
    expect(Object.keys(checkContract({ root: mount("<div></div>") }).checked)).toEqual([...CONTRACT_RULES])
  })

  it("finds text under the floor, reading the floor from the token or the option", () => {
    const root = mount('<div><p style="font-size: 10px">small print</p><p style="font-size: 12px">readable</p><p style="font-size: 12px"></p></div>')
    const report = checkContract({ root, rules: ["floor"] })
    expect(report.checked.floor).toBe(2)
    expect(report.findings).toEqual([{ rule: "floor", where: "page p", text: "small print", detail: "font-size 10px is under the 12 px floor" }])
    expect(checkContract({ root, rules: ["floor"], floorPx: 13 }).findings.map((f) => f.text)).toEqual(["small print", "readable"])
  })

  it("counts a field's value and placeholder as text", () => {
    const root = mount('<div><input style="font-size: 10px" value="25"><input style="font-size: 10px" placeholder="Size"><input style="font-size: 10px"></div>')
    expect(checkContract({ root, rules: ["floor"] }).checked.floor).toBe(2)
  })

  it("reads a drop-down by its chosen option and a list box by every option, and a checkbox or a slider as showing no text", () => {
    const root = mount(
      [
        '<div data-slot="tradecn-demo">',
        '<select style="font-size: 10px" aria-label="Size"><option>5</option><option selected>10</option></select>',
        '<select multiple style="font-size: 10px" aria-label="Venues"><option>A 1</option><option>B 2</option></select>',
        '<input type="checkbox" style="font-size: 10px" aria-label="Pin"><input type="range" value="50" aria-label="Width">',
        "</div>",
      ].join(""),
    )
    const floor = checkContract({ root, rules: ["floor"] })
    expect(floor.checked.floor).toBe(2)
    expect(floor.findings.map((f) => [f.where, f.text])).toEqual([
      ["tradecn-demo select", "10"],
      ["tradecn-demo select", "A 1 B 2"],
    ])
    expect(checkContract({ root, rules: ["numeric"] }).findings.map((f) => f.text)).toEqual(["10", "A 1 B 2"])
  })

  it("leaves text nobody can see out of the floor", () => {
    const root = mount('<div><p style="font-size: 10px; display: none">gone</p><div hidden><p style="font-size: 10px">tucked</p></div></div>')
    expect(checkContract({ root, rules: ["floor"] }).checked.floor).toBe(0)
  })

  it("holds digits under a tradecn slot, and every data-numeric node, to lining tabular figures", () => {
    const root = mount(
      '<div><div data-slot="tradecn-demo"><span data-cell="bid">99-16+</span><span class="num">99-17</span><span>Bid</span><input value="25"></div><span data-numeric="">1,250</span><span>12 outside</span></div>',
    )
    const report = checkContract({ root, rules: ["numeric"] })
    expect(report.checked.numeric).toBe(4)
    expect(report.findings.map((f) => [f.where, f.text])).toEqual([
      ["tradecn-demo span[data-cell=bid]", "99-16+"],
      ["tradecn-demo input", "25"],
      ["page span[data-numeric]", "1,250"],
    ])
    expect(report.findings[0]?.detail).toMatch(/where lining-nums tabular-nums belongs/)
  })

  it("finds a control with no accessible name, and every way to give one", () => {
    const root = mount(
      [
        "<div>",
        '<button data-id="bare"><svg aria-hidden="true"></svg></button>',
        '<button aria-label="Refresh"><svg aria-hidden="true"></svg></button>',
        "<button>Send</button>",
        '<span id="lbl">Size</span><input aria-labelledby="lbl">',
        '<label>Price <input data-id="labelled"></label>',
        '<input placeholder="Find a column">',
        '<button title="Close">×</button>',
        '<div role="checkbox" data-id="bare-role"></div>',
        '<div aria-hidden="true"><button data-id="hidden"></button></div>',
        '<input type="hidden">',
        "</div>",
      ].join(""),
    )
    const report = checkContract({ root, rules: ["name"] })
    expect(report.checked.name).toBe(8)
    expect(report.findings.map((f) => f.where)).toEqual(["page button[data-id=bare]", "page div[data-id=bare-role]"])
    expect(report.findings[1]?.detail).toBe("checkbox with no accessible name")
  })

  it("takes no name from a field's value, a combobox's text, or content nobody can see", () => {
    const root = mount(
      [
        "<div>",
        '<select data-id="select"><option>100</option></select>',
        '<textarea data-id="notes">notes</textarea>',
        '<div role="combobox" tabindex="0" data-id="combobox">Pick one</div>',
        '<button data-id="collapsed"><span style="display: none">Export</span></button>',
        '<button><svg width="8" height="8"><title>Refresh</title></svg></button>',
        "<label>Size <select><option>5</option></select></label>",
        "</div>",
      ].join(""),
    )
    const report = checkContract({ root, rules: ["name"] })
    expect(report.checked.name).toBe(6)
    expect(report.findings.map((f) => f.where)).toEqual(["page select[data-id=select]", "page textarea[data-id=notes]", "page div[data-id=combobox]", "page button[data-id=collapsed]"])
  })

  it("names an image input by its alt, a submit button by the browser's word, and a button by a labelled part inside it", () => {
    const root = mount(
      [
        "<div>",
        '<input type="image" alt="Send" src="data:,">',
        '<input type="image" src="data:," data-id="bare-image">',
        '<input type="submit">',
        '<button><svg role="img" aria-label="Refresh" width="8" height="8"></svg></button>',
        '<span id="close-label">Close</span><button><span aria-labelledby="close-label"></span></button>',
        "</div>",
      ].join(""),
    )
    const report = checkContract({ root, rules: ["name"] })
    expect(report.checked.name).toBe(5)
    expect(report.findings.map((f) => f.where)).toEqual(["page input[data-id=bare-image]"])
  })

  it("reads what a reference or a label points at the way a screen reader does", () => {
    const root = mount(
      [
        "<div>",
        '<img id="ref-img" alt="Refresh" src="data:,"><button aria-labelledby="ref-img"></button>',
        '<span id="ref-label" aria-label="Close"></span><button aria-labelledby="ref-label"></button>',
        '<span id="ref-hidden" hidden>Send</span><button aria-labelledby="ref-hidden"></button>',
        '<span id="ref-decor"><span aria-hidden="true">decor</span></span><button aria-labelledby="ref-decor" data-id="decor"></button>',
        '<label> <input value="42" data-id="own-value"></label>',
        "</div>",
      ].join(""),
    )
    const report = checkContract({ root, rules: ["name"] })
    expect(report.checked.name).toBe(5)
    expect(report.findings.map((f) => f.where)).toEqual(["page button[data-id=decor]", "page input[data-id=own-value]"])
  })

  it("holds a grid or a list box to a name of its own, never its cells' text", () => {
    const root = mount(
      [
        "<div>",
        '<div role="grid" tabindex="0" data-id="bare-grid"><div role="row"><div role="gridcell">99-16</div></div></div>',
        '<div role="grid" tabindex="0" aria-label="Orders"><div role="row"><div role="gridcell">99-17</div></div></div>',
        '<div role="listbox" data-id="bare-list"><div role="option">UST 10Y</div></div>',
        "</div>",
      ].join(""),
    )
    const report = checkContract({ root, rules: ["name"] })
    expect(report.findings.map((f) => f.where)).toEqual(["page div[data-id=bare-grid]", "page div[data-id=bare-list]"])
  })

  it("takes a placeholder only from a field that shows one, and an empty value as no name", () => {
    const root = mount(
      [
        "<div>",
        '<input type="checkbox" placeholder="Pin" data-id="checkbox">',
        '<button placeholder="Go" data-id="button"></button>',
        '<input type="number" placeholder="Size">',
        '<input type="submit" value="" data-id="empty-submit">',
        '<input type="reset" value="" data-id="empty-reset">',
        "</div>",
      ].join(""),
    )
    expect(checkContract({ root, rules: ["name"] }).findings.map((f) => f.where)).toEqual([
      "page input[data-id=checkbox]",
      "page button[data-id=button]",
      "page input[data-id=empty-submit]",
      "page input[data-id=empty-reset]",
    ])
  })

  it("never puts a password in a finding", () => {
    const root = mount('<div><input type="password" value="hunter2" style="font-size: 10px"></div>')
    const report = checkContract({ root, rules: ["floor", "name"] })
    expect(report.findings.map((f) => [f.rule, f.text])).toEqual([
      ["floor", "••••"],
      ["name", "••••"],
    ])
    expect(JSON.stringify(report)).not.toContain("hunter2")
  })

  it("leaves out a subtree marked data-contract-ignore, unless told to skip nothing", () => {
    const root = mount('<div><div data-contract-ignore=""><p style="font-size: 10px">on purpose</p><button></button></div></div>')
    expect(rulesOf(root)).toEqual([])
    expect(rulesOf(root, { ignore: "" })).toEqual(["floor", "name"])
    expect(rulesOf(root, { ignore: "[data-other]" })).toEqual(["floor", "name"])
  })

  it("runs only the rules it is given", () => {
    const root = mount('<div data-slot="tradecn-demo"><p style="font-size: 10px">7 small</p><button></button></div>')
    expect(rulesOf(root)).toEqual(["floor", "name", "numeric"])
    const only: ContractRule[] = ["name"]
    expect(rulesOf(root, { rules: only })).toEqual(["name"])
  })

  it("takes the root as a selector, the whole document by default, and throws when a selector names nothing", () => {
    mount('<main><button></button></main><aside><button></button></aside>')
    expect(checkContract({ rules: ["name"] }).findings).toHaveLength(2)
    expect(checkContract({ root: "main", rules: ["name"] }).findings).toHaveLength(1)
    expect(() => checkContract({ root: "#nothing" })).toThrow("checkContract: nothing matches #nothing")
  })

  it("stands alone, so a test can hand it to the browser as it is", () => {
    const root = mount('<div><p style="font-size: 10px">small print</p></div>')
    const standalone = new Function(`return (${checkContract.toString()})`)() as typeof checkContract
    expect(standalone({ root, rules: ["floor"] }).findings.map((f) => f.text)).toEqual(["small print"])
  })
})
