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
  /** The trader picked one: Enter or a double click on a row. */
  setActive(id: RowId | null): void
  /** The trader acted and is done with it: the next open inquiry in the stack's order takes its place, even before the server says the last one is over. */
  next(): void
}

const NONE = "\u0000none"

/** The first row in order that is still open, skipping `except`. */
function firstOpen<T>(store: RowStore<T>, ids: readonly RowId[], isEnded: (row: T) => boolean, except: RowId | null): RowId | null {
  for (const id of ids) {
    if (id === except) continue
    const row = store.getRow(id)
    if (row !== undefined && !isEnded(row)) return id
  }
  return null
}

export function useActiveInquiry<T>(source: RowStore<T> | RowView<T>, options: ActiveInquiryOptions<T>): ActiveInquiry<T> {
  const store = "store" in source ? source.store : source
  const ids = useRowIds(source)
  const [chosen, setChosen] = useState<RowId | null>(null)
  // The chosen row itself, so the server's word on it is seen the moment it changes.
  const chosenRow = useRow(store, chosen ?? NONE)
  const { isEnded } = options
  const keep = chosen !== null && chosenRow !== undefined && !isEnded(chosenRow)
  const activeId = keep ? chosen : firstOpen(store, ids, isEnded, null)
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

  const setActive = useCallback((id: RowId | null) => setChosen(id), [])
  const next = useCallback(() => {
    setChosen((current) => firstOpen(store, source.getIds(), isEnded, current) ?? current)
  }, [store, source, isEnded])

  return { activeId, row, setActive, next }
}
