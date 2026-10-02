import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useNow } from "@/registry/tradecn/hooks/use-clock"

// A caller's clock written as a class: its methods read `this`, so they only work called through it.
class InstanceClock {
  private ms = 5_000
  private listeners = new Set<() => void>()
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  now() {
    return this.ms
  }
  tick(by: number) {
    this.ms += by
    for (const listener of this.listeners) listener()
  }
}

describe("useNow", () => {
  it("keeps a class-based clock's methods bound to their instance", () => {
    const clock = new InstanceClock()
    const { result } = renderHook(() => useNow(clock))
    expect(result.current).toBe(5_000)
    act(() => clock.tick(1_000))
    expect(result.current).toBe(6_000)
  })
})
