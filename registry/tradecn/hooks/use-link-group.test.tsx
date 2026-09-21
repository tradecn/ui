import { act, render, renderHook, screen } from "@testing-library/react"
import { StrictMode, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { LinkGroupProvider, useLinkGroup, useLinkGroupStore, type LinkGroupHandle, type UseLinkGroupOptions } from "@/registry/tradecn/hooks/use-link-group"
import { createLinkGroupStore, type LinkMessage, type LinkTransport } from "@/registry/tradecn/lib/link-group"

const handles = new Map<string, LinkGroupHandle>()

function Probe({ name, ...options }: UseLinkGroupOptions & { name: string }) {
  const link = useLinkGroup({ source: name, ...options })
  handles.set(name, link)
  return <output data-testid={name} data-group={link.group ?? "none"} data-symbol={link.symbol ?? ""} />
}

const symbolOf = (name: string) => screen.getByTestId(name).getAttribute("data-symbol")
const groupOf = (name: string) => screen.getByTestId(name).getAttribute("data-group")

function local({ children }: { children: ReactNode }) {
  return <LinkGroupProvider transport={null}>{children}</LinkGroupProvider>
}

describe("LinkGroupProvider", () => {
  it("is required", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => renderHook(() => useLinkGroup())).toThrow(/LinkGroupProvider/)
    error.mockRestore()
  })

  it("connects the store while mounted, through a Strict Mode remount too", () => {
    const off = vi.fn()
    const posted: LinkMessage[] = []
    const transport: LinkTransport = { post: (m) => posted.push(m), subscribe: vi.fn(() => off) }
    const view = render(
      <StrictMode>
        <LinkGroupProvider transport={transport}>
          <Probe name="a" defaultGroup={1} />
        </LinkGroupProvider>
      </StrictMode>,
    )
    expect(posted.some((m) => m.type === "hello")).toBe(true)
    act(() => handles.get("a")!.setSymbol("ZN"))
    expect(posted.filter((m) => m.type === "set")).toHaveLength(1)
    view.unmount()
    expect(transport.subscribe).toHaveBeenCalledTimes(off.mock.calls.length)
  })

  it("takes a store of your own", () => {
    const store = createLinkGroupStore()
    store.set(2, "ES")
    const { result } = renderHook(() => useLinkGroupStore(), { wrapper: ({ children }: { children: ReactNode }) => <LinkGroupProvider store={store}>{children}</LinkGroupProvider> })
    expect(result.current).toBe(store)
  })
})

describe("useLinkGroup", () => {
  it("keeps an unlinked panel's symbol to itself", () => {
    render(
      <>
        <Probe name="a" defaultSymbol="ZN" />
        <Probe name="b" defaultSymbol="ES" />
      </>,
      { wrapper: local },
    )
    act(() => handles.get("a")!.setSymbol(" zb "))
    expect(symbolOf("a")).toBe("zb")
    expect(symbolOf("b")).toBe("ES")
  })

  it("moves every panel in a group together, and leaves the other groups alone", () => {
    render(
      <>
        <Probe name="a" defaultGroup={1} />
        <Probe name="b" defaultGroup={1} />
        <Probe name="c" defaultGroup={2} />
      </>,
      { wrapper: local },
    )
    act(() => handles.get("a")!.setSymbol("ZN"))
    expect([symbolOf("a"), symbolOf("b"), symbolOf("c")]).toEqual(["ZN", "ZN", ""])
    act(() => handles.get("b")!.setSymbol(null))
    expect([symbolOf("a"), symbolOf("b")]).toEqual(["", ""])
  })

  it("gives an empty group the first joiner's symbol, and later joiners adopt it", () => {
    render(
      <>
        <Probe name="a" defaultGroup={3} defaultSymbol="ZN" />
        <Probe name="b" defaultGroup={3} defaultSymbol="ES" />
        <Probe name="c" defaultSymbol="CL" />
      </>,
      { wrapper: local },
    )
    expect([symbolOf("a"), symbolOf("b")]).toEqual(["ZN", "ZN"])
    act(() => handles.get("c")!.setGroup(3))
    expect(symbolOf("c")).toBe("ZN")
  })

  it("keeps what it was showing when it leaves a group", () => {
    render(
      <>
        <Probe name="a" defaultGroup={1} defaultSymbol="ZN" />
        <Probe name="b" defaultGroup={1} />
      </>,
      { wrapper: local },
    )
    act(() => handles.get("b")!.setGroup(null))
    act(() => handles.get("a")!.setSymbol("ES"))
    expect([symbolOf("a"), symbolOf("b")]).toEqual(["ES", "ZN"])
  })

  it("cycles through the groups in both directions", () => {
    render(<Probe name="a" />, { wrapper: local })
    act(() => handles.get("a")!.cycleGroup())
    expect(groupOf("a")).toBe("1")
    act(() => handles.get("a")!.cycleGroup(-1))
    act(() => handles.get("a")!.cycleGroup(-1))
    expect(groupOf("a")).toBe("4")
  })

  it("leaves a controlled group to its owner", () => {
    const onGroupChange = vi.fn()
    const view = render(<Probe name="a" group={1} onGroupChange={onGroupChange} />, { wrapper: local })
    act(() => handles.get("a")!.cycleGroup())
    expect(onGroupChange).toHaveBeenCalledWith(2)
    expect(groupOf("a")).toBe("1")
    view.rerender(<Probe name="a" group={2} onGroupChange={onGroupChange} />)
    expect(groupOf("a")).toBe("2")
  })

  it("reports every change to what the panel shows, its own and its group's, and not the first render", () => {
    const onSymbolChange = vi.fn()
    render(
      <StrictMode>
        <Probe name="a" defaultGroup={1} defaultSymbol="ZN" onSymbolChange={onSymbolChange} />
        <Probe name="b" defaultGroup={1} />
      </StrictMode>,
      { wrapper: local },
    )
    expect(onSymbolChange).not.toHaveBeenCalled()
    act(() => handles.get("b")!.setSymbol("ES"))
    act(() => handles.get("a")!.setSymbol("CL"))
    expect(onSymbolChange.mock.calls).toEqual([["ES"], ["CL"]])
  })

  it("records who wrote", () => {
    const store = createLinkGroupStore()
    render(
      <LinkGroupProvider store={store}>
        <Probe name="book-7" defaultGroup={4} />
      </LinkGroupProvider>,
    )
    act(() => handles.get("book-7")!.setSymbol("ZN"))
    expect(store.get(4)).toMatchObject({ symbol: "ZN", source: "book-7" })
  })

  it("follows a symbol that arrives from another window", () => {
    let deliver: (m: LinkMessage) => void = () => {}
    const transport: LinkTransport = { post: () => {}, subscribe: (cb) => ((deliver = cb), () => {}) }
    render(
      <LinkGroupProvider transport={transport}>
        <Probe name="a" defaultGroup={1} defaultSymbol="ZN" />
      </LinkGroupProvider>,
    )
    act(() => deliver({ kind: "tradecn-link", type: "set", origin: "elsewhere", group: 1, symbol: "ES", source: null, version: 3 }))
    expect(symbolOf("a")).toBe("ES")
  })
})
