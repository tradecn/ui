// The envelope everything a trader or a desk may change without a build travels in: a workspace
// layout, a grid's column state, hotkey overrides, rules, a threshold. Each is a slot with a version
// and a JSON value, and the envelope says in its payload which slots may leave as a desk template,
// which belong to one person, and which never leave a session, in the language the workspace layout's
// boundaries already use. The items keep their controlled props; the consumer wires a slot to a prop.
// This is not a store and not a provider, and where the envelope lives (localStorage, a file in a
// desktop shell, a server) is the consumer's. Nothing here touches storage, and a stored envelope comes
// back through `parsePreferences`, which takes nothing on trust.

export const PREFERENCES_MARK = "preferences"
export const PREFERENCES_VERSION = 1

export type PreferencesJson = string | number | boolean | null | PreferencesJson[] | { [key: string]: PreferencesJson }

/** A slot: the shape's version, as the item that owns the shape numbers it, and the value as JSON. */
export interface PreferenceSlot {
  version: number
  value: PreferencesJson
}

/**
 * Where a slot may go. `template`: shareable as a desk template, handed to a colleague, restored next
 * quarter. `user`: belongs to the person, whichever desk they sit at. `session`: never leaves a
 * session, so an export drops it whatever else it keeps.
 */
export type PreferenceBoundary = "template" | "user" | "session"

export type PreferenceBoundaries = { readonly [K in PreferenceBoundary]: readonly string[] }

export const PREFERENCE_BOUNDARIES: readonly PreferenceBoundary[] = ["template", "user", "session"]

/** A slot named under no boundary is the person's. */
export const DEFAULT_BOUNDARY: PreferenceBoundary = "user"

export interface Preferences {
  tradecn: typeof PREFERENCES_MARK
  version: typeof PREFERENCES_VERSION
  slots: Record<string, PreferenceSlot>
  /** Which slots go where, by name, at the time the envelope was written. */
  boundaries: PreferenceBoundaries
}

/** How a consumer brings an older slot up to the shape it reads today. */
export interface PreferenceMigrator {
  /** The version the consumer's code reads. */
  version: number
  /** The value at `from`, returned at `version`; null drops the slot. Called only for a slot older than `version`. */
  migrate: (value: PreferencesJson, from: number) => PreferencesJson | null
}

