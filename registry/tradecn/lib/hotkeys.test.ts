import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHotkeyRegistry, formatKeys, isEditableTarget, isMenuTarget, keysFromEvent, matchesKeys, normalizeKeys, scopeChain, type HotkeyBinding, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"

let detach: (() => void) | null = null

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function mount(html: string): HTMLElement {
  const host = document.createElement("div")
  host.innerHTML = html
  document.body.append(host)
  return host
}

function attached(options: Parameters<typeof createHotkeyRegistry>[0] = {}): HotkeyRegistry {
  const registry = createHotkeyRegistry({ platform: "other", ...options })
  detach = registry.attach()
  return registry
}

const binding = (id: string, keys: string, scope: HotkeyBinding["scope"] = "global", extra: Partial<HotkeyBinding> = {}): HotkeyBinding => ({ id, keys, scope, description: id, ...extra })

beforeEach(() => {
  document.body.innerHTML = ""
})
afterEach(() => {
  detach?.()
  detach = null
  vi.useRealTimers()
})

describe("normalizeKeys", () => {
  it("resolves mod per platform", () => {
    expect(normalizeKeys("mod+k", "mac")).toBe("meta+k")
    expect(normalizeKeys("mod+k", "other")).toBe("ctrl+k")
  })

  it("folds aliases and orders modifiers", () => {
    expect(normalizeKeys("Shift+Cmd+Esc", "mac")).toBe("shift+meta+escape")
    expect(normalizeKeys("option+control+ArrowUp", "mac")).toBe("ctrl+alt+up")
    expect(normalizeKeys("  g   h ", "other")).toBe("g h")
    expect(normalizeKeys("ctrl+plus", "other")).toBe("ctrl++")
    expect(normalizeKeys("", "other")).toBe("")
  })

  it("rejects keys that do not parse", () => {
    expect(() => normalizeKeys("mod+", "other")).toThrow(/no key/)
    expect(() => normalizeKeys("g+h", "other")).toThrow(/two keys/)
  })
})

describe("formatKeys", () => {
  it("gives glyphs on a Mac and words elsewhere", () => {
    expect(formatKeys("mod+shift+k", "mac")).toEqual([["⇧", "⌘", "K"]])
    expect(formatKeys("mod+shift+k", "other")).toEqual([["Ctrl", "Shift", "K"]])
  })

  it("gives one array per chord step and labels named keys", () => {
    expect(formatKeys("g h", "other")).toEqual([["G"], ["H"]])
    expect(formatKeys("shift+enter", "mac")).toEqual([["⇧", "↵"]])
    expect(formatKeys("alt+up", "other")).toEqual([["Alt", "↑"]])
    expect(formatKeys("f5", "other")).toEqual([["F5"]])
    expect(formatKeys("?", "other")).toEqual([["?"]])
  })
})

