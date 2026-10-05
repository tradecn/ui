import { act, render, screen } from "@testing-library/react"
import React, { Activity, StrictMode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { usePopout, type Popout, type PopoutOptions } from "@/registry/tradecn/hooks/use-popout"

// happy-dom cannot open a window. This is enough of one: a document of its own, listeners, close().
function fakeWindow() {
  const doc = document.implementation.createHTMLDocument("")
  const listeners = new Map<string, Set<() => void>>()
  const win = {
    document: doc,
    closed: false,
    focus: vi.fn(),
    close: vi.fn(() => {
      win.closed = true
    }),
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(cb)
    },
    removeEventListener: (type: string, cb: () => void) => listeners.get(type)?.delete(cb),
    fire: (type: string) => {
      for (const cb of [...(listeners.get(type) ?? [])]) cb()
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  }
  return win
}

type FakeWindow = ReturnType<typeof fakeWindow>

let handle: Popout

function Counter() {
  const [n, setN] = useState(0)
  return (
    <button data-testid="counter" onClick={() => setN((v) => v + 1)}>
      {n}
    </button>
  )
}

function Harness({ children, ...options }: PopoutOptions & { children?: React.ReactNode }) {
  const popout = usePopout(options)
  // Handed to the test from an effect: render() and act() have flushed effects by the time they return.
  useEffect(() => {
    handle = popout
  })
  const { slotRef, host, isOpen } = popout
  return (
    <section data-testid="page">
      <div ref={slotRef} data-testid="slot" />
      <output data-testid="open">{String(isOpen)}</output>
      {host ? createPortal(<Counter />, host) : null}
      {children}
    </section>
  )
}

function opening(win: FakeWindow | null) {
  return vi.fn(() => win as unknown as Window | null)
}

// happy-dom fetches a stylesheet link the moment it is connected. These tests copy one between documents.
interface HappySettings {
  disableCSSFileLoading: boolean
  handleDisabledFileLoadingAsSuccess: boolean
}
const settings = (window as unknown as { happyDOM: { settings: HappySettings } }).happyDOM.settings
const before = { ...settings }
beforeAll(() => {
  settings.disableCSSFileLoading = true
  settings.handleDisabledFileLoadingAsSuccess = true
})
afterAll(() => {
  settings.disableCSSFileLoading = before.disableCSSFileLoading
  settings.handleDisabledFileLoadingAsSuccess = before.handleDisabledFileLoadingAsSuccess
})

afterEach(() => {
  document.documentElement.removeAttribute("class")
  document.documentElement.removeAttribute("data-theme")
  document.head.querySelectorAll("[data-test-style]").forEach((n) => n.remove())
})

describe("usePopout", () => {
  it("renders into the slot while closed", () => {
    render(<Harness />)
    expect(screen.getByTestId("slot").contains(screen.getByTestId("counter"))).toBe(true)
    expect(handle.isOpen).toBe(false)
    expect(handle.window).toBeNull()
    expect(handle.host?.style.display).toBe("contents")
  })

  it("moves the same element to the popout and back, state intact", () => {
    const win = fakeWindow()
    render(<Harness openWindow={opening(win)} />)
    const counter = screen.getByTestId("counter")
    act(() => counter.click())
    act(() => {
      expect(handle.open()).toBe(true)
    })
    expect(screen.getByTestId("open").textContent).toBe("true")
    expect(win.document.body.contains(counter)).toBe(true)
    expect(screen.getByTestId("slot").childElementCount).toBe(0)
    expect(handle.host?.style.display).toBe("block")
    // React's listeners ride on the host, so the button still works over there.
    act(() => counter.click())
    expect(counter.textContent).toBe("2")
    act(() => handle.close())
    expect(win.close).toHaveBeenCalled()
    expect(screen.getByTestId("slot").contains(counter)).toBe(true)
    expect(counter.textContent).toBe("2")
  })

  it("asks for a window with the size and position it was given", () => {
    const openWindow = opening(fakeWindow())
    render(<Harness openWindow={openWindow} width={800.4} height={500} left={10} top={20} title="Book" />)
    act(() => void handle.open())
    expect(openWindow).toHaveBeenCalledWith("popup=yes,width=800,height=500,left=10,top=20")
    expect(handle.window?.document.title).toBe("Book")
  })

  it("falls back to window.open, by name", () => {
    const win = fakeWindow()
    const spy = vi.spyOn(window, "open").mockReturnValue(win as unknown as Window)
    render(<Harness name="book" />)
    act(() => void handle.open())
    expect(spy).toHaveBeenCalledWith("", "book", "popup=yes,width=640,height=420")
    spy.mockRestore()
  })

  it("reports a blocked popup and stays closed", () => {
    const onBlocked = vi.fn()
    render(<Harness openWindow={opening(null)} onBlocked={onBlocked} />)
    act(() => {
      expect(handle.open()).toBe(false)
    })
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(handle.isOpen).toBe(false)
  })

  it("tells the truth after an Activity hide closes its window", async () => {
    // Hiding destroys effects and keeps state: the unmount cleanup closes the window
    // while popout state survives. On reveal the hook reconciles — isOpen reads false,
    // close() stops returning early, and open() opens a fresh window.
    const first = fakeWindow()
    const second = fakeWindow()
    const windows = [first, second]
    const openWindow = vi.fn(() => windows.shift() as unknown as Window | null)
    const onClose = vi.fn()
    function Shell({ mode }: { mode: "visible" | "hidden" }) {
      return (
        <Activity mode={mode}>
          <Harness openWindow={openWindow} onClose={onClose} />
        </Activity>
      )
    }
    const view = render(<Shell mode="visible" />)
    act(() => {
      handle.open()
    })
    expect(screen.getByTestId("open")).toHaveTextContent("true")
    view.rerender(<Shell mode="hidden" />)
    expect(first.close).toHaveBeenCalled()
    view.rerender(<Shell mode="visible" />)
    expect(screen.getByTestId("open")).toHaveTextContent("false")
    // The hide's cleanup closed the window silently; the reveal completes the pair.
    expect(onClose).toHaveBeenCalledTimes(1)
    let reopened = false
    act(() => {
      reopened = handle.open()
    })
    expect(reopened).toBe(true)
    expect(openWindow).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId("open")).toHaveTextContent("true")
  })

    it("keeps a window opened by a child's reveal effect through the parent's reconcile", async () => {
    // Children's effects run before the parent's on an Activity reveal: a child that
    // reopens immediately owns the live handle, and the reconcile must not clobber it.
    const first = fakeWindow()
    const second = fakeWindow()
    const windows = [first, second]
    const openWindow = vi.fn(() => windows.shift() as unknown as Window | null)
    const onOpen = vi.fn()
    const onClose = vi.fn()
    function Reopener({ on }: { on: boolean }) {
      useEffect(() => {
        if (on) handle.open()
      }, [on])
      return null
    }
    function Shell({ mode, reopen }: { mode: "visible" | "hidden"; reopen: boolean }) {
      return (
        <Activity mode={mode}>
          <Harness openWindow={openWindow} onOpen={onOpen} onClose={onClose}>
            <Reopener on={reopen} />
          </Harness>
        </Activity>
      )
    }
    const view = render(<Shell mode="visible" reopen={false} />)
    act(() => {
      handle.open()
    })
    expect(screen.getByTestId("open")).toHaveTextContent("true")
    view.rerender(<Shell mode="hidden" reopen={false} />)
    expect(first.close).toHaveBeenCalled()
    view.rerender(<Shell mode="visible" reopen />)
    expect(openWindow).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId("open")).toHaveTextContent("true")
    expect(second.close).not.toHaveBeenCalled()
    // Every onOpen meets its onClose: the dead first window's pair completes on the
    // reveal even though a newer window took over.
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => {
      handle.close()
    })
    expect(second.close).toHaveBeenCalled()
    expect(screen.getByTestId("open")).toHaveTextContent("false")
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("says so once when the window closes in the commit that opened it", () => {
    // A child's passive effect runs before the hook's own: close() there clears the
    // live handle ahead of the reconcile, which must not report the window again.
    const win = fakeWindow()
    const onClose = vi.fn()
    function CloseOnMount({ when }: { when: boolean }) {
      useEffect(() => {
        if (when) handle.close()
      }, [when])
      return null
    }
    const ui = (closing: boolean) => (
      <Harness openWindow={opening(win)} onClose={onClose}>
        <CloseOnMount when={closing} />
      </Harness>
    )
    const view = render(ui(false))
    act(() => {
      handle.open()
    })
    view.rerender(ui(true))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("open")).toHaveTextContent("false")
  })

  it("focuses the window it already has instead of opening a second", () => {
    const win = fakeWindow()
    const openWindow = opening(win)
    render(<Harness openWindow={openWindow} />)
    act(() => void handle.open())
    act(() => void handle.open())
    expect(openWindow).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it("comes back when the popout is closed from its own side, and says so once", () => {
    const win = fakeWindow()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    render(<Harness openWindow={opening(win)} onOpen={onOpen} onClose={onClose} />)
    act(() => void handle.open())
    expect(onOpen).toHaveBeenCalledWith(win)
    act(() => win.fire("pagehide"))
    expect(handle.isOpen).toBe(false)
    expect(screen.getByTestId("slot").contains(screen.getByTestId("counter"))).toBe(true)
    act(() => handle.close())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(win.listenerCount("pagehide")).toBe(0)
  })

  it("closes the popout when the page goes away, and when the panel unmounts", () => {
    const win = fakeWindow()
    const view = render(
      <StrictMode>
        <Harness openWindow={opening(win)} />
      </StrictMode>,
    )
    act(() => void handle.open())
    act(() => void window.dispatchEvent(new Event("pagehide")))
    expect(win.close).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(win.close).toHaveBeenCalledTimes(2)
  })

  it("copies the page's styles and keeps the root element's attributes in step", async () => {
    const style = document.createElement("style")
    style.setAttribute("data-test-style", "")
    style.textContent = ":root { --up: green }"
    const link = document.createElement("link")
    link.setAttribute("data-test-style", "")
    link.rel = "stylesheet"
    link.setAttribute("href", "/assets/app.css")
    document.head.append(style, link)
    document.documentElement.className = "dark"
    document.body.className = "antialiased"
    const win = fakeWindow()
    win.document.documentElement.setAttribute("data-leftover", "")
    render(<Harness openWindow={opening(win)} />)
    act(() => void handle.open())
    expect(win.document.head.querySelector("style")?.textContent).toBe(":root { --up: green }")
    expect(win.document.head.querySelector<HTMLLinkElement>("link")?.getAttribute("href")).toBe(link.href)
    expect(win.document.documentElement.className).toBe("dark")
    expect(win.document.documentElement.hasAttribute("data-leftover")).toBe(false)
    expect(win.document.body.className).toBe("antialiased")
    document.documentElement.className = ""
    document.documentElement.setAttribute("data-theme", "classic")
    await vi.waitFor(() => expect(win.document.documentElement.getAttribute("data-theme")).toBe("classic"))
    expect(win.document.documentElement.className).toBe("")
    document.body.className = ""
  })

  it("leaves the popout bare when told not to copy", () => {
    const style = document.createElement("style")
    style.setAttribute("data-test-style", "")
    document.head.append(style)
    const win = fakeWindow()
    render(<Harness openWindow={opening(win)} copyStyles={false} />)
    act(() => void handle.open())
    expect(win.document.head.querySelector("style")).toBeNull()
  })
})
