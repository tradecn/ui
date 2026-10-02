import { useCallback, useSyncExternalStore } from "react"
import { sharedClock, type Clock } from "@/registry/tradecn/lib/clock"

/** The clock's time. The caller re-renders on each tick and on nothing else. The shared one-second clock unless given another. */
export function useNow(clock?: Clock): number {
  const c = clock ?? sharedClock()
  // Called through the clock, not detached from it, so a class-based Clock keeps its `this`.
  const subscribe = useCallback((cb: () => void) => c.subscribe(cb), [c])
  const now = useCallback(() => c.now(), [c])
  return useSyncExternalStore(subscribe, now, now)
}