describe("matchesKeys", () => {
  // happy-dom answers true for AltGraph whenever alt is down; browsers keep the two apart.
  const event = (key: string, init: KeyboardEventInit = {}, altGraph = false) => {
    const e = new KeyboardEvent("keydown", { key, ...init })
    Object.defineProperty(e, "getModifierState", { value: (name: string) => name === "AltGraph" && altGraph })
    return e
  }

  it("needs the modifiers to match exactly", () => {
    expect(matchesKeys(event("k", { ctrlKey: true }), "mod+k", "other")).toBe(true)
    expect(matchesKeys(event("k", { metaKey: true }), "mod+k", "other")).toBe(false)
    expect(matchesKeys(event("k", { ctrlKey: true, shiftKey: true }), "mod+k", "other")).toBe(false)
    expect(matchesKeys(event("K", { shiftKey: true }), "shift+k", "other")).toBe(true)
  })

  it("takes a shifted symbol either way it is written", () => {
    const question = event("?", { shiftKey: true, code: "Slash" })
    expect(matchesKeys(question, "?", "other")).toBe(true)
    expect(matchesKeys(question, "shift+/", "other")).toBe(true)
    expect(matchesKeys(question, "/", "other")).toBe(false)
    expect(matchesKeys(event("!", { shiftKey: true, code: "Digit1" }), "shift+1", "other")).toBe(true)
  })

  it("reads the physical key when option changes the character", () => {
    expect(matchesKeys(event("˚", { altKey: true, code: "KeyK" }), "alt+k", "mac")).toBe(true)
  })

  it("does not read AltGr as ctrl+alt", () => {
    expect(matchesKeys(event("@", { ctrlKey: true, altKey: true, code: "KeyQ" }, true), "ctrl+alt+q", "other")).toBe(false)
    expect(matchesKeys(event("@", { ctrlKey: true, altKey: true, code: "KeyQ" }), "ctrl+alt+q", "other")).toBe(true)
  })

  it("is for single steps", () => {
    expect(matchesKeys(event("g"), "g h", "other")).toBe(false)
  })

  it("round-trips what keysFromEvent captures", () => {
    const cases: [KeyboardEvent, string | null][] = [
      [event("k", { metaKey: true }), "meta+k"],
      [event("K", { shiftKey: true, ctrlKey: true }), "ctrl+shift+k"],
      [event("?", { shiftKey: true, code: "Slash" }), "?"],
      [event("˚", { altKey: true, code: "KeyK" }), "alt+k"],
      [event("@", { ctrlKey: true, altKey: true, code: "KeyQ" }, true), "ctrl+alt+@"],
      [event("ArrowUp", { altKey: true }), "alt+up"],
      [event(" "), "space"],
      [event("Shift", { shiftKey: true }), null],
    ]
    for (const [e, keys] of cases) {
      expect(keysFromEvent(e)).toBe(keys)
      if (keys) expect(matchesKeys(e, keys, "other")).toBe(true)
    }
  })
})

