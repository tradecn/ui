import { useCallback, useSyncExternalStore } from "react"
import type { RowId, RowStore, RowView, StoreMeta } from "@/registry/tradecn/lib/row-store"

/** One row. The component re-renders when this row is replaced or patched, and for nothing else. */
export function useRow<T>(store: RowStore<T>, id: RowId): T | undefined {
  const subscribe = useCallback((cb: () => void) => store.subscribeRow(id, cb), [store, id])
  const get = useCallback(() => store.getRow(id), [store, id])
  return useSyncExternalStore(subscribe, get, get)
}

/** The ids of a store (insertion or authoritative order) or of a view (filtered, sorted, held). */
export function useRowIds<T>(source: RowStore<T> | RowView<T>): readonly RowId[] {
  const subscribe = useCallback((cb: () => void) => ("subscribeOrder" in source ? source.subscribeOrder(cb) : source.subscribe(cb)), [source])
  const get = useCallback(() => source.getIds(), [source])
  return useSyncExternalStore(subscribe, get, get)
}

/** Version, size, lane, drop count, sequence, gap, and timestamps. Changes once per batch. */
export function useStoreMeta<T>(store: RowStore<T>): StoreMeta {
  const subscribe = useCallback((cb: () => void) => store.subscribeMeta(cb), [store])
  const get = useCallback(() => store.getMeta(), [store])
  return useSyncExternalStore(subscribe, get, get)
}
