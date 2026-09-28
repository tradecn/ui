import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, startTransition, StrictMode, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, BlotterActionButton, BlotterActionScope, BlotterGrid, BlotterNewButton, BlotterSelection, useBlotter, useBlotterActions, type BlotterAction, type BlotterProps, type BlotterRow } from "@/registry/tradecn/ui/blotter"
import { OrderToolbar } from "@/demos/blotter-actions"
import { OrderActionPicker } from "@/demos/blotter-layout"

const order = (id: string): BlotterRow => ({ id, time: 0, symbol: "ES", side: "buy", quantity: 1, status: "Working", allowedActions: ["cancel", "amend"] })
const cancel = (run: BlotterAction["run"] = vi.fn()): BlotterAction => ({ id: "cancel", label: "Cancel", run })
function seeded(ids = ["a", "b"]) {
  const store = createRowStore<BlotterRow>({ getRowId: row => row.id })
  store.applyDeltas({ upsert: ids.map(order) })
  return store
}
function Controls({ children, ...props }: BlotterProps) {
  return <Blotter {...props}><BlotterActionScope>{children}</BlotterActionScope></Blotter>
}

describe("Blotter action subscriptions", () => {
  it("preserves drafts, focus and listeners when switching between selected and explicit targets", () => {
    const store = seeded()
    const subscribe = vi.spyOn(store, "subscribeRow")
    const layout = (ids?: string[]) => <Blotter store={store} selection={new Set(["a"])}><BlotterActionScope ids={ids}><input aria-label="Action note" /></BlotterActionScope></Blotter>
    const view = render(layout())
    const input = screen.getByRole("textbox", { name: "Action note" })
    fireEvent.change(input, { target: { value: "Pending action" } })
    input.focus()
    const before = subscribe.mock.calls.length
    view.rerender(layout(["a"]))
    expect(screen.getByRole("textbox")).toBe(input)
    expect(input).toHaveValue("Pending action")
    expect(input).toHaveFocus()
    view.rerender(layout())
    expect(screen.getByRole("textbox")).toBe(input)
    expect(input).toHaveValue("Pending action")
    expect(input).toHaveFocus()
    expect(subscribe).toHaveBeenCalledTimes(before)
  })

  it.each(["", "a\u0000b"])("follows permissions for arbitrary row id %j", id => {
    const store = seeded([id])
    render(<Controls store={store} actions={[cancel()]} selection={new Set([id])}><BlotterActionButton action="cancel" /></Controls>)
    expect(screen.getByRole("button", { name: "Cancel 1" })).toBeEnabled()
    act(() => store.applyDeltas({ patch: [{ id, fields: { allowedActions: [] } }] }))
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })

  it("sees permissions changed between rendering and subscribing", () => {
    const store = seeded()
    function Parent() {
      useLayoutEffect(() => { store.applyDeltas({ patch: [{ id: "a", fields: { allowedActions: [] } }] }) }, [])
      return <Controls store={store} actions={[cancel()]} selection={new Set(["a"])}><BlotterActionButton action="cancel" /></Controls>
    }
    render(<Parent />)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })

  it("shares deduplicated listeners, retains missing targets, and cleans up scope and store replacements", () => {
    const store = seeded()
    const second = seeded(["c"])
    const active = new Map<string, number>()
    for (const [name, source] of [["first", store], ["second", second]] as const) {
      const subscribe = source.subscribeRow.bind(source)
      vi.spyOn(source, "subscribeRow").mockImplementation((id, cb) => {
        const key = `${name}:${id}`
        active.set(key, (active.get(key) ?? 0) + 1)
        const off = subscribe(id, cb)
        return () => { active.set(key, active.get(key)! - 1); off() }
      })
      vi.spyOn(source, "subscribeMeta")
    }
    const run = vi.fn()
    function Layout({ source, ids }: { source: RowStore<BlotterRow>; ids: string[] }) {
      return <StrictMode><Blotter store={source} actions={[cancel(run)]}><BlotterActionScope ids={ids}>
        <BlotterActionButton action="cancel" /><BlotterActionButton action="cancel">Again</BlotterActionButton>
      </BlotterActionScope></Blotter></StrictMode>
    }
    const view = render(<Layout source={store} ids={["a", "a", "missing"]} />)
    expect(active.get("first:a")).toBe(1)
    expect(active.get("first:missing")).toBe(1)
    const subscriptions = vi.mocked(store.subscribeRow).mock.calls.length
    view.rerender(<Layout source={store} ids={["a", "a", "missing"]} />)
    expect(store.subscribeRow).toHaveBeenCalledTimes(subscriptions)
    fireEvent.click(screen.getByRole("button", { name: "Cancel 2 of 3" }))
    expect(run.mock.calls[0]![1]).toEqual(["a", "a"])
    act(() => store.applyDeltas({ upsert: [order("missing")] }))
    expect(screen.getByRole("button", { name: "Cancel 3" })).toBeEnabled()
    act(() => store.clear())
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    view.rerender(<Layout source={second} ids={["c"]} />)
    expect(active.get("first:a")).toBe(0)
    expect(active.get("first:missing")).toBe(0)
    expect(active.get("second:c")).toBe(1)
    expect(screen.getByRole("button", { name: "Cancel 1" })).toBeEnabled()
    expect(store.subscribeMeta).not.toHaveBeenCalled()
    expect(second.subscribeMeta).not.toHaveBeenCalled()
    view.unmount()
    expect([...active.values()].every(count => count === 0)).toBe(true)
  })

  it("keeps unrelated updates local and scans targets only once per batch", () => {
    const store = seeded(["a", "b", "c"])
    const read = vi.spyOn(store, "getRow")
    let rootRenders = 0
    let actionRenders = 0
    function RootProbe() { useBlotter(); rootRenders++; return null }
    function ActionProbe() { const state = useBlotterActions(); actionRenders++; return <p>{state.actions[0]?.allowedIds.length}</p> }
    render(<Blotter store={store} actions={[cancel()]} selection={new Set(["a", "b"])}><RootProbe /><BlotterActionScope><ActionProbe /><BlotterActionButton action="cancel" /></BlotterActionScope></Blotter>)
    const rootBefore = rootRenders
    const actionsBefore = actionRenders
    read.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "c", fields: { status: "Filled" } }], meta: { dropped: 1 } }))
    expect(read).not.toHaveBeenCalled()
    expect(actionRenders).toBe(actionsBefore)
    act(() => store.applyDeltas({ patch: ["a", "b"].map(id => ({ id, fields: { allowedActions: [] } })) }))
    expect(read).toHaveBeenCalledTimes(2)
    expect(rootRenders).toBe(rootBefore)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })
})