describe("targets", () => {
  it("knows typing from clicking", () => {
    const host = mount(`<input id="t" /><input id="c" type="checkbox" /><textarea id="a"></textarea><select id="s"></select><div contenteditable="true"><b id="e">x</b></div><button id="b">x</button>`)
    const q = (id: string) => host.querySelector(`#${id}`)
    expect(isEditableTarget(q("t"))).toBe(true)
    expect(isEditableTarget(q("a"))).toBe(true)
    expect(isEditableTarget(q("s"))).toBe(true)
    expect(isEditableTarget(q("e"))).toBe(true)
    expect(isEditableTarget(q("c"))).toBe(false)
    expect(isEditableTarget(q("b"))).toBe(false)
    expect(isEditableTarget(document)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  it("knows a menu", () => {
    const host = mount(`<div role="menu"><div id="i" role="menuitem">x</div></div><div id="o">x</div>`)
    expect(isMenuTarget(host.querySelector("#i"))).toBe(true)
    expect(isMenuTarget(host.querySelector("#o"))).toBe(false)
  })

  it("builds the chain innermost first and ends on editing, global", () => {
    const host = mount(`<div data-hotkey-scope="panel:book"><div data-hotkey-scope="panel:ladder"><button id="b">x</button></div></div>`)
    expect(scopeChain(host.querySelector("#b"))).toEqual(["panel:ladder", "panel:book", "editing", "global"])
    expect(scopeChain(document.body)).toEqual(["editing", "global"])
  })

  it("stops at a dialog", () => {
    const host = mount(`<div data-hotkey-scope="panel:book"><div role="dialog"><button id="bare">x</button><div data-hotkey-scope="editing"><input id="in" /></div></div></div>`)
    expect(scopeChain(host.querySelector("#bare"))).toEqual([])
    expect(scopeChain(host.querySelector("#in"))).toEqual(["editing"])
  })
})

describe("dispatch", () => {
  it("fires a binding and prevents the default", () => {
    const registry = attached()
    const run = vi.fn()
    registry.register(binding("palette.open", "mod+k"), run)
    const event = press("k", { ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    press("k")
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("leaves the default alone when asked", () => {
    const registry = attached()
    registry.register(binding("x", "x", "global", { preventDefault: false }), vi.fn())
    expect(press("x").defaultPrevented).toBe(false)
  })

  it("stays out of events someone already handled, IME composition, and bare modifiers", () => {
    const registry = attached()
    const run = vi.fn()
    registry.register(binding("x", "x"), run)
    const handled = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true })
    handled.preventDefault()
    document.body.dispatchEvent(handled)
    press("x", { isComposing: true })
    press("Shift", { shiftKey: true })
    expect(run).not.toHaveBeenCalled()
  })

  it("ignores key repeat unless the binding wants it", () => {
    const registry = attached()
    const once = vi.fn()
    const held = vi.fn()
    registry.register(binding("cancel", "x"), once)
    registry.register(binding("tick.up", "up", "global", { repeat: true }), held)
    press("x", { repeat: true })
    press("ArrowUp", { repeat: true })
    expect(once).not.toHaveBeenCalled()
    expect(held).toHaveBeenCalledTimes(1)
  })

  it("runs only editing bindings while typing", () => {
    const registry = attached()
    const global = vi.fn()
    const editing = vi.fn()
    registry.register(binding("go.home", "h"), global)
    registry.register(binding("palette.open", "mod+k", "editing"), editing)
    const input = mount(`<input />`).querySelector("input")!
    press("h", {}, input)
    press("k", { ctrlKey: true }, input)
    expect(global).not.toHaveBeenCalled()
    expect(editing).toHaveBeenCalledTimes(1)
    press("k", { ctrlKey: true })
    expect(editing).toHaveBeenCalledTimes(2)
  })

  it("leaves menus alone", () => {
    const registry = attached()
    const run = vi.fn()
    registry.register(binding("palette.open", "mod+k", "editing"), run)
    const item = mount(`<div role="menu"><div role="menuitem" tabindex="-1">x</div></div>`).querySelector("[role=menuitem]")!
    expect(press("k", { ctrlKey: true }, item).defaultPrevented).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it("does not fire a global binding under a dialog", () => {
    const registry = attached()
    const cancelAll = vi.fn()
    const confirm = vi.fn()
    registry.register(binding("orders.cancel-all", "x"), cancelAll)
    registry.register(binding("confirm.accept", "y", "panel:confirm"), confirm)
    const host = mount(`<div role="dialog"><div data-hotkey-scope="panel:confirm"><button>OK</button></div></div>`)
    press("x", {}, host.querySelector("button")!)
    press("y", {}, host.querySelector("button")!)
    expect(cancelAll).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it("lets the innermost scope win and falls outward when it has nothing", () => {
    const registry = attached()
    const panel = vi.fn()
    const global = vi.fn()
    const help = vi.fn()
    registry.register(binding("book.cancel", "x", "panel:book"), panel)
    registry.register(binding("app.cancel", "x"), global)
    registry.register(binding("app.help", "?"), help)
    const button = mount(`<div data-hotkey-scope="panel:book"><button>x</button></div>`).querySelector("button")!
    press("x", {}, button)
    expect(panel).toHaveBeenCalledTimes(1)
    expect(global).not.toHaveBeenCalled()
    press("?", { shiftKey: true }, button)
    expect(help).toHaveBeenCalledTimes(1)
    press("x")
    expect(global).toHaveBeenCalledTimes(1)
  })

  it("skips a binding whose when() is false", () => {
    const registry = attached()
    let armed = false
    const inner = vi.fn()
    const outer = vi.fn()
    registry.register(binding("book.send", "s", "panel:book", { when: () => armed }), inner)
    registry.register(binding("app.save", "s"), outer)
    const button = mount(`<div data-hotkey-scope="panel:book"><button>x</button></div>`).querySelector("button")!
    press("s", {}, button)
    expect(outer).toHaveBeenCalledTimes(1)
    armed = true
    press("s", {}, button)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it("does not consume a key for a binding nobody handles", () => {
    const registry = attached()
    registry.register(binding("x", "x"))
    expect(press("x").defaultPrevented).toBe(false)
  })

  it("routes to the handler whose scope element holds the target", () => {
    const registry = attached()
    registry.register(binding("ticket.submit", "mod+enter", "editing"))
    const host = mount(`<div id="a" data-hotkey-scope="editing"><input /></div><div id="b" data-hotkey-scope="editing"><input /></div>`)
    const a = vi.fn()
    const b = vi.fn()
    const offA = registry.bind("ticket.submit", a, { scope: "editing", element: () => host.querySelector("#a") })
    registry.bind("ticket.submit", b, { scope: "editing", element: () => host.querySelector("#b") })
    press("Enter", { ctrlKey: true }, host.querySelector("#a input")!)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    press("Enter", { ctrlKey: true }, host.querySelector("#b input")!)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    press("Enter", { ctrlKey: true }, host.querySelector("#a input")!)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it("does not fence a handler bound from a different scope", () => {
    const registry = attached()
    registry.register(binding("app.help", "?"))
    const host = mount(`<div id="p" data-hotkey-scope="panel:book"></div>`)
    const help = vi.fn()
    registry.bind("app.help", help, { scope: "panel:book", element: () => host.querySelector("#p") })
    press("?", { shiftKey: true })
    expect(help).toHaveBeenCalledTimes(1)
  })
})

describe("chords", () => {
  it("fires on the second key and reports what is pending", () => {
    const registry = attached()
    const run = vi.fn()
    const woke = vi.fn()
    registry.register(binding("go.home", "g h"), run)
    registry.subscribe(woke)
    const first = press("g")
    expect(first.defaultPrevented).toBe(true)
    expect(registry.pending()).toBe("g")
    expect(woke).toHaveBeenCalled()
    press("h")
    expect(run).toHaveBeenCalledTimes(1)
    expect(registry.pending()).toBeNull()
  })

  it("times out", () => {
    vi.useFakeTimers()
    const registry = attached({ chordTimeoutMs: 500 })
    const run = vi.fn()
    registry.register(binding("go.home", "g h"), run)
    press("g")
    vi.advanceTimersByTime(499)
    expect(registry.pending()).toBe("g")
    vi.advanceTimersByTime(1)
    expect(registry.pending()).toBeNull()
    press("h")
    expect(run).not.toHaveBeenCalled()
  })

  it("cancels on Escape and swallows it", () => {
    const registry = attached()
    const run = vi.fn()
    const escape = vi.fn()
    registry.register(binding("go.home", "g h"), run)
    registry.register(binding("app.escape", "escape"), escape)
    press("g")
    expect(press("Escape").defaultPrevented).toBe(true)
    expect(registry.pending()).toBeNull()
    expect(escape).not.toHaveBeenCalled()
    press("h")
    expect(run).not.toHaveBeenCalled()
  })

  it("reads a key that does not continue the chord on its own", () => {
    const registry = attached()
    const home = vi.fn()
    const open = vi.fn()
    registry.register(binding("go.home", "g h"), home)
    registry.register(binding("palette.open", "mod+k", "editing"), open)
    press("g")
    press("k", { ctrlKey: true })
    expect(open).toHaveBeenCalledTimes(1)
    expect(registry.pending()).toBeNull()
  })

  it("lets a chord that starts in the panel outrank a finished global binding", () => {
    const registry = attached()
    const chord = vi.fn()
    const single = vi.fn()
    const other = vi.fn()
    registry.register(binding("book.go-top", "g t", "panel:book"), chord)
    registry.register(binding("app.grid", "g"), single)
    registry.register(binding("app.go-inbox", "g i"), other)
    const button = mount(`<div data-hotkey-scope="panel:book"><button>x</button></div>`).querySelector("button")!
    press("g", {}, button)
    expect(single).not.toHaveBeenCalled()
    press("t", {}, button)
    expect(chord).toHaveBeenCalledTimes(1)
    // A global chord with the same first key is still reachable from inside the panel.
    press("g", {}, button)
    press("i", {}, button)
    expect(other).toHaveBeenCalledTimes(1)
    press("g")
    expect(single).toHaveBeenCalledTimes(1)
  })
})

describe("conflicts", () => {
  it("reports duplicates, prefixes, and shadows, and nothing across panels", () => {
    const registry = createHotkeyRegistry({ platform: "mac" })
    expect(registry.register(binding("a", "mod+k"))).toEqual([])
    expect(registry.register(binding("b", "cmd+k", "editing"))).toEqual([{ kind: "duplicate", keys: "meta+k", ids: ["b", "a"] }])
    registry.register(binding("c", "g h"))
    expect(registry.register(binding("d", "g"))).toEqual([{ kind: "prefix", keys: "g", ids: ["d", "c"] }])
    expect(registry.register(binding("e", "g", "panel:book"))).toEqual([
      { kind: "shadow", keys: "g", ids: ["e", "c"] },
      { kind: "shadow", keys: "g", ids: ["e", "d"] },
    ])
    expect(registry.register(binding("f", "g", "panel:ladder"))).toEqual([
      { kind: "shadow", keys: "g", ids: ["f", "c"] },
      { kind: "shadow", keys: "g", ids: ["f", "d"] },
    ])
    expect(registry.conflicts()).toHaveLength(6)
  })

  it("ignores unbound bindings", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(binding("a", ""))
    expect(registry.register(binding("b", ""))).toEqual([])
  })

  it("does not report two bindings whose handlers are fenced apart, and does again when one runs anywhere or the boxes nest", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const host = mount(`<div id="a" data-hotkey-scope="editing"><input /></div><div id="b" data-hotkey-scope="editing"><div id="inner"></div></div>`)
    registry.register(binding("ticket.send", "mod+enter", "editing"))
    const duplicate = { kind: "duplicate", keys: "ctrl+enter", ids: ["rfq.send", "ticket.send"] }
    expect(registry.register(binding("rfq.send", "mod+enter", "editing"))).toEqual([duplicate])
    const woke = vi.fn()
    registry.subscribe(woke)
    const list = registry.list()
    const offA = registry.bind("ticket.send", vi.fn(), { scope: "editing", element: () => host.querySelector("#a") })
    // One side fenced and the other not bound yet: the declarations still meet.
    expect(registry.conflicts()).toHaveLength(1)
    registry.bind("rfq.send", vi.fn(), { scope: "editing", element: () => host.querySelector("#b") })
    expect(woke).toHaveBeenCalledTimes(2)
    expect(registry.list()).toBe(list)
    const settled = registry.conflicts()
    expect(settled).toEqual([])
    expect(registry.conflicts()).toBe(settled)
    expect(registry.remap("rfq.send", "ctrl+enter")).toEqual([])
    // A handler that runs anywhere brings the report back; its leaving takes it away again.
    const offAny = registry.bind("rfq.send", vi.fn())
    expect(registry.conflicts()).toEqual([{ ...duplicate, ids: ["ticket.send", "rfq.send"] }])
    offAny()
    expect(registry.conflicts()).toEqual([])
    // A second order ticket inside the rfq ticket's box: the two can meet there.
    registry.bind("ticket.send", vi.fn(), { scope: "editing", element: () => host.querySelector("#inner") })
    expect(registry.conflicts()).toHaveLength(1)
    offA()
    expect(registry.conflicts()).toHaveLength(1)
  })
})

describe("remapping", () => {
  it("remaps, lists, notifies, and resets", () => {
    const registry = attached()
    const run = vi.fn()
    const changed = vi.fn()
    registry.register(binding("palette.open", "mod+k", "editing"), run)
    registry.onChange(changed)
    const before = registry.list()
    expect(registry.list()).toBe(before)
    expect(registry.remap("palette.open", "mod+p")).toEqual([])
    expect(registry.list()).not.toBe(before)
    expect(registry.list()[0]).toMatchObject({ id: "palette.open", keys: "ctrl+p", defaultKeys: "ctrl+k", remapped: true })
    expect(changed).toHaveBeenLastCalledWith({ "palette.open": "ctrl+p" })
    press("k", { ctrlKey: true })
    expect(run).not.toHaveBeenCalled()
    press("p", { ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    registry.reset("palette.open")
    expect(changed).toHaveBeenLastCalledWith({})
    expect(registry.list()[0]).toMatchObject({ keys: "ctrl+k", remapped: false })
  })

  it("treats a remap back to the default as no override", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(binding("a", "mod+k"))
    registry.remap("a", "mod+p")
    registry.remap("a", "ctrl+k")
    expect(registry.overrides()).toEqual({})
  })

  it("unbinds with an empty string", () => {
    const registry = attached()
    const run = vi.fn()
    registry.register(binding("a", "x"), run)
    registry.remap("a", "")
    press("x")
    expect(run).not.toHaveBeenCalled()
    expect(registry.list()[0]).toMatchObject({ keys: "", remapped: true })
  })

  it("returns the conflicts a remap walks into, and refuses keys that do not parse", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(binding("a", "x"))
    registry.register(binding("b", "y"))
    expect(registry.remap("b", "x")).toEqual([{ kind: "duplicate", keys: "x", ids: ["b", "a"] }])
    expect(() => registry.remap("b", "ctrl+")).toThrow()
    expect(() => registry.remap("nope", "x")).toThrow(/no such binding/)
    expect(registry.list()[1]).toMatchObject({ keys: "x" })
  })

  it("loads overrides for bindings declared later, quietly, and survives a bad one", () => {
    const registry = attached()
    const changed = vi.fn()
    registry.onChange(changed)
    registry.load({ "go.home": "g g", broken: "ctrl+" })
    expect(changed).not.toHaveBeenCalled()
    const home = vi.fn()
    registry.register(binding("go.home", "g h"), home)
    registry.register(binding("broken", "b"))
    expect(registry.list().map((e) => e.keys)).toEqual(["g g", "b"])
    press("g")
    press("g")
    expect(home).toHaveBeenCalledTimes(1)
  })
})

describe("registering", () => {
  it("does not wake subscribers for an identical redeclaration", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const spec = binding("a", "x")
    registry.register(spec)
    const woke = vi.fn()
    registry.subscribe(woke)
    registry.register({ ...spec })
    expect(woke).not.toHaveBeenCalled()
    registry.register({ ...spec, description: "changed" })
    expect(woke).toHaveBeenCalledTimes(1)
  })

  it("unregisters", () => {
    const registry = attached()
    const run = vi.fn()
    registry.register(binding("a", "x"), run)
    registry.unregister("a")
    press("x")
    expect(run).not.toHaveBeenCalled()
    expect(registry.list()).toEqual([])
  })
})

describe("attach", () => {
  it("adds one listener however many times a target is attached", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const run = vi.fn()
    registry.register(binding("a", "x"), run)
    const off1 = registry.attach()
    const off2 = registry.attach()
    press("x")
    expect(run).toHaveBeenCalledTimes(1)
    off1()
    off1()
    press("x")
    expect(run).toHaveBeenCalledTimes(2)
    off2()
    press("x")
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("listens on another target", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const run = vi.fn()
    registry.register(binding("a", "x"), run)
    const host = mount(`<div id="popout"><button>x</button></div>`).querySelector("#popout")!
    detach = registry.attach(host)
    press("x")
    expect(run).not.toHaveBeenCalled()
    press("x", {}, host.querySelector("button")!)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