export type PreferenceMigrators = Record<string, PreferenceMigrator>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The value as JSON stores it: functions and undefined gone, a copy, or null when it cannot be stored. */
export function toJson(value: unknown): PreferencesJson | null {
  if (value === undefined) return null
  try {
    const stored: unknown = JSON.parse(JSON.stringify(value))
    return stored === undefined ? null : (stored as PreferencesJson)
  } catch {
    return null
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function readBoundaries(value: unknown): PreferenceBoundaries {
  const out: Record<PreferenceBoundary, string[]> = { template: [], user: [], session: [] }
  if (!isObject(value)) return out
  for (const key of PREFERENCE_BOUNDARIES) {
    const list = value[key]
    if (Array.isArray(list)) out[key] = list.filter((entry): entry is string => typeof entry === "string")
  }
  return out
}

/** An empty envelope, with the boundaries you name. */
export function createPreferences(boundaries: Partial<{ [K in PreferenceBoundary]: readonly string[] }> = {}): Preferences {
  return {
    tradecn: PREFERENCES_MARK,
    version: PREFERENCES_VERSION,
    slots: {},
    boundaries: { template: [...(boundaries.template ?? [])], user: [...(boundaries.user ?? [])], session: [...(boundaries.session ?? [])] },
  }
}

/**
 * A stored envelope, checked. Takes the object or the JSON text of one, and returns null for anything
 * that is not a version 1 tradecn preferences envelope. A slot that is not an object with a whole-number
 * version and a JSON value is dropped, the rest are kept, and what comes back is a copy.
 */
export function parsePreferences(value: unknown): Preferences | null {
  let raw = value
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isObject(raw) || raw.tradecn !== PREFERENCES_MARK || raw.version !== PREFERENCES_VERSION || !isObject(raw.slots)) return null
  const slots: Record<string, PreferenceSlot> = {}
  for (const [name, slot] of Object.entries(raw.slots)) {
    if (!isObject(slot) || typeof slot.version !== "number" || !Number.isInteger(slot.version) || slot.version < 0 || !("value" in slot)) continue
    const stored = toJson(slot.value)
    if (stored === null && slot.value !== null) continue
    slots[name] = { version: slot.version, value: stored }
  }
  return { tradecn: PREFERENCES_MARK, version: PREFERENCES_VERSION, slots, boundaries: readBoundaries(raw.boundaries) }
}

/** The slot, or undefined. */
export function getSlot(prefs: Preferences, name: string): PreferenceSlot | undefined {
  return prefs.slots[name]
}

/**
 * The envelope with the slot set. The value is stored as JSON; `version` is the given one, else the
 * slot's own, else 1. A value and version that change nothing hand back the same envelope, so a
 * subscriber or an autosave comparing by identity sees no change.
 */
export function setSlot(prefs: Preferences, name: string, value: unknown, version?: number): Preferences {
  const stored = toJson(value)
  if (stored === null && value !== null) return prefs
  const current = prefs.slots[name]
  const next: PreferenceSlot = { version: version ?? current?.version ?? 1, value: stored }
  if (current && current.version === next.version && sameJson(current.value, next.value)) return prefs
  return { ...prefs, slots: { ...prefs.slots, [name]: next } }
}

/** The envelope without the slot; the same envelope when there was none. */
export function removeSlot(prefs: Preferences, name: string): Preferences {
  if (!(name in prefs.slots)) return prefs
  const slots = { ...prefs.slots }
  delete slots[name]
  return { ...prefs, slots }
}

/** The boundary a slot is named under, `user` when it is under none. */
export function boundaryOf(prefs: Preferences, name: string): PreferenceBoundary {
  for (const key of PREFERENCE_BOUNDARIES) if (prefs.boundaries[key].includes(name)) return key
  return DEFAULT_BOUNDARY
}

/** The envelope with the slot named under one boundary and no other. */
export function withBoundary(prefs: Preferences, name: string, boundary: PreferenceBoundary): Preferences {
  if (boundaryOf(prefs, name) === boundary && prefs.boundaries[boundary].includes(name)) return prefs
  const boundaries = { template: [...prefs.boundaries.template], user: [...prefs.boundaries.user], session: [...prefs.boundaries.session] }
  for (const key of PREFERENCE_BOUNDARIES) boundaries[key] = boundaries[key].filter((entry) => entry !== name)
  boundaries[boundary].push(name)
  return { ...prefs, boundaries }
}

export interface PreferencesDiff {
  /** In `b` and not in `a`. */
  added: string[]
  /** In `a` and not in `b`. */
  removed: string[]
  /** In both with a different version or value. */
  changed: string[]
  /** In both and the same. */
  same: string[]
}

/** Which slots differ between two envelopes, by name, for a support view or a save prompt. */
export function diffPreferences(a: Preferences, b: Preferences): PreferencesDiff {
  const out: PreferencesDiff = { added: [], removed: [], changed: [], same: [] }
  const names = new Set([...Object.keys(a.slots), ...Object.keys(b.slots)])
  for (const name of [...names].sort()) {
    const x = a.slots[name]
    const y = b.slots[name]
    if (x && !y) out.removed.push(name)
    else if (!x && y) out.added.push(name)
    else if (x && y) (x.version === y.version && sameJson(x.value, y.value) ? out.same : out.changed).push(name)
  }
  return out
}

/** The slots allowed out under a boundary: a template carries `template` slots only; the person's export carries `template` and `user`; nothing carries `session`. */
export function exportableSlots(prefs: Preferences, boundary: "template" | "user" = "user"): string[] {
  return Object.keys(prefs.slots).filter((name) => {
    const where = boundaryOf(prefs, name)
    return where === "template" || (boundary === "user" && where === "user")
  })
}

/**
 * The envelope as JSON text, for a file or a clipboard. `template` keeps the slots shareable as a desk
 * template; `user` (the default) keeps those and the person's own. A `session` slot never goes out.
 * The boundaries travel with it, so the reader knows what it holds.
 */
export function exportPreferences(prefs: Preferences, options: { boundary?: "template" | "user"; indent?: number } = {}): string {
  const keep = new Set(exportableSlots(prefs, options.boundary ?? "user"))
  const slots = Object.fromEntries(Object.entries(prefs.slots).filter(([name]) => keep.has(name)))
  const out: Preferences = { tradecn: PREFERENCES_MARK, version: PREFERENCES_VERSION, slots, boundaries: prefs.boundaries }
  return JSON.stringify(out, null, options.indent ?? 2)
}

/**
 * Another envelope's slots merged into this one: the incoming slot wins where both have one, under the
 * boundary allowed in (`user` by default, `template` for a desk template), and never a `session` slot.
 * The boundaries the incoming envelope names for the slots it brings are taken; the rest stay. Null when
 * the text is not an envelope.
 */
export function importPreferences(target: Preferences, incoming: unknown, options: { boundary?: "template" | "user" } = {}): Preferences | null {
  const parsed = parsePreferences(incoming)
  if (!parsed) return null
  const allowed = new Set(exportableSlots(parsed, options.boundary ?? "user"))
  let out = target
  for (const [name, slot] of Object.entries(parsed.slots)) {
    if (!allowed.has(name)) continue
    out = setSlot(out, name, slot.value, slot.version)
    out = withBoundary(out, name, boundaryOf(parsed, name))
  }
  return out
}

/**
 * Every slot brought up to the version its migrator reads: a slot older than `migrator.version` goes
 * through `migrate`, one it returns null for is dropped, a slot with no migrator or already current is
 * left alone, and a slot newer than the migrator's version is left alone too, since a newer build wrote
 * it. The same envelope comes back when nothing moved.
 */
export function migratePreferences(prefs: Preferences, migrators: PreferenceMigrators): Preferences {
  let out = prefs
  for (const [name, migrator] of Object.entries(migrators)) {
    const slot = prefs.slots[name]
    if (!slot || slot.version >= migrator.version) continue
    const value = migrator.migrate(slot.value, slot.version)
    out = value === null ? removeSlot(out, name) : setSlot(out, name, value, migrator.version)
  }
  return out
}

/**
 * One slot's value at the version the consumer reads, through its migrator when it is older, or
 * undefined when the slot is missing, newer than the migrator reads, or dropped by the migration. The
 * envelope itself is not changed; call `migratePreferences` to write the result back.
 */
export function readSlot<V = PreferencesJson>(prefs: Preferences, name: string, migrator?: PreferenceMigrator): V | undefined {
  const slot = prefs.slots[name]
  if (!slot) return undefined
  if (!migrator) return slot.value as V
  if (slot.version > migrator.version) return undefined
  if (slot.version === migrator.version) return slot.value as V
  const value = migrator.migrate(slot.value, slot.version)
  return value === null ? undefined : (value as V)
}
