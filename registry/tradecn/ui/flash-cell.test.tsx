import { StrictMode } from "react"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })),
  })
})

describe("FlashCell", () => {
  it("renders the slot, carries the static direction classes, and flashes on change", () => {
    const { rerender, container } = render(
      <FlashCell value={1} className="px-2">
        1.00
      </FlashCell>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.dataset.slot).toBe("tradecn-flash-cell")
    expect(el.dataset.variant).toBe("fill")
    expect(el.className).toContain("data-[direction=up]:bg-up-soft")
    expect(el.className).toContain("px-2")
    expect(el).toHaveTextContent("1.00")
    rerender(
      <FlashCell value={2} className="px-2">
        2.00
      </FlashCell>,
    )
    expect(el.dataset.direction).toBe("up")
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1)
  })
  it("ring variant carries ring classes", () => {
    const { container } = render(<FlashCell value={1} variant="ring" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.dataset.variant).toBe("ring")
    expect(el.className).toContain("shadow-[inset_0_0_0_1px_var(--up)]")
  })
})

it("honors a function ref's cleanup under StrictMode, and still flashes", () => {
  const seen: (HTMLDivElement | null)[] = []
  const cleanups: number[] = []
  const fnRef = (node: HTMLDivElement | null) => {
    seen.push(node)
    return () => {
      cleanups.push(1)
    }
  }
  const injected = { ref: fnRef } as Record<string, unknown>
  const { rerender, unmount } = render(<StrictMode><FlashCell value={1} {...injected}>1</FlashCell></StrictMode>)
  rerender(<StrictMode><FlashCell value={2} {...injected}>2</FlashCell></StrictMode>)
  const cell = document.querySelector<HTMLElement>("[data-slot='tradecn-flash-cell']")!
  expect(cell.dataset.direction).toBe("up")
  expect(seen.filter(Boolean).at(-1)).toBe(cell)
  unmount()
  expect(cleanups.length).toBeGreaterThan(0)
  expect(seen.filter((node) => node === null)).toHaveLength(0)
})

it("keeps flashing when a wrapper injects its own ref", () => {
  // Radix asChild, Base UI render, and spreading wrappers all inject a ref; it must merge
  // with the flash target, never replace it silently.
  const outside = { current: null as HTMLDivElement | null }
  const injected = { ref: outside } as Record<string, unknown>
  const { rerender } = render(<FlashCell value={1} {...injected}>1</FlashCell>)
  rerender(<FlashCell value={2} {...injected}>2</FlashCell>)
  const cell = document.querySelector<HTMLElement>("[data-slot='tradecn-flash-cell']")!
  expect(cell.dataset.direction).toBe("up")
  expect(outside.current).toBe(cell)
})
