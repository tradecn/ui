import { act, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  compareValues,
  createFlashMemory,
  directionOf,
  resetReducedMotionCache,
  useFlash,
  type FlashMemory,
  type FlashOptions,
} from "@/registry/tradecn/hooks/use-flash"

interface FakeAnimation {
  cancel: () => void
  currentTime: number | null
  onfinish: (() => void) | null
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

let animations: FakeAnimation[] = []
let clock = 0
const now = () => clock

function installAnimate() {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const a: FakeAnimation = { cancel: vi.fn(), currentTime: 0, onfinish: null, keyframes, options }
      animations.push(a)
      return a as unknown as Animation
    },
  })
}

function Cell({ value, opts }: { value: unknown; opts?: FlashOptions }) {
  const ref = useRef<HTMLDivElement>(null)
  useFlash(ref, value, { now, ...opts })
  return <div ref={ref} data-testid="cell" />
}

beforeEach(() => {
  animations = []
  clock = 0
  installAnimate()
  resetReducedMotionCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("directionOf", () => {
  it.each([
    [1, 2, "up"],
    [2, 1, "down"],
    [1, 1, "flat"],
    [0, 0, "flat"],
    [-1, 0, "up"],
    ["a", "b", "flat"],
    [null, 1, "flat"],
    [1, NaN, "flat"],
  ])("%s -> %s is %s", (a, b, dir) => {
    expect(directionOf(a, b)).toBe(dir)
  })
  it("honors a custom compare", () => {
    expect(directionOf("99-16", "99-17", (p, n) => String(n).localeCompare(String(p)))).toBe("up")
    expect(compareValues(1, 3)).toBe(2)
    expect(compareValues("x", "x")).toBe(0)
    expect(compareValues("x", "y")).toBeNull()
  })
})

describe("useFlash", () => {
  it("does not flash on first sight, then flashes by direction and retriggers by cancelling the last one", () => {
    const { rerender, getByTestId } = render(<Cell value={10} />)
    expect(animations).toHaveLength(0)
    expect(getByTestId("cell").dataset.direction).toBeUndefined()
    rerender(<Cell value={11} />)
    expect(animations).toHaveLength(1)
    expect(getByTestId("cell").dataset.direction).toBe("up")
    expect(animations[0]!.keyframes[0]).toEqual({ backgroundColor: "var(--up-soft)" })
    expect(animations[0]!.options.duration).toBe(900)
    rerender(<Cell value={9} />)
    expect(animations).toHaveLength(2)
    expect(animations[0]!.cancel).toHaveBeenCalledTimes(1)
    expect(getByTestId("cell").dataset.direction).toBe("down")
    rerender(<Cell value={9} />)
    expect(animations).toHaveLength(2)
    act(() => animations[1]!.onfinish?.())
    expect(getByTestId("cell").dataset.direction).toBeUndefined()
  })

  it("zero change is flat, equal values are silent unless asked, the ring variant animates a box shadow", () => {
    const { rerender, getByTestId } = render(<Cell value={5} opts={{ variant: "ring", flashOnEqual: true, revision: 1 }} />)
    rerender(<Cell value={5} opts={{ variant: "ring", flashOnEqual: true, revision: 2 }} />)
    expect(getByTestId("cell").dataset.direction).toBe("flat")
    expect(animations[0]!.keyframes[0]).toEqual({ boxShadow: "inset 0 0 0 1px var(--flat)" })
    rerender(<Cell value={7} opts={{ variant: "ring", flashOnEqual: true, revision: 3, windowMs: 300 }} />)
    expect(getByTestId("cell").dataset.direction).toBe("up")
    expect(animations[1]!.options.duration).toBe(300)
    // Without flashOnEqual a new revision of the same value stays quiet.
    const quiet = render(<Cell value={5} opts={{ revision: 1 }} />)
    quiet.rerender(<Cell value={5} opts={{ revision: 2 }} />)
    expect((quiet.container.firstElementChild as HTMLElement).dataset.direction).toBeUndefined()
  })

  it("a shared memory lets a remounted cell resume its flash part-way through", () => {
    const memory: FlashMemory = createFlashMemory()
    const opts = { memory, cellKey: "row1\u0000px" }
    const first = render(<Cell value={1} opts={opts} />)
    first.rerender(<Cell value={2} opts={opts} />)
    expect(animations).toHaveLength(1)
    first.unmount()
    clock = 400
    const second = render(<Cell value={2} opts={opts} />)
    expect(animations).toHaveLength(2)
    expect(animations[1]!.currentTime).toBe(400)
    expect(second.getByTestId("cell").dataset.direction).toBe("up")
    second.unmount()
    clock = 2000
    render(<Cell value={2} opts={opts} />)
    expect(animations).toHaveLength(2)
    expect(memory.size).toBe(1)
    memory.forget("row1")
    expect(memory.size).toBe(0)
  })

  it("requires a cellKey with a shared memory and honors disabled", () => {
    expect(() => render(<Cell value={1} opts={{ memory: createFlashMemory() }} />)).toThrow(/cellKey/)
    const { rerender } = render(<Cell value={1} opts={{ disabled: true }} />)
    rerender(<Cell value={2} opts={{ disabled: true }} />)
    expect(animations).toHaveLength(0)
  })

  it("under reduced motion it sets the direction without animating and clears it after the window", () => {
    vi.useFakeTimers()
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    resetReducedMotionCache()
    const { rerender, getByTestId } = render(<Cell value={1} opts={{ windowMs: 500 }} />)
    rerender(<Cell value={2} opts={{ windowMs: 500 }} />)
    expect(animations).toHaveLength(0)
    expect(getByTestId("cell").dataset.direction).toBe("up")
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(getByTestId("cell").dataset.direction).toBe("up")
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(getByTestId("cell").dataset.direction).toBeUndefined()
  })

  it("memory is bounded", () => {
    const m = createFlashMemory(2)
    m.set("a", { value: 1, at: 0, dir: "flat" })
    m.set("b", { value: 1, at: 0, dir: "flat" })
    m.set("c", { value: 1, at: 0, dir: "flat" })
    expect(m.size).toBe(2)
    expect(m.get("a")).toBeUndefined()
    expect(m.get("c")).toBeDefined()
  })
})