describe("Blotter commands and composition", () => {
  it("uses separate explicit targets, root target counts, metadata-only readings and fresh permissions", () => {
    const store = seeded()
    const run = vi.fn()
    let dispatch: (action: string) => void = () => {}
    function Probe() {
      const state = useBlotterActions()
      useLayoutEffect(() => { dispatch = state.run }, [state.run])
      expect(state.actions[0]).not.toHaveProperty("run")
      return <p>{state.ids.join(",")}</p>
    }
    const layout = (id: string) => <Blotter store={store} actions={[cancel(run)]} focusedRowId="a"><BlotterActionScope ids={[id]}><Probe /><BlotterSelection /><BlotterActionButton action="cancel" /></BlotterActionScope></Blotter>
    const view = render(layout("b"))
    expect(screen.getByText("1 selected")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByText("b")).toBeInTheDocument()
    view.rerender(layout("a"))
    act(() => dispatch("cancel"))
    expect(run.mock.calls[0]![1]).toEqual(["a"])
    store.applyDeltas({ patch: [{ id: "a", fields: { allowedActions: [] } }] })
    act(() => dispatch("cancel"))
    expect(run).toHaveBeenCalledTimes(1)
    act(() => dispatch("unknown"))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it.each([{ name: "layout", useCommit: useLayoutEffect }, { name: "passive", useCommit: useEffect }])("publishes current commands before descendant $name effects", ({ useCommit }) => {
    const store = seeded()
    const old = vi.fn()
    const next = vi.fn()
    function Invoke({ tick }: { tick: number }) {
      const { run, newOrder, select, focus } = useBlotter()
      useCommit(() => { run("cancel", ["a"]); newOrder(); select(new Set(["a"])); focus("a") }, [tick, run, newOrder, select, focus])
      return null
    }
    const layout = (handler: () => void, tick: number) => <Blotter store={store} actions={[cancel(handler)]} onNew={handler} onSelectionChange={handler} onFocusedRowChange={handler}><Invoke tick={tick} /></Blotter>
    const view = render(layout(old, 0))
    expect(old).toHaveBeenCalledTimes(4)
    view.rerender(layout(next, 1))
    expect(next).toHaveBeenCalledTimes(4)
    expect(old).toHaveBeenCalledTimes(4)
  })

  it("keeps commands on committed definitions while replacement rendering suspends", async () => {
    const store = seeded()
    const old = vi.fn()
    const next = vi.fn()
    let run: (action: string, ids: readonly string[]) => void = () => {}
    const pending = new Promise<never>(() => {})
    function Child({ wait }: { wait: boolean }) { const commands = useBlotter(); useLayoutEffect(() => { run = commands.run }, [commands.run]); if (wait) throw pending; return null }
    function Parent() {
      const [wait, setWait] = useState(false)
      return <><button onClick={() => startTransition(() => setWait(true))}>Replace</button><Suspense fallback={<p>Waiting</p>}><Blotter store={store} actions={[cancel(wait ? next : old)]}><Child wait={wait} /></Blotter></Suspense></>
    }
    render(<Parent />)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Replace" })) })
    act(() => run("cancel", ["a"]))
    expect(old).toHaveBeenCalledTimes(1)
    expect(next).not.toHaveBeenCalled()
  })

  it("forwards native refs, events, explicit sizes and content while keeping commands cancellable", () => {
    const store = seeded()
    const root = createRef<HTMLDivElement>()
    const button = createRef<HTMLButtonElement>()
    const count = createRef<HTMLSpanElement>()
    const run = vi.fn()
    const onNew = vi.fn()
    const click = vi.fn()
    render(<Blotter ref={root} title="Orders container" onClick={click} store={store} actions={[cancel(run)]} selection={new Set(["a"])} onNew={onNew}>
      <BlotterNewButton size="lg" onClick={event => event.preventDefault()}>Open ticket</BlotterNewButton>
      <BlotterActionScope><BlotterActionButton ref={button} action="cancel" size={null} onClick={event => event.preventDefault()}>Stop order</BlotterActionButton></BlotterActionScope>
      <BlotterSelection ref={count} aria-live="off">{null}</BlotterSelection>
    </Blotter>)
    expect(root.current).toHaveAttribute("title", "Orders container")
    expect(button.current).toHaveTextContent("Stop order")
    expect(button.current).not.toHaveClass("h-6")
    expect(screen.getByRole("button", { name: "Open ticket" })).not.toHaveClass("h-6")
    expect(count.current).toBeEmptyDOMElement()
    expect(count.current).toHaveAttribute("aria-live", "off")
    fireEvent.click(button.current!)
    fireEvent.click(screen.getByRole("button", { name: "Open ticket" }))
    expect(click).toHaveBeenCalledTimes(2)
    expect(run).not.toHaveBeenCalled()
    expect(onNew).not.toHaveBeenCalled()
  })

  it("renders only caller-owned content and disables unavailable commands", () => {
    const view = render(<Blotter store={seeded()} actions={[cancel()]} onNew={() => {}}>{null}</Blotter>)
    expect(screen.queryByRole("grid")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    view.rerender(<Controls store={seeded()}><BlotterNewButton /><BlotterActionButton action="missing" /></Controls>)
    expect(screen.getByRole("button", { name: "New order" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "missing" })).toBeDisabled()
  })

  it("keeps focus useful when ordinary actions complete or permissions disappear", () => {
    const store = seeded()
    const view = render(<Blotter store={store} actions={[cancel(() => store.clear())]} selection={new Set(["a"])}><OrderToolbar /></Blotter>)
    const button = screen.getByRole("button", { name: "Cancel 1" })
    button.focus()
    fireEvent.click(button)
    expect(screen.getByRole("toolbar", { name: "Orders" })).toHaveFocus()
    act(() => store.applyDeltas({ upsert: [order("a")] }))
    screen.getByRole("button", { name: "Cancel 1" }).focus()
    act(() => store.applyDeltas({ patch: [{ id: "a", fields: { allowedActions: [] } }] }))
    expect(screen.getByRole("toolbar", { name: "Orders" })).toHaveFocus()
    act(() => store.applyDeltas({ upsert: [order("a")] }))
    screen.getByRole("button", { name: "Cancel 1" }).focus()
    view.rerender(<Blotter store={store} selection={new Set(["a"])}><OrderToolbar /></Blotter>)
    expect(screen.getByRole("toolbar", { name: "Orders" })).toHaveFocus()
  })

  it("keeps an activated action focused until a later reply makes it unavailable", () => {
    const store = seeded()
    const run = vi.fn()
    render(<Blotter store={store} actions={[cancel(run)]} selection={new Set(["a"])}><OrderToolbar /></Blotter>)
    const button = screen.getByRole("button", { name: "Cancel 1" })
    button.focus()
    fireEvent.click(button)
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(run).toHaveBeenCalledTimes(2)
    act(() => store.applyDeltas({ patch: [{ id: "a", fields: { allowedActions: [] } }] }))
    expect(screen.getByRole("toolbar", { name: "Orders" })).toHaveFocus()
  })

  it("requires a fresh picker choice when the selected definition disappears", () => {
    const store = seeded()
    const run = vi.fn()
    const amend = { id: "amend", label: "Amend", run }
    const layout = (actions: BlotterAction[]) => <Controls store={store} actions={actions} selection={new Set(["a"])}><OrderActionPicker /></Controls>
    const view = render(layout([cancel(run), amend]))
    const picker = screen.getByRole("combobox", { name: "Order action" })
    fireEvent.change(picker, { target: { value: "amend" } })
    screen.getByRole("button").focus()
    view.rerender(layout([cancel(run)]))
    expect(picker).toHaveValue("")
    expect(picker).toHaveFocus()
    expect(screen.getByRole("button")).toBeDisabled()
    fireEvent.submit(screen.getByRole("button").closest("form")!)
    expect(run).not.toHaveBeenCalled()
    view.rerender(layout([cancel(run), amend]))
    expect(picker).toHaveValue("")
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("keeps button defaults when optional native props are explicitly undefined", () => {
    const submit = vi.fn(event => event.preventDefault())
    const view = render(<form onSubmit={submit}><Controls store={seeded()} actions={[{ ...cancel(), destructive: true }]} selection={new Set(["a"])} onNew={() => {}}>
      <BlotterNewButton type={undefined} variant={undefined} />
      <BlotterActionButton action="cancel" type={undefined} variant={undefined} />
    </Controls></form>)
    const button = screen.getByRole("button", { name: "Cancel 1" })
    expect(button).toHaveClass("text-destructive")
    expect(screen.getByRole("button", { name: "New order" })).not.toHaveClass("bg-primary")
    for (const control of screen.getAllByRole("button")) {
      expect(control).toHaveAttribute("type", "button")
      fireEvent.click(control)
    }
    expect(submit).not.toHaveBeenCalled()
    view.rerender(<Controls store={seeded()} actions={[{ ...cancel(), destructive: true }]} selection={new Set(["a"])} onNew={() => {}}>
      <BlotterNewButton type="submit" variant="secondary" />
      <BlotterActionButton action="cancel" type="reset" variant={null} />
    </Controls>)
    expect(screen.getByRole("button", { name: "New order" })).toHaveAttribute("type", "submit")
    expect(screen.getByRole("button", { name: "New order" })).toHaveClass("bg-secondary")
    expect(screen.getByRole("button", { name: "Cancel 1" })).toHaveAttribute("type", "reset")
    expect(screen.getByRole("button", { name: "Cancel 1" })).not.toHaveClass("text-destructive")
  })

  it("dispatches the chosen picker action and focuses the select before dispatch", () => {
    const store = seeded()
    const run = vi.fn(() => store.clear())
    const layout = (actions: BlotterAction[]) => <Controls store={store} actions={actions} selection={new Set(["a"])}><OrderActionPicker /></Controls>
    const view = render(layout([cancel(), { id: "amend", label: "Amend", run: vi.fn() }]))
    fireEvent.change(screen.getByRole("combobox", { name: "Order action" }), { target: { value: "cancel" } })
    view.rerender(layout([cancel(run)]))
    expect(screen.getByRole("combobox")).toHaveValue("cancel")
    screen.getByRole("button", { name: /^Apply / }).focus()
    fireEvent.submit(screen.getByRole("button", { name: /^Apply / }).closest("form")!)
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("combobox")).toHaveFocus()
    expect(screen.getByRole("button", { name: /^Apply / })).toBeDisabled()
    view.rerender(layout([]))
    expect(screen.getByRole("combobox")).toHaveValue("")
    expect(screen.getByRole("option", { name: "No actions available" })).toBeInTheDocument()
  })

  it("recovers picker focus after external revocation, row removal and definition loss without stealing it", () => {
    const store = seeded()
    const layout = (actions = [cancel()]) => <Controls store={store} actions={actions} selection={new Set(["a"])}><OrderActionPicker /><button>Elsewhere</button></Controls>
    const view = render(layout())
    const submit = () => screen.getByRole("button", { name: /^Apply / })
    for (const fields of [{ allowedActions: [] }, { status: "Filled", allowedActions: [] }]) {
      submit().focus()
      act(() => store.applyDeltas({ patch: [{ id: "a", fields }] }))
      expect(screen.getByRole("combobox")).toHaveFocus()
      act(() => store.applyDeltas({ upsert: [order("a")] }))
    }
    submit().focus()
    act(() => store.clear())
    expect(screen.getByRole("combobox")).toHaveFocus()
    act(() => store.applyDeltas({ upsert: [order("a")] }))
    submit().focus()
    view.rerender(layout([]))
    expect(screen.getByRole("combobox")).toHaveFocus()
    view.rerender(layout())
    submit().focus()
    screen.getByRole("button", { name: "Elsewhere" }).focus()
    act(() => store.clear())
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus()
  })

  it.each(["toolbar", "picker"])("does not reclaim focus after deliberately leaving the %s", kind => {
    const store = seeded()
    render(<Blotter store={store} actions={[cancel()]} selection={new Set(["a"])}>{kind === "toolbar" ? <OrderToolbar /> : <BlotterActionScope><OrderActionPicker /></BlotterActionScope>}</Blotter>)
    const button = screen.getByRole("button", { name: kind === "toolbar" ? "Cancel 1" : /^Apply / })
    button.focus()
    button.blur()
    expect(document.body).toHaveFocus()
    act(() => store.clear())
    expect(document.body).toHaveFocus()
  })
})

// These call shapes run through the real TypeScript compiler in the required typecheck.
it("requires composition and rejects released grid inputs on the root", () => {
  const store = seeded()
  // @ts-expect-error Released minimal calls need explicit children.
  const minimal = <Blotter store={store} />
  // @ts-expect-error Retained props must not make a released empty call valid.
  const retained = <Blotter store={store} actions={[cancel()]} onNew={() => {}} selection={new Set()} />
  // @ts-expect-error Columns moved to BlotterGrid.
  const columns = <Blotter store={store} columns={[]}><BlotterGrid /></Blotter>
  // @ts-expect-error Grid labels moved to BlotterGrid.
  const label = <Blotter store={store} label="Orders"><BlotterGrid /></Blotter>
  // @ts-expect-error Custom menus moved to BlotterGrid.
  const menu = <Blotter store={store} renderContextMenu={() => null}><BlotterGrid /></Blotter>
  // @ts-expect-error New button text belongs to its children.
  const newLabel = <Blotter store={store} newLabel="Ticket"><BlotterGrid /></Blotter>
  // @ts-expect-error Delete dispatch belongs to BlotterGrid.
  const deleteAction = <Blotter store={store} deleteAction="cancel"><BlotterGrid /></Blotter>
  // @ts-expect-error Timestamp formatting moved to BlotterGrid.
  const time = <Blotter store={store} time={String}><BlotterGrid /></Blotter>
  // @ts-expect-error Price formatting moved to BlotterGrid.
  const price = <Blotter store={store} price={String}><BlotterGrid /></Blotter>
  // @ts-expect-error Checkbox visibility moved to BlotterGrid.
  const checkboxes = <Blotter store={store} selectionColumn={false}><BlotterGrid /></Blotter>
  // @ts-expect-error Sorting moved to BlotterGrid.
  const sort = <Blotter store={store} sort={{ key: "time", dir: "desc" }}><BlotterGrid /></Blotter>
  // @ts-expect-error A scope needs caller-owned content.
  const scope = <BlotterActionScope ids={[]} />
  const replacement = <Blotter store={store}><BlotterGrid time={String} label="Orders" /><BlotterActionScope><BlotterActionButton action="cancel" /></BlotterActionScope></Blotter>
  const conditional: ReactNode = null
  const empty = <Blotter store={store}>{conditional}</Blotter>
  expect([minimal, retained, columns, label, menu, newLabel, deleteAction, time, price, checkboxes, sort, scope, replacement, empty]).toHaveLength(14)
})
