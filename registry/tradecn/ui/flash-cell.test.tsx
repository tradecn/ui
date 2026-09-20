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
