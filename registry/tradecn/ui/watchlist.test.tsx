import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef, useEffect, useMemo, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore, type RowId, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddInput, WatchlistAddButton, WatchlistRemoveButton, WatchlistRemoveMenuItem, useWatchlist, useWatchlistAdd, watchlistColumns, watchlistRemoveColumn, type WatchlistActions, type WatchlistProps, type WatchlistGridProps, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

const RECT = { width: 700, height: 220 }
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeEach(() => {
  // happy-dom has real Web Animations now, and its cancel() rejects `finished` without marking it
  // handled the way the spec says to, so a flash cancelled at unmount surfaces as an unhandled rejection.
  saved.set("animate", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate"))
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
  // No layout in happy-dom: the virtualizer reads offsetWidth and offsetHeight off the scroll container.
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop))
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
})
afterEach(() => {
  for (const [prop, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  }
  saved.clear()
  vi.restoreAllMocks()
})

const ROWS: WatchlistRow[] = [
  { symbol: "ZN", last: 110.5, bid: 110.46875, ask: 110.53125, change: 0.25, changePct: 0.23, volume: 1_250_000 },
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
  { symbol: "CL", last: 78.1, change: 0, changePct: 0, volume: null },
]

function seeded(): RowStore<WatchlistRow> {
  const store = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })
  store.applyDeltas({ upsert: ROWS })
  return store
}

type HarnessProps = Partial<WatchlistProps & WatchlistGridProps> & { store: RowStore<WatchlistRow>; addPlaceholder?: string }
function Harness({ store, onAdd, onRemove, normalize, validate, selection, onSelectionChange, focusedRowId, onFocusedRowChange, addPlaceholder, ...grid }: HarnessProps) {
  const removable = Boolean(onRemove)
  const columns = useMemo(() => [...(grid.columns ?? watchlistColumns({ price: grid.price })), ...(removable ? [watchlistRemoveColumn()] : [])], [grid.columns, grid.price, removable])
  return (
    <div style={{ height: 300 }}>
      <Watchlist store={store} onAdd={onAdd} onRemove={onRemove} normalize={normalize} validate={validate} selection={selection} onSelectionChange={onSelectionChange} focusedRowId={focusedRowId} onFocusedRowChange={onFocusedRowChange}>
        {onAdd && <WatchlistAddForm><WatchlistAddInput placeholder={addPlaceholder} /><WatchlistAddButton /></WatchlistAddForm>}
        <WatchlistGrid initialRect={RECT} {...grid} columns={columns} renderContextMenu={onRemove ? (_, ids) => <WatchlistRemoveMenuItem ids={ids} /> : grid.renderContextMenu} />
      </Watchlist>
    </div>
  )
}

const rowOf = (symbol: string) => document.querySelector<HTMLElement>(`[data-row-id="${symbol}"]`)!

describe("watchlistColumns", () => {
  it("prints prices through your convention, signs the changes, and uses one token for nothing", () => {
    const store = seeded()
    render(<Harness store={store} price={(v, row) => (row.symbol === "ZN" ? `${Math.floor(v)}-${String(Math.round((v % 1) * 32)).padStart(2, "0")}` : v.toFixed(2))} />)
    expect(within(rowOf("ZN")).getByText("110-16")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("5012.25")).toBeInTheDocument()
    expect(within(rowOf("ZN")).getByText("+0.25")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("−12.50")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("−0.25%")).toBeInTheDocument()
    // No bid, no ask, no volume: one sentinel each, never a blank or a NaN.
    expect(within(rowOf("CL")).getAllByText("–")).toHaveLength(3)
  })

  it("colors a change by its sign, and zero is flat", () => {
    render(<Harness store={seeded()} />)
    expect(within(rowOf("ZN")).getByText("+0.25").className).toContain("text-up")
    expect(within(rowOf("ES")).getByText("−12.50").className).toContain("text-down")
    expect(within(rowOf("CL")).getByText("0.00").className).toContain("text-flat")
  })

  it("is a list you can spread into your own", () => {
    const keys = watchlistColumns().map((c) => c.key)
    expect(keys).toEqual(["symbol", "last", "bid", "ask", "change", "changePct", "volume"])
    const store = seeded()
    render(<Harness store={store} columns={[...watchlistColumns().slice(0, 2), { key: "name", header: "Name", width: 120, accessor: (r) => r.name ?? "" }]} />)
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Name")]))
    expect(screen.queryByRole("columnheader", { name: /Volume/ })).toBeNull()
  })
})

