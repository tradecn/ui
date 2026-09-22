import { useCallback, useEffect, useRef, useState } from "react"
import { useRow, useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import type { RowId, RowStore, RowView } from "@/registry/tradecn/lib/row-store"

// Which inquiry is in the ticket. One rule, held here so a stack and a ticket agree on it: the
// active inquiry stays active until the trader acts on it or the server says it is over, and only
// then does the next one in the stack's order take its place. An inquiry arriving never changes it,
// wherever it lands in the order, so a hand about to send never sends to something that just came in.

export interface ActiveInquiryOptions<T> {
  /** The server's word says an inquiry is over: expired, done, done away, passed. The active one stays until this is true or the trader moves on. */
  isEnded: (row: T) => boolean
  /** The active inquiry changed, to a row id or to null when nothing is open. */
  onChange?: (id: RowId | null, row: T | null) => void
}

export interface ActiveInquiry<T> {
  /** The id in the ticket, or null when no open inquiry is on the stack. */
  activeId: RowId | null
  row: T | null
  /** The trader picked one: Enter or a double click on a row. A parked one picked this way is parked no more. */
  setActive(id: RowId | null): void
  /** The trader acted and is done with it: the next open inquiry in the stack's order takes its place, even before the server says the last one is over. */
  next(): void
  /** Set an inquiry aside. It stays on the stack and still ends on the server's word, but it is never the next one; parking the active one hands the ticket on. */
  park(id: RowId): void
  unpark(id: RowId): void
  /** The inquiries set aside. Pass it to the stack as `parkedIds` and their rows are marked. */
  parked: ReadonlySet<RowId>
}

const NONE = "\u0000none"
const NO_PARKED: ReadonlySet<RowId> = new Set()

/** The first row in order that is still open, skipping `except` and the parked ones. */
function firstOpen<T>(store: RowStore<T>, ids: readonly RowId[], isEnded: (row: T) => boolean, except: RowId | null, parked: ReadonlySet<RowId>): RowId | null {
  for (const id of ids) {
    if (id === except || parked.has(id)) continue
    const row = store.getRow(id)
    if (row !== undefined && !isEnded(row)) return id
  }
  return null
}

export function useActiveInquiry<T>(source: RowStore<T> | RowView<T>, options: ActiveInquiryOptions<T>): ActiveInquiry<T> {
  const store = "store" in source ? source.store : source
  const ids = useRowIds(source)
  const [chosen, setChosen] = useState<RowId | null>(null)
  const [parked, setParked] = useState<ReadonlySet<RowId>>(NO_PARKED)
  // The chosen row itself, so the server's word on it is seen the moment it changes.
  const chosenRow = useRow(store, chosen ?? NONE)
  const { isEnded } = options

  // A parked inquiry whose row left the store leaves the set with it. Settled during render, as the choice is.
  let pruned: Set<RowId> | null = null
  for (const id of parked) {
    if (store.getRow(id) !== undefined) continue
    pruned ??= new Set(parked)
    pruned.delete(id)
  }
  const live: ReadonlySet<RowId> = pruned ?? parked
  if (pruned) setParked(pruned)

  const keep = chosen !== null && chosenRow !== undefined && !isEnded(chosenRow) && !live.has(chosen)
  const activeId = keep ? chosen : firstOpen(store, ids, isEnded, null, live)
  const row = activeId === null ? null : (store.getRow(activeId) ?? null)
  // Derived state, settled during render: the choice follows what the order and the server's word allow.
  if (chosen !== activeId) setChosen(activeId)

  // Tell the consumer once per change.
  const latest = useRef(options.onChange)
  useEffect(() => {
    latest.current = options.onChange
  })
  const told = useRef<RowId | null | undefined>(undefined)
  useEffect(() => {
    if (told.current === activeId) return
    told.current = activeId
    latest.current?.(activeId, activeId === null ? null : (store.getRow(activeId) ?? null))
  }, [activeId, store])

  const unpark = useCallback((id: RowId) => {
    setParked((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])
  const park = useCallback((id: RowId) => {
    setParked((current) => (current.has(id) ? current : new Set(current).add(id)))
  }, [])
  const setActive = useCallback(
    (id: RowId | null) => {
      if (id !== null) unpark(id)
      setChosen(id)
    },
    [unpark],
  )
  const next = useCallback(() => {
    setChosen((current) => firstOpen(store, source.getIds(), isEnded, current, live) ?? current)
  }, [store, source, isEnded, live])

  return { activeId, row, setActive, next, park, unpark, parked: live }
}
