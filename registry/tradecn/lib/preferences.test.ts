import { describe, expect, it } from "vitest"
import {
  DEFAULT_BOUNDARY,
  boundaryOf,
  createPreferences,
  diffPreferences,
  exportPreferences,
  exportableSlots,
  getSlot,
  importPreferences,
  migratePreferences,
  parsePreferences,
  readSlot,
  removeSlot,
  setSlot,
  toJson,
  withBoundary,
  type PreferenceMigrators,
} from "@/registry/tradecn/lib/preferences"

const LAYOUT = { version: 1, kind: "tradecn-workspace", dockview: { grid: { root: {} }, panels: {} }, panels: {}, boundaries: {} }
const COLUMNS = { order: ["px", "size"], widths: { px: 120 }, hidden: [] }

function desk() {
  let prefs = createPreferences({ template: ["layout", "rules", "columns:blotter", "columns:stack"], user: ["hotkeys"], session: ["threshold"] })
  prefs = setSlot(prefs, "layout", LAYOUT)
  prefs = setSlot(prefs, "columns:blotter", COLUMNS)
  prefs = setSlot(prefs, "columns:stack", { order: [], widths: {}, hidden: ["auto"] })
  prefs = setSlot(prefs, "hotkeys", { "rfq.send": "mod+shift+enter" })
  prefs = setSlot(prefs, "rules", { columns: [{ id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up" }] })
  prefs = setSlot(prefs, "threshold", 5_000_000)
  return prefs
}

describe("the envelope", () => {
  it("is created empty with its boundaries, sets and reads slots as JSON copies, and versions them", () => {
    const prefs = desk()
    expect(prefs).toMatchObject({ tradecn: "preferences", version: 1 })
    expect(Object.keys(prefs.slots).sort()).toEqual(["columns:blotter", "columns:stack", "hotkeys", "layout", "rules", "threshold"])
    expect(getSlot(prefs, "layout")).toEqual({ version: 1, value: LAYOUT })
    expect(getSlot(prefs, "layout")?.value).not.toBe(LAYOUT)
    expect(getSlot(prefs, "threshold")).toEqual({ version: 1, value: 5_000_000 })
    expect(setSlot(prefs, "layout", LAYOUT, 2).slots.layout?.version).toBe(2)
    expect(setSlot(prefs, "nothing", undefined)).toBe(prefs)
    expect(setSlot(prefs, "fn", () => 1)).toBe(prefs)
    expect(setSlot(prefs, "cleaned", { a: 1, b: undefined, c: () => 2 }).slots.cleaned?.value).toEqual({ a: 1 })
    expect(toJson(undefined)).toBeNull()
    expect(toJson(null)).toBeNull()
    expect(toJson({ d: new Date(0) })).toEqual({ d: "1970-01-01T00:00:00.000Z" })
  })

  it("hands back the same envelope when a set changes nothing, and a new one when it does", () => {
    const prefs = desk()
    expect(setSlot(prefs, "columns:blotter", { ...COLUMNS })).toBe(prefs)
    expect(setSlot(prefs, "columns:blotter", { ...COLUMNS, hidden: ["size"] })).not.toBe(prefs)
    expect(setSlot(prefs, "columns:blotter", COLUMNS, 2)).not.toBe(prefs)
    expect(removeSlot(prefs, "nothing")).toBe(prefs)
    const without = removeSlot(prefs, "threshold")
    expect(without).not.toBe(prefs)
    expect(without.slots.threshold).toBeUndefined()
    expect(prefs.slots.threshold).toBeDefined()
  })

  it("parses its own text back, drops a malformed slot and keeps the rest, and refuses what is not an envelope", () => {
    const prefs = desk()
    const back = parsePreferences(JSON.stringify(prefs))
    expect(back).toEqual(prefs)
    expect(back).not.toBe(prefs)
    expect(parsePreferences(prefs)).toEqual(prefs)
    const loose = parsePreferences({
      tradecn: "preferences",
      version: 1,
      slots: { ok: { version: 1, value: [1, 2] }, noVersion: { value: 1 }, fractional: { version: 1.5, value: 1 }, noValue: { version: 1 }, notAnObject: 4, nullValue: { version: 3, value: null } },
      boundaries: { template: ["ok", 5], user: "no", extra: ["x"] },
    })
    expect(Object.keys(loose!.slots).sort()).toEqual(["nullValue", "ok"])
    expect(loose!.boundaries).toEqual({ template: ["ok"], user: [], session: [] })
    expect(parsePreferences("{not json")).toBeNull()
    expect(parsePreferences({ tradecn: "preferences", version: 2, slots: {} })).toBeNull()
    expect(parsePreferences({ tradecn: "workspace", version: 1, slots: {} })).toBeNull()
    expect(parsePreferences({ tradecn: "preferences", version: 1 })).toBeNull()
    expect(parsePreferences(null)).toBeNull()
  })
})

describe("boundaries", () => {
  it("names where a slot goes, user when it is named nowhere, and moves one between them", () => {
    const prefs = desk()
    expect(boundaryOf(prefs, "layout")).toBe("template")
    expect(boundaryOf(prefs, "hotkeys")).toBe("user")
    expect(boundaryOf(prefs, "threshold")).toBe("session")
    expect(boundaryOf(prefs, "unnamed")).toBe(DEFAULT_BOUNDARY)
    const moved = withBoundary(prefs, "threshold", "template")
    expect(boundaryOf(moved, "threshold")).toBe("template")
    expect(moved.boundaries.session).toEqual([])
    expect(moved.boundaries.template).toContain("threshold")
    expect(withBoundary(moved, "threshold", "template")).toBe(moved)
    expect(withBoundary(prefs, "unnamed", "user").boundaries.user).toEqual(["hotkeys", "unnamed"])
  })

  it("exports a desk template with the template slots alone, a person's export with theirs too, and a session slot never", () => {
    const prefs = desk()
    expect(exportableSlots(prefs, "template").sort()).toEqual(["columns:blotter", "columns:stack", "layout", "rules"])
    expect(exportableSlots(prefs).sort()).toEqual(["columns:blotter", "columns:stack", "hotkeys", "layout", "rules"])
    const template = parsePreferences(exportPreferences(prefs, { boundary: "template" }))!
    expect(Object.keys(template.slots).sort()).toEqual(["columns:blotter", "columns:stack", "layout", "rules"])
    expect(template.boundaries).toEqual(prefs.boundaries)
    const mine = parsePreferences(exportPreferences(prefs))!
    expect(Object.keys(mine.slots)).toContain("hotkeys")
    expect(Object.keys(mine.slots)).not.toContain("threshold")
    expect(exportPreferences(prefs, { indent: 0 })).not.toContain("\n")
  })

  it("imports another envelope's slots under the boundary allowed in, the incoming slot winning, and its boundaries with it", () => {
    const mine = setSlot(setSlot(createPreferences({ user: ["hotkeys"] }), "hotkeys", { "go.blotter": "g b" }), "threshold", 1)
    const colleague = exportPreferences(setSlot(desk(), "hotkeys", { "rfq.send": "mod+enter" }))
    const asTemplate = importPreferences(mine, colleague, { boundary: "template" })!
    expect(Object.keys(asTemplate.slots).sort()).toEqual(["columns:blotter", "columns:stack", "hotkeys", "layout", "rules", "threshold"])
    // Their hotkeys did not come in as a template; mine stand.
    expect(asTemplate.slots.hotkeys?.value).toEqual({ "go.blotter": "g b" })
    expect(boundaryOf(asTemplate, "layout")).toBe("template")
    expect(boundaryOf(asTemplate, "threshold")).toBe("user")
    const asUser = importPreferences(mine, colleague)!
    expect(asUser.slots.hotkeys?.value).toEqual({ "rfq.send": "mod+enter" })
    expect(importPreferences(mine, "nope")).toBeNull()
    // A session slot in the text never lands.
    const withSession = JSON.parse(colleague) as { slots: Record<string, unknown>; boundaries: { session: string[] } }
    withSession.slots.threshold = { version: 1, value: 9 }
    withSession.boundaries.session = ["threshold"]
    expect(importPreferences(mine, withSession)!.slots.threshold?.value).toBe(1)
  })
})

describe("versions", () => {
  const migrators: PreferenceMigrators = {
    "columns:blotter": {
      version: 2,
      // Version 1 kept widths in a list of pairs.
      migrate: (value, from) => (from === 1 && typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value, widths: Object.fromEntries((value.widths as [string, number][]) ?? []) } : null),
    },
    hotkeys: { version: 1, migrate: () => null },
    threshold: { version: 3, migrate: () => null },
  }

  it("brings an older slot up through its migrator, drops one the migrator refuses, and leaves current and newer ones alone", () => {
    let prefs = createPreferences()
    prefs = setSlot(prefs, "columns:blotter", { order: [], widths: [["px", 120]], hidden: [] }, 1)
    prefs = setSlot(prefs, "hotkeys", { "go.blotter": "g b" }, 1)
    prefs = setSlot(prefs, "threshold", 5, 4)
    prefs = setSlot(prefs, "layout", LAYOUT)
    const moved = migratePreferences(prefs, migrators)
    expect(moved.slots["columns:blotter"]).toEqual({ version: 2, value: { order: [], widths: { px: 120 }, hidden: [] } })
    expect(moved.slots.hotkeys).toEqual({ version: 1, value: { "go.blotter": "g b" } })
    expect(moved.slots.threshold).toEqual({ version: 4, value: 5 })
    expect(moved.slots.layout).toEqual(prefs.slots.layout)
    expect(migratePreferences(moved, migrators)).toBe(moved)
    const dropped = migratePreferences(setSlot(prefs, "threshold", 5, 2), migrators)
    expect(dropped.slots.threshold).toBeUndefined()
  })

  it("reads one slot at the version the consumer reads, without writing the envelope", () => {
    const prefs = setSlot(setSlot(createPreferences(), "columns:blotter", { order: [], widths: [["px", 120]], hidden: [] }, 1), "threshold", 5, 4)
    expect(readSlot(prefs, "columns:blotter", migrators["columns:blotter"])).toEqual({ order: [], widths: { px: 120 }, hidden: [] })
    expect(prefs.slots["columns:blotter"]?.version).toBe(1)
    expect(readSlot(prefs, "threshold", migrators.threshold)).toBeUndefined()
    expect(readSlot(prefs, "threshold")).toBe(5)
    expect(readSlot(prefs, "nothing")).toBeUndefined()
    expect(readSlot<number>(setSlot(prefs, "n", 3, 3), "n", { version: 3, migrate: () => null })).toBe(3)
  })
})

describe("diffPreferences", () => {
  it("says which slots were added, removed, changed, and kept", () => {
    const a = desk()
    let b = setSlot(a, "threshold", 10_000_000)
    b = removeSlot(b, "hotkeys")
    b = setSlot(b, "columns:chart", { order: [], widths: {}, hidden: [] })
    b = setSlot(b, "layout", LAYOUT, 2)
    expect(diffPreferences(a, b)).toEqual({ added: ["columns:chart"], removed: ["hotkeys"], changed: ["layout", "threshold"], same: ["columns:blotter", "columns:stack", "rules"] })
    expect(diffPreferences(a, a)).toEqual({ added: [], removed: [], changed: [], same: Object.keys(a.slots).sort() })
  })
})