describe("Watchlist", () => {
  it("is the watchlist preset of the grid, under its own slot", () => {
    render(<Harness store={seeded()} />)
    const root = document.querySelector("[data-slot='tradecn-watchlist']")!
    const grid = within(root as HTMLElement).getByRole("grid", { name: "Watchlist" })
    expect(grid).toHaveAttribute("data-preset", "watchlist")
    expect(grid).toHaveAttribute("aria-rowcount", "4")
  })

  it("has no add field and nothing to remove with until you ask for them", () => {
    render(<Harness store={seeded()} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
  })

  it("adds what you type, trimmed and upper-cased, and keeps the field for the next one", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} />)
    const field = screen.getByRole("textbox", { name: "Add symbol" })
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    await user.type(field, " gc {Enter}")
    expect(onAdd).toHaveBeenCalledWith("GC")
    expect(field).toHaveValue("")
    expect(field).toHaveFocus()
    await user.type(field, "nq")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(onAdd).toHaveBeenLastCalledWith("NQ")
  })

  it("goes to a symbol that is already on the list instead of adding it twice", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onSelectionChange = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} onSelectionChange={onSelectionChange} />)
    await user.type(screen.getByRole("textbox"), "es{Enter}")
    expect(onAdd).not.toHaveBeenCalled()
    expect(rowOf("ES")).toHaveAttribute("aria-selected", "true")
    expect(rowOf("ES")).toHaveAttribute("data-focused", "true")
    expect([...onSelectionChange.mock.lastCall![0]]).toEqual(["ES"])
  })

  it("keeps a symbol that does not validate in the field, marked invalid, until it changes", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} validate={(s) => s !== "NOPE"} />)
    const field = screen.getByRole("textbox")
    await user.type(field, "nope{Enter}")
    expect(onAdd).not.toHaveBeenCalled()
    expect(field).toHaveValue("nope")
    expect(field).toHaveAttribute("aria-invalid", "true")
    await user.type(field, "x")
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("removes the focused row on Delete, and the whole selection when there is one", () => {
    const onRemove = vi.fn()
    const view = render(<Harness store={seeded()} onRemove={onRemove} focusedRowId="ES" />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "Delete" })
    expect(onRemove).toHaveBeenLastCalledWith(["ES"])
    view.rerender(<Harness store={seeded()} onRemove={onRemove} focusedRowId="ES" selection={new Set(["ZN", "CL"])} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Backspace" })
    expect(onRemove).toHaveBeenLastCalledWith(["ZN", "CL"])
  })

  it("leaves Delete and Backspace alone in the add field, and does nothing with no row in hand", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Harness store={seeded()} onAdd={() => {}} onRemove={onRemove} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    const field = screen.getByRole("textbox")
    await user.type(field, "zn{Backspace}")
    expect(field).toHaveValue("z")
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("gives each row a remove button that stays out of the tab order", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Harness store={seeded()} onRemove={onRemove} />)
    const button = within(rowOf("CL")).getByRole("button", { name: "Remove CL" })
    expect(button).toHaveAttribute("tabindex", "-1")
    await user.click(button)
    expect(onRemove).toHaveBeenCalledWith(["CL"])
  })

  it("follows the store: a removed symbol leaves, an added one arrives", () => {
    function Live() {
      const [store] = useState(seeded)
      return <Harness store={store} onAdd={(symbol) => store.applyDeltas({ upsert: [{ symbol, last: 1 }] })} onRemove={(ids: RowId[]) => store.applyDeltas({ remove: ids })} focusedRowId="ZN" />
    }
    render(<Live />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    expect(rowOf("ZN")).toBeNull()
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "3")
  })

  it("does not re-render a row of the grid while you type in the add field, or when the parent re-renders", async () => {
    const user = userEvent.setup()
    let cellRenders = 0
    const columns = [...watchlistColumns(), { key: "probe", header: "Probe", width: 40, accessor: () => 0, cell: () => ((cellRenders += 1), (<i>p</i>)) }]
    const store = seeded()
    function Parent() {
      const [n, setN] = useState(0)
      // Inline callbacks on purpose: the component reads them through a ref so they can be.
      return (
        <>
          <button onClick={() => setN(n + 1)}>parent {n}</button>
          <Harness store={store} columns={columns} onAdd={() => {}} onRemove={() => {}} renderContextMenu={() => null} />
        </>
      )
    }
    render(<Parent />)
    const before = cellRenders
    expect(before).toBeGreaterThan(0)
    await user.type(screen.getByRole("textbox"), "abcdef")
    expect(cellRenders).toBe(before)
    await user.click(screen.getByRole("button", { name: /parent/ }))
    expect(cellRenders).toBe(before)
    // And a delta to one row still re-renders that row.
    act(() => store.applyDeltas({ patch: [{ id: "ZN", fields: { last: 111 } }] }))
    expect(cellRenders).toBe(before + 1)
  })
})

function AlternateControls() {
  const { targets } = useWatchlist()
  return <WatchlistRemoveButton ids={targets}>Remove chosen</WatchlistRemoveButton>
}

function Choice() {
  const { draft, setDraft, invalid, canAdd, canSubmit, submit } = useWatchlistAdd()
  return <>
    <select aria-label="Choose instrument" value={draft} onChange={event => setDraft(event.target.value)} aria-invalid={invalid || undefined} disabled={!canAdd}>
      <option value="">Choose</option><option value="GC">Gold</option><option value="ES">Equities</option>
    </select>
    <button type="button" disabled={!canSubmit} onClick={submit}>Watch</button>
  </>
}

describe("Watchlist composition", () => {
  it("renders only supplied children even when commands are available", () => {
    render(<Watchlist store={seeded()} onAdd={vi.fn()} onRemove={vi.fn()}><p>My portfolio</p></Watchlist>)
    expect(screen.queryByRole("grid")).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shares duplicate selection with separate footer actions and a custom select", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    render(<Watchlist store={seeded()} onAdd={onAdd} onRemove={onRemove}>
      <WatchlistGrid columns={watchlistColumns().slice(0, 2)} initialRect={RECT} />
      <footer><AlternateControls /></footer>
      <aside><WatchlistAddForm><Choice /></WatchlistAddForm></aside>
    </Watchlist>)
    expect(screen.getByRole("button", { name: "Remove chosen" })).toBeDisabled()
    expect(screen.queryByRole("columnheader", { name: "Remove" })).toBeNull()
    await user.selectOptions(screen.getByRole("combobox"), "ES")
    await user.click(screen.getByRole("button", { name: "Watch" }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox")).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Remove chosen" }))
    expect(onRemove).toHaveBeenCalledWith(["ES"])
  })

  it("forwards native props, refs and cancellable input, form, removal and grid events", () => {
    const store = seeded()
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    const root = createRef<HTMLDivElement>()
    const input = createRef<HTMLInputElement>()
    const form = createRef<HTMLFormElement>()
    const button = createRef<HTMLButtonElement>()
    const grid = createRef<HTMLDivElement>()
    const cancel = (event: { preventDefault: () => void }) => event.preventDefault()
    const view = render(<Watchlist store={store} onAdd={onAdd} onRemove={onRemove} ref={root} title="Portfolio" focusedRowId="ES">
      <WatchlistAddForm ref={form} id="add-quote" onSubmit={cancel}>
        <WatchlistAddInput ref={input} aria-label="Ticker" name="symbol" onChange={cancel} />
        <WatchlistAddButton ref={button}>Watch quote</WatchlistAddButton>
      </WatchlistAddForm>
      <WatchlistRemoveButton ids={["ES"]} onClick={cancel}>Remove one</WatchlistRemoveButton>
      <WatchlistGrid ref={grid} onKeyDown={cancel} initialRect={RECT} />
    </Watchlist>)
    expect(root.current).toHaveAttribute("title", "Portfolio")
    expect(form.current).toHaveAttribute("id", "add-quote")
    expect(input.current).toHaveAttribute("name", "symbol")
    expect(button.current).toHaveTextContent("Watch quote")
    expect(grid.current).toContainElement(screen.getByRole("grid"))
    fireEvent.change(input.current!, { target: { value: "gc" } })
    expect(input.current).toHaveValue("")
    fireEvent.click(screen.getByRole("button", { name: "Remove one" }))
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    expect(onRemove).not.toHaveBeenCalled()
    view.rerender(<Watchlist store={store} onAdd={onAdd}><WatchlistAddForm onSubmit={cancel}><WatchlistAddInput /><WatchlistAddButton /></WatchlistAddForm></Watchlist>)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gc" } })
    fireEvent.submit(screen.getByRole("textbox").closest("form")!)
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox")).toHaveValue("gc")
  })

  it("uses current commands, store and validation without resetting drafts", () => {
    const first = vi.fn()
    const second = vi.fn()
    const validate = vi.fn(() => false)
    const store = seeded()
    function Tree({ active, next = false }: { active: boolean; next?: boolean }) {
      return <Watchlist store={store} onAdd={active ? (next ? second : first) : undefined} validate={next ? undefined : validate}>
        <WatchlistAddForm><WatchlistAddInput /><WatchlistAddButton /></WatchlistAddForm>
      </Watchlist>
    }
    const view = render(<Tree active />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "gc" } })
    fireEvent.submit(input.closest("form")!)
    expect(input).toHaveAttribute("aria-invalid", "true")
    view.rerender(<Tree active={false} />)
    expect(input).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    fireEvent.submit(input.closest("form")!)
    expect(first).not.toHaveBeenCalled()
    view.rerender(<Tree active next />)
    fireEvent.submit(input.closest("form")!)
    expect(second).toHaveBeenCalledWith("GC")
    expect(input).toHaveValue("")
    expect(input).not.toHaveAttribute("aria-invalid")
  })

  it("preserves normalization order, controlled duplicate requests and thrown callbacks", () => {
    let actions: WatchlistActions | undefined
    function Commands() {
      const current = useWatchlist()
      useEffect(() => { actions = current }, [current])
      return null
    }
    const validate = vi.fn(() => false)
    const normalize = vi.fn((raw: string) => raw === "empty" ? "" : raw.toUpperCase())
    const onAdd = vi.fn()
    const select = vi.fn()
    const focus = vi.fn()
    const store = seeded()
    const view = render(<Watchlist store={store} onAdd={onAdd} normalize={normalize} validate={validate} selection={new Set()} focusedRowId={null} onSelectionChange={select} onFocusedRowChange={focus}><Commands /><WatchlistGrid initialRect={RECT} /></Watchlist>)
    act(() => { expect(actions!.add(" ")).toBe(false) })
    expect(normalize).not.toHaveBeenCalled()
    act(() => { expect(actions!.add("empty")).toBe(true) })
    expect(validate).not.toHaveBeenCalled()
    act(() => { expect(actions!.add("es")).toBe(true) })
    expect(select).toHaveBeenCalledWith(new Set(["ES"]))
    expect(focus).toHaveBeenCalledWith("ES")
    expect(rowOf("ES")).not.toHaveAttribute("aria-selected", "true")
    expect(validate).not.toHaveBeenCalled()
    act(() => { expect(actions!.add("gc")).toBe(false) })
    expect(onAdd).not.toHaveBeenCalled()
    const error = new Error("Rejected by application")
    view.rerender(<Watchlist store={store} onAdd={() => { throw error }}><Commands /></Watchlist>)
    expect(() => actions!.add("GC")).toThrow(error)
    const replacement = createRowStore<WatchlistRow>({ getRowId: row => row.symbol })
    view.rerender(<Watchlist store={replacement} onAdd={onAdd}><Commands /></Watchlist>)
    act(() => { expect(actions!.add("ES")).toBe(true) })
    expect(onAdd).toHaveBeenCalledWith("ES")
  })

  it("keeps each form draft independent and disables removal when its callback disappears", () => {
    const onRemove = vi.fn()
    const store = seeded()
    const content = <>
      <WatchlistAddForm><WatchlistAddInput aria-label="First" /></WatchlistAddForm>
      <WatchlistAddForm><WatchlistAddInput aria-label="Second" /></WatchlistAddForm>
      <WatchlistRemoveButton ids={["ES"]}>Remove ES</WatchlistRemoveButton>
    </>
    const view = render(<Watchlist store={store} onAdd={vi.fn()} onRemove={onRemove}>{content}</Watchlist>)
    fireEvent.change(screen.getByRole("textbox", { name: "First" }), { target: { value: "GC" } })
    expect(screen.getByRole("textbox", { name: "Second" })).toHaveValue("")
    view.rerender(<Watchlist store={store} onAdd={vi.fn()}>{content}</Watchlist>)
    expect(screen.getByRole("button", { name: "Remove ES" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Remove ES" }))
    expect(onRemove).not.toHaveBeenCalled()
  })
})

it("requires explicit composition and grid-prop migration in the real compiler", () => {
  const store = seeded()
  // @ts-expect-error Released minimal usage must not silently become an empty container.
  const minimal = <Watchlist store={store} />
  // @ts-expect-error Retained props still require children.
  const retained = <Watchlist store={store} onAdd={() => {}} onRemove={() => {}} normalize={s => s.trim()} validate={Boolean} selection={new Set()} focusedRowId={null} className="h-48" />
  // @ts-expect-error Grid columns moved to WatchlistGrid.
  const columns = <Watchlist store={store} columns={watchlistColumns()}><WatchlistGrid /></Watchlist>
  // @ts-expect-error Accessible grid name moved to WatchlistGrid.
  const label = <Watchlist store={store} label="Quotes"><WatchlistGrid /></Watchlist>
  // @ts-expect-error Custom menus moved to WatchlistGrid.
  const menu = <Watchlist store={store} renderContextMenu={() => null}><WatchlistGrid /></Watchlist>
  // @ts-expect-error Input naming moved to WatchlistAddInput.
  const placeholder = <Watchlist store={store} addPlaceholder="Symbol"><WatchlistGrid /></Watchlist>
  // @ts-expect-error Formatting moved to WatchlistGrid.
  const price = <Watchlist store={store} price={(n: number) => String(n)}><WatchlistGrid /></Watchlist>
  // @ts-expect-error Activation moved to WatchlistGrid.
  const activate = <Watchlist store={store} onRowActivate={() => {}}><WatchlistGrid /></Watchlist>
  // @ts-expect-error A form needs caller-owned controls.
  const form = <WatchlistAddForm />
  // @ts-expect-error The form owns the input's value.
  const value = <WatchlistAddInput value="ES" />
  // @ts-expect-error The form owns the input's initial value too.
  const initial = <WatchlistAddInput defaultValue="ES" />
  // @ts-expect-error Invalid state belongs to the form even though JSX permits unknown hyphenated attributes.
  const invalid = <WatchlistAddInput aria-invalid />
  const replacement = <Watchlist store={store} ref={createRef<HTMLDivElement>()} onClick={() => {}}>
    <WatchlistAddForm><WatchlistAddInput placeholder="Symbol" /><WatchlistAddButton /></WatchlistAddForm>
    <WatchlistGrid columns={watchlistColumns()} label="Quotes" />
  </Watchlist>
  const conditional = <Watchlist store={store}>{store.getRow("GC") ? <WatchlistGrid /> : null}</Watchlist>
  expect([minimal, retained, columns, label, menu, placeholder, price, activate, form, value, initial, invalid, replacement, conditional]).toHaveLength(14)
})

it("leaves subscription ownership with the grid and releases its listeners on unmount", () => {
  const store = seeded()
  let active = 0
  const order = store.subscribeOrder.bind(store)
  const meta = store.subscribeMeta.bind(store)
  const row = store.subscribeRow.bind(store)
  function tracked(stop: () => void) {
    active++
    return () => { active--; stop() }
  }
  vi.spyOn(store, "subscribeOrder").mockImplementation(cb => tracked(order(cb)))
  vi.spyOn(store, "subscribeMeta").mockImplementation(cb => tracked(meta(cb)))
  vi.spyOn(store, "subscribeRow").mockImplementation((id, cb) => tracked(row(id, cb)))
  const view = render(<Watchlist store={store} onAdd={vi.fn()}><WatchlistAddForm><WatchlistAddInput /></WatchlistAddForm></Watchlist>)
  expect(active).toBe(0)
  view.rerender(<Watchlist store={store}><WatchlistGrid initialRect={RECT} /></Watchlist>)
  expect(active).toBeGreaterThan(0)
  act(() => store.applyDeltas({ patch: [{ id: "ES", fields: { last: null } }] }))
  expect(within(rowOf("ES")).getByText("–")).toBeInTheDocument()
  act(() => store.applyDeltas({ patch: [{ id: "ES", fields: { last: 5000 } }] }))
  expect(within(rowOf("ES")).getByText("5,000.00")).toBeInTheDocument()
  view.unmount()
  expect(active).toBe(0)
})

it("uses the latest removal callback and disables an already open menu when removal disappears", async () => {
  const store = seeded()
  const first = vi.fn()
  const second = vi.fn()
  const menu = (_rows: WatchlistRow[], ids: string[]) => <WatchlistRemoveMenuItem ids={ids} />
  function List({ onRemove }: { onRemove?: (ids: string[]) => void }) {
    return <Watchlist store={store} onRemove={onRemove}><WatchlistGrid initialRect={RECT} renderContextMenu={menu} /></Watchlist>
  }
  const view = render(<List onRemove={first} />)
  fireEvent.contextMenu(rowOf("ES"))
  await screen.findByRole("menuitem", { name: "Remove ES" })
  view.rerender(<List onRemove={second} />)
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove ES" }))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith(["ES"])
  fireEvent.contextMenu(rowOf("CL"))
  await screen.findByRole("menuitem", { name: "Remove CL" })
  view.rerender(<List />)
  const remove = screen.getByRole("menuitem", { name: "Remove CL" })
  expect(remove).toHaveAttribute("aria-disabled", "true")
  fireEvent.click(remove)
  expect(second).toHaveBeenCalledTimes(1)
})

it("clears a rejected draft's invalid state when that symbol arrives before resubmission", () => {
  const store = seeded()
  const onAdd = vi.fn()
  const validate = vi.fn(() => false)
  render(<Harness store={store} onAdd={onAdd} validate={validate} />)
  const input = screen.getByRole("textbox")
  fireEvent.change(input, { target: { value: "gc" } })
  fireEvent.submit(input.closest("form")!)
  expect(input).toHaveAttribute("aria-invalid", "true")
  act(() => store.applyDeltas({ upsert: [{ symbol: "GC", last: null }] }))
  fireEvent.submit(input.closest("form")!)
  expect(input).toHaveValue("")
  expect(input).not.toHaveAttribute("aria-invalid")
  expect(validate).toHaveBeenCalledTimes(1)
  expect(onAdd).not.toHaveBeenCalled()
  expect(rowOf("GC")).toHaveAttribute("aria-selected", "true")
})

it("keeps add-button density when callers add a class and permits an explicit size override", () => {
  const store = seeded()
  function Form({ className }: { className: string }) {
    return <Watchlist store={store} onAdd={vi.fn()}><WatchlistAddForm><WatchlistAddButton className={className} /></WatchlistAddForm></Watchlist>
  }
  const view = render(<Form className="mt-2" />)
  expect(screen.getByRole("button", { name: "Add" })).toHaveClass("h-6", "px-2", "text-xs", "mt-2")
  view.rerender(<Form className="h-8" />)
  expect(screen.getByRole("button", { name: "Add" })).toHaveClass("h-8", "px-2", "text-xs")
  expect(screen.getByRole("button", { name: "Add" })).not.toHaveClass("h-6")
})
