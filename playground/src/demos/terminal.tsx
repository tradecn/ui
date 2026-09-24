import { cn } from "cn"
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { QuotePanel as TwoWayPanel, type QuoteAction, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import { RfqTicket, type RfqAction, type RfqInquiry, type RfqLevels } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { Ticket, type TicketAction, type TicketDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"
import { useActiveInquiry, type ActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { useNow } from "@/registry/tradecn/hooks/use-clock"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import { useRow, useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { createAlertStore, type Alert, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { createInstrumentFormatter, formatDv01, formatNotional, formatPrice, formatQuantity, roundToTick, NUMERIC_CLASS, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { formatKeys, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import type { Limits } from "@/registry/tradecn/lib/limits"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { createPreferences, type Preferences } from "@/registry/tradecn/lib/preferences"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore, type RowId, type RowStore, type RowView } from "@/registry/tradecn/lib/row-store"
import { createSessionCalendar } from "@/registry/tradecn/lib/session-calendar"
import { WINDOW_SET_SLOT, mainWindow, readWindowSet, windowSetOf, writeWindowSet } from "@/registry/tradecn/lib/window-set"
import type { WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { Alerts, AlertsList, AlertsEmpty, AlertsAnnouncer, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertActions, AlertActionButton, AlertDismiss, AlertHistory, useAlert, useAlertView } from "@/registry/tradecn/ui/alerts"
import { AuditTrail, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"
import { Blotter, blotterColumns, type BlotterAction, type BlotterRow } from "@/registry/tradecn/ui/blotter"
import { ColumnChooser } from "@/registry/tradecn/ui/column-chooser"
import { CommandPalette, createActionRegistry, type ActionRegistry, type PaletteAction } from "@/registry/tradecn/ui/command-palette"
import { Countdown } from "@/registry/tradecn/ui/countdown"
import { DataGrid, EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState, type EditChange, type SortState } from "@/registry/tradecn/ui/data-grid"
import { DepthLadder, levelId, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"
import { FeedHealth, type FeedDescriptor } from "@/registry/tradecn/ui/feed-health"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"
import { HotkeyEditor } from "@/registry/tradecn/ui/hotkey-editor"
import { InstrumentSearch, toSymbolAdapter, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"
import { LayoutManager, readLayoutTemplates, writeLayoutTemplates } from "@/registry/tradecn/ui/layout-manager"
import { LinkGroupDot, PanelActions, PanelContent, PanelHeader, PanelTitle, SymbolTag } from "@/registry/tradecn/ui/panel"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"
import { PriceChart } from "@/registry/tradecn/ui/price-chart"
import { RfqStack, bySize, byTimeLeft, rfqStackColumns, stackOrder, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"
import { RulesEditor } from "@/registry/tradecn/ui/rules-editor"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"
import { SessionGuard, SessionStatus } from "@/registry/tradecn/ui/session-guard"
import { SpreadMatrix, type SpreadInstrument, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"
import { StatusBar } from "@/registry/tradecn/ui/status-bar"
import { Watchlist, watchlistColumns, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

// One desk, every item. A workspace of fourteen panels over one pretend venue and one pretend server, which decide
// every status and every allowed action the way real ones do; the components print the words and offer what
// they are allowed. tradecn.dev frames this at /preview/terminal/ on its opening page, and a test in scripts/site
// holds it to the whole registry, so a new item joins this desk before it ships.
//
// The market is six futures on a watchlist; a chart, a ladder, an order ticket, a tape, and the positions follow
// the symbol through link group 1, and a click on the ladder starts the order ticket from that price and side. The inquiries are cash Treasuries: the stack orders them, the quote ticket
// takes the active one, and the quoter sheet says which the auto-quoter answers on its own. Every order lands
// in the blotter and every step of its life in the audit trail; fills, rejects, and a slow feed become notices.

// The instruments. Treasuries print in 32nds and the rest in decimals, through one convention each.
const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const decimal = (decimals: number, tick: number): InstrumentConvention => ({ price: { kind: "decimal", decimals }, tick })
const ust = createInstrumentFormatter(T32)

interface Future {
  symbol: string
  name: string
  px: number
  convention: InstrumentConvention
  /** Dollars a one-point move is worth on one contract. */
  pointValue: number
  /** Dollars a basis point is worth on one contract; null where the notion does not apply. */
  dv01: number | null
}

const FUTURES: Record<string, Future> = {
  ZT: { symbol: "ZT", name: "2-Year T-Note", px: 102.25, convention: T32, pointValue: 2000, dv01: 35 },
  ZF: { symbol: "ZF", name: "5-Year T-Note", px: 106.5, convention: T32, pointValue: 1000, dv01: 45 },
  ZN: { symbol: "ZN", name: "10-Year T-Note", px: 110.5, convention: T32, pointValue: 1000, dv01: 65 },
  ZB: { symbol: "ZB", name: "T-Bond", px: 118.75, convention: T32, pointValue: 1000, dv01: 130 },
  ES: { symbol: "ES", name: "E-mini S&P 500", px: 5012.25, convention: decimal(2, 0.25), pointValue: 50, dv01: null },
  NQ: { symbol: "NQ", name: "E-mini Nasdaq-100", px: 17650.5, convention: decimal(2, 0.25), pointValue: 20, dv01: null },
  CL: { symbol: "CL", name: "Crude Oil", px: 78.1, convention: decimal(2, 0.01), pointValue: 1000, dv01: null },
  GC: { symbol: "GC", name: "Gold", px: 2380.4, convention: decimal(1, 0.1), pointValue: 100, dv01: null },
}
const DEFAULT_SYMBOL = "ZN"
const WATCHED = ["ZT", "ZF", "ZN", "ZB", "ES", "CL"]
const futureOf = (symbol: string | null | undefined): Future => (symbol && FUTURES[symbol]) || FUTURES[DEFAULT_SYMBOL]!
const price = (value: number, symbol: string) => formatPrice(value, futureOf(symbol).convention.price)
const money = (value: number) => formatDv01(value, { compact: true })

// The cash Treasuries the inquiries come in on.
const NOTES = [
  { id: "2Y", name: "T 4 1/4 02/15/29", px: 100.25 },
  { id: "5Y", name: "T 3 7/8 08/15/30", px: 99.75 },
  { id: "10Y", name: "T 4 1/8 05/15/34", px: 99.5 },
  { id: "30Y", name: "T 4 5/8 05/15/54", px: 98.6875 },
]
const CLIENTS: [string, string][] = [
  ["Client A", "Tier 1"],
  ["Client B", "Tier 2"],
  ["Client C", "Tier 1"],
  ["Client D", "Tier 3"],
]
const ENDED = new Set(["Done", "Done away", "Passed", "Expired"])
const ACCOUNTS = [
  { id: "A-1", label: "A-1" },
  { id: "A-2", label: "A-2" },
]

// What the stores hold.
interface Quote extends WatchlistRow {
  symbol: string
  close: number
  closes: number[]
}
interface Inquiry extends RfqStackRow {
  note: string
  quoted?: RfqLevels
  message?: string
}
interface Print {
  id: string
  at: number
  symbol: string
  side: "buy" | "sell"
  size: number
  px: number
  mine?: boolean
}
interface Staged {
  id: "order"
  seq: number
  symbol: string
  price: number
  side: "buy" | "sell"
}
interface Sheet extends ParameterRow {
  skew: number
  width: number
  maxSize: number
}

// The fat-finger lines both tickets check a draft against: ask again past the first, stop at the second.
const ORDER_LIMITS: Limits = { maxQuantity: { confirm: 50, block: 500 }, minQuantity: 1, maxDistance: { ticks: 8 } }
const RFQ_LIMITS: Limits = { maxQuantity: { confirm: 25_000_000, block: 100_000_000 }, maxDistance: { ticks: 6 } }
// What the server allows on a two-way in each of its states, by id: the quote panel shows these as the row's buttons.
const QUOTE_ALLOWED: Record<string, readonly string[]> = { Quoting: ["edit", "pause", "pull"], Paused: ["edit", "resume", "pull"], Pulled: ["edit", "resume"] }

// Rules as data for the stack: a large inquiry tints its row, a top-tier client its cell. The Rules dialog edits them.
const STACK_RULES: GridRules = {
  columns: [
    { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row", label: "Large" },
    { id: "tier1", column: "client", when: { op: "in", values: ["Client A", "Client C"] }, tone: "up", label: "Tier 1 client" },
  ],
}
const STACK_COLUMNS = rfqStackColumns<Inquiry>({ price: (value) => ust.price(value) })
const STACK_ORDER = stackOrder<Inquiry>(bySize, byTimeLeft)

// The auto-quoter's sheet: per note, the skew and the width in 64ths, and the largest size it answers alone.
const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (r) => r.skew, step: 0.25, min: -4, max: 4 },
  { key: "width", header: "Width", accessor: (r) => r.width, step: 0.5, min: 0.5, decimals: 1 },
  { key: "maxSize", header: "Auto up to", accessor: (r) => r.maxSize, decimals: 0, step: 1, min: 0, format: (v) => `${Number(v)}mm` },
]

// Declared once, by id. The tickets and the palette declare their own on mount.
const BINDINGS: HotkeyBinding[] = [
  { id: "go.watchlist", keys: "g w", scope: "global", description: "Go to the watchlist", group: "Go" },
  { id: "go.stack", keys: "g i", scope: "global", description: "Go to the inquiries", group: "Go" },
  { id: "go.quote", keys: "g q", scope: "global", description: "Go to the quote", group: "Go" },
  { id: "go.order", keys: "g o", scope: "global", description: "Go to the order ticket", group: "Go" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.chart", keys: "g c", scope: "global", description: "Go to the chart", group: "Go" },
  { id: "workspace.next", keys: "]", scope: "global", description: "Next panel", group: "Workspace" },
  { id: "workspace.previous", keys: "[", scope: "global", description: "Previous panel", group: "Workspace" },
  { id: "desk.find", keys: "d f", scope: "global", description: "Find an instrument", group: "Desk" },
  { id: "desk.layouts", keys: "d l", scope: "global", description: "Layouts", group: "Desk" },
  { id: "desk.keys", keys: "d k", scope: "global", description: "Keys", group: "Desk" },
  { id: "desk.rules", keys: "d r", scope: "global", description: "Rules for the inquiries", group: "Desk" },
]

// CME Globex hours for the Treasury futures: 17:00 to 16:00 Central, Sunday evening to Friday afternoon.
// No holidays are loaded here; a real desk supplies the exchange's calendar.
const GLOBEX = createSessionCalendar({ zone: "America/Chicago", sessions: [{ days: [0, 1, 2, 3, 4], open: "17:00", close: "16:00" }] })
const CLOCKS = [
  { label: "Chicago", zone: "America/Chicago" },
  { label: "London", zone: "Europe/London" },
]

// The instrument master, 200 ms away, keyed by ticker and name. The palette's symbol search is the same function.
const MASTER: InstrumentHit[] = Object.values(FUTURES).map((f) => ({ id: f.symbol, symbol: f.symbol, name: `${f.name} future`, kind: "Future", exchange: "CME" }))
const search: InstrumentSearchFn = (query, _hint, signal) =>
  new Promise((resolve, reject) => {
    const q = query.trim().toUpperCase()
    const t = setTimeout(() => resolve(MASTER.filter((h) => h.symbol.startsWith(q) || h.name?.toUpperCase().includes(q))), 200)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new Error("aborted"))
    })
  })
const symbols = toSymbolAdapter(search)

const clockTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
const TAPE_COLUMNS: ColumnDef<Print>[] = [
  { key: "at", header: "Time", width: 76, accessor: (p) => p.at, format: (v) => clockTime.format(v as number), font: "numeric" },
  { key: "symbol", header: "Sym", width: 48, accessor: (p) => p.symbol },
  { key: "side", header: "Side", width: 48, accessor: (p) => p.side, flash: false, cell: ({ value }) => <span className={value === "buy" ? "text-up" : "text-down"}>{value === "buy" ? "Buy" : "Sell"}</span> },
  { key: "size", header: "Size", width: 56, numeric: true, accessor: (p) => p.size, format: (v) => formatQuantity(v as number) },
  { key: "px", header: "Price", width: 88, numeric: true, accessor: (p) => p.px, format: (v, row) => price(v as number, row.symbol) },
  { key: "mine", header: "", width: 44, accessor: (p) => (p.mine ? "mine" : ""), flash: false },
]
const BY_TIME: SortState = { key: "time", dir: "desc" }

// Grids inside a panel sit flush; the panel draws the border.
const GRID = "rounded-none border-0"
const ACTION = "h-5 px-1.5 text-xs"

// The desk: every store, and the commands the panels send to the pretend server.
interface Desk {
  quotes: RowStore<Quote>
  inquiries: RowStore<Inquiry>
  orders: RowStore<BlotterRow>
  events: RowStore<AuditEvent>
  prints: RowStore<Print>
  positions: RowStore<PositionRow>
  sheet: RowStore<Sheet>
  /** The desk's two-way in the notes: the market, the desk's levels at the quoter's skew and width, the server's status word. */
  markets: RowStore<QuoteRow>
  feeds: RowStore<FeedDescriptor>
  /** One row, "order": the price and side the ladder last staged, for the order ticket to start from. */
  staged: RowStore<Staged>
  alerts: AlertStore
  actions: ActionRegistry
  /** The workspace, once it is up; the go keys and the layouts reach it here. */
  attach(api: WorkspaceApi): void
  api(): WorkspaceApi | null
  /** Puts a symbol on the watchlist, so the chart and the ticket have a market for it. */
  watch(symbol: string): void
  /** A symbol's book, levels keyed by tick: made the first time a ladder asks, fed by the venue from then on. */
  book(symbol: string): RowStore<DepthLevel>
  /** A symbol's one-minute bars: three hours of history the first time a chart asks, then every print the venue makes. */
  bars(symbol: string): RowStore<Bar>
  /** The ladder's click: the order ticket starts again from this price and side, and takes the focus. */
  stage(symbol: string, stage: LadderStage): void
  send(draft: TicketDraft, instrument: TicketInstrument): string
  cancel(ids: readonly RowId[]): void
  quote(id: string, levels: RfqLevels): void
  pass(id: string): void
  /** A level, size, skew, or width typed on the quote panel: the server writes it back, or refuses it. */
  setQuote(change: EditChange<QuoteRow>): Promise<void>
  /** Pause, resume, or pull one two-way; the server's word and its allowed actions follow. */
  quoteAction(id: string, action: string): void
  pullQuotes(rows: readonly QuoteRow[]): void
  reconnect(): void
  /** Starts the venue and the server; returns what stops them. */
  start(): () => void
}

const quoteFor = (f: Future): Quote => ({
  symbol: f.symbol,
  name: f.name,
  last: f.px,
  bid: roundToTick(f.px - f.convention.tick, f.convention.tick),
  ask: roundToTick(f.px + f.convention.tick, f.convention.tick),
  change: 0,
  changePct: 0,
  volume: 0,
  close: f.px,
  closes: [f.px],
})

const pad = (n: number) => String(n).padStart(4, "0")
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

function createDesk(): Desk {
  const now = Date.now()
  const quotes = createRowStore<Quote>({ getRowId: (r) => r.symbol })
  quotes.applyDeltas({ upsert: WATCHED.map((s) => quoteFor(FUTURES[s]!)) })
  const inquiries = createRowStore<Inquiry>({ getRowId: (r) => r.id, lane: "ordered" })
  const orders = createRowStore<BlotterRow>({ getRowId: (r) => r.id, lane: "ordered" })
  const events = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
  const prints = createRowStore<Print>({ getRowId: (p) => p.id, lane: "ordered" })
  const positions = createRowStore<PositionRow>({ getRowId: (p) => p.id })
  const staged = createRowStore<Staged>({ getRowId: (s) => s.id })
  let stageSeq = 0
  // The books, one store per symbol, made when a ladder first asks. The venue rebuilds a book around its quote
  // when the quote moves and stirs a couple of sizes when it does not, and the desk's working orders sit on
  // their rungs as its own size, so a fill or a cancel takes the size off the rung.
  const books = new Map<string, RowStore<DepthLevel>>()
  const LEVELS_A_SIDE = 12
  const lotOf = (symbol: string) => (symbol === "ES" ? 1 : 5)
  const mineAt = (symbol: string, tick: number) => {
    const mine = new Map<number, { bid: number; ask: number }>()
    for (const id of orders.getIds()) {
      const o = orders.getRow(id)
      if (!o || o.symbol !== symbol || o.price === null || o.price === undefined || !o.allowedActions?.includes("cancel")) continue
      const t = tickIndexOf(o.price, tick)
      const at = mine.get(t) ?? { bid: 0, ask: 0 }
      at[o.side === "buy" ? "bid" : "ask"] += o.quantity - (o.filled ?? 0)
      mine.set(t, at)
    }
    return mine
  }
  const levelsFor = (symbol: string): DepthLevel[] => {
    const q = quotes.getRow(symbol)
    const f = FUTURES[symbol]
    if (!q || !f) return []
    const tick = f.convention.tick
    const last = q.last ?? q.close
    const bid = tickIndexOf(q.bid ?? last - tick, tick)
    const ask = tickIndexOf(q.ask ?? last + tick, tick)
    const mine = mineAt(symbol, tick)
    const size = () => lotOf(symbol) * (2 + Math.floor(Math.random() * 60))
    const levels: DepthLevel[] = []
    for (let i = 0; i < LEVELS_A_SIDE; i++) {
      levels.push({ tick: bid - i, bidSize: size(), myBid: mine.get(bid - i)?.bid || null })
      levels.push({ tick: ask + i, askSize: size(), myAsk: mine.get(ask + i)?.ask || null })
    }
    // A working order off the book's levels gets a rung of its own, so the desk's size always shows.
    for (const [t, at] of mine) if (t < bid - LEVELS_A_SIDE + 1 || t > ask + LEVELS_A_SIDE - 1 || (t > bid && t < ask)) levels.push({ tick: t, myBid: at.bid || null, myAsk: at.ask || null })
    return levels
  }
  const rebuildBook = (symbol: string) => {
    const store = books.get(symbol)
    if (!store) return
    const levels = levelsFor(symbol)
    const keep = new Set(levels.map((l) => levelId(l.tick)))
    store.applyDeltas({ upsert: levels, remove: store.getIds().filter((id) => !keep.has(id)) })
  }
  const stirBook = (symbol: string) => {
    const store = books.get(symbol)
    const f = FUTURES[symbol]
    if (!store || !f) return
    const ids = store.getIds()
    if (!ids.length) return
    const patch: { id: RowId; fields: Partial<DepthLevel> }[] = []
    for (let n = 0; n < 2; n++) {
      const id = pick(ids)
      const level = store.getRow(id)
      if (!level || (!level.bidSize && !level.askSize)) continue
      const size = lotOf(symbol) * (2 + Math.floor(Math.random() * 60))
      patch.push({ id, fields: level.bidSize ? { bidSize: size } : { askSize: size } })
    }
    const mine = mineAt(symbol, f.convention.tick)
    for (const id of ids) {
      const level = store.getRow(id)!
      const at = mine.get(level.tick)
      const myBid = at?.bid || null
      const myAsk = at?.ask || null
      if ((level.myBid ?? null) !== myBid || (level.myAsk ?? null) !== myAsk) patch.push({ id, fields: { myBid, myAsk } })
    }
    if (patch.length) store.applyDeltas({ patch })
  }
  const bookOf = (symbol: string) => {
    let store = books.get(symbol)
    if (!store) {
      store = createRowStore<DepthLevel>({ getRowId: (l) => levelId(l.tick) })
      books.set(symbol, store)
      watch(symbol)
      rebuildBook(symbol)
    }
    return store
  }
  const stage = (symbol: string, s: LadderStage) => {
    staged.applyDeltas({ upsert: [{ id: "order", seq: ++stageSeq, symbol, price: s.price, side: s.side }] })
    api()?.focusPanel("order-1")
  }
  const book: [string, number, number | null][] = [
    ["ZT", 250, 102.234375],
    ["ZF", -180, 106.484375],
    ["ZN", 120, 110.421875],
    ["ZB", 0, null],
    ["ES", -40, 5008.25],
    ["CL", 12, 77.8],
  ]
  positions.applyDeltas({
    upsert: book.map(([id, position, average]) => {
      const f = FUTURES[id]!
      return { id, book: "Futures", instrument: id, position, quantityUnit: "contracts" as const, average, mark: f.px, dayPnl: 0, totalPnl: average === null ? 0 : Math.round((f.px - average) * position * f.pointValue), risk: f.dv01 === null ? null : position * f.dv01 }
    }),
  })
  const sheet = createRowStore<Sheet>({ getRowId: (r) => r.id })
  sheet.applyDeltas({
    upsert: NOTES.map((note, i) => ({ id: note.id, name: note.name, enabled: i !== 3, allowedActions: ["toggle", "edit"], skew: 0, width: 1 + i * 0.5, maxSize: [10, 10, 5, 2][i]!, updatedAt: now - (i + 1) * 3_600_000, updatedBy: "desk" })),
    meta: { producedAt: now },
  })
  // The desk's two-way in the notes, at the quoter's skew and width around the market's mid. The 30-year is paused.
  const twoWay = (row: QuoteRow): Pick<QuoteRow, "bid" | "ask"> => {
    if (row.marketBid === null || row.marketBid === undefined || row.marketAsk === null || row.marketAsk === undefined) return { bid: null, ask: null }
    const mid = (row.marketBid + row.marketAsk) / 2 + (row.skew ?? 0) * T32.tick
    const half = ((row.width ?? 2) / 2) * T32.tick
    return { bid: roundToTick(mid - half, T32.tick), ask: roundToTick(mid + half, T32.tick) }
  }
  const markets = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
  markets.applyDeltas({
    upsert: NOTES.map((note, i) => {
      const s = sheet.getRow(note.id)!
      const status = i === 3 ? "Paused" : "Quoting"
      const row: QuoteRow = { id: note.id, instrument: note.name, status, marketBid: roundToTick(note.px - T32.tick, T32.tick), marketAsk: note.px, skew: s.skew, width: s.width, bidSize: s.maxSize * 1_000_000, askSize: s.maxSize * 1_000_000, allowedActions: QUOTE_ALLOWED[status], updatedAt: now }
      return { ...row, ...twoWay(row) }
    }),
  })
  const quoteField = (key: string, value: unknown): Partial<QuoteRow> => {
    const n = typeof value === "number" ? value : null
    switch (key) {
      case "bid":
        return { bid: n }
      case "ask":
        return { ask: n }
      case "skew":
        return { skew: n }
      case "width":
        return { width: n }
      case "bidSize":
        return { bidSize: n }
      case "askSize":
        return { askSize: n }
      default:
        return {}
    }
  }
  // The server answers a quote command 300 ms later: a typed value is written back (the quoter's sheet keeps the same
  // skew and width, and a Quoting two-way is re-struck), a width over 8 is refused, and an action moves the status word.
  const setQuote = (change: EditChange<QuoteRow>) =>
    new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
        const row = markets.getRow(change.rowId)
        if (!row) return resolve()
        const typed = quoteField(change.key, change.value)
        const at = Date.now()
        markets.applyDeltas({ patch: [{ id: row.id, fields: { ...typed, ...(row.status === "Quoting" && (change.key === "skew" || change.key === "width") ? twoWay({ ...row, ...typed }) : {}), updatedAt: at } }] })
        if (typeof change.value === "number" && (change.key === "skew" || change.key === "width")) sheet.applyDeltas({ patch: [{ id: row.id, fields: { ...(change.key === "skew" ? { skew: change.value } : { width: change.value }), updatedAt: at, updatedBy: "you" } }], meta: { producedAt: at } })
        resolve()
      }, 300),
    )
  const quoteAction = (id: string, action: string) => {
    setTimeout(() => {
      const row = markets.getRow(id)
      if (!row) return
      const status = action === "pause" ? "Paused" : action === "resume" ? "Quoting" : action === "pull" ? "Pulled" : row.status
      const levels = status === "Quoting" ? twoWay({ ...row, status }) : status === "Pulled" ? { bid: null, ask: null } : {}
      markets.applyDeltas({ patch: [{ id, fields: { status, allowedActions: QUOTE_ALLOWED[status], ...levels, updatedAt: Date.now() } }] })
    }, 300)
  }
  const pullQuotes = (rows: readonly QuoteRow[]) => {
    for (const row of rows) quoteAction(row.id, "pull")
  }
  const feeds = createRowStore<FeedDescriptor>({ getRowId: (f) => f.id })
  feeds.applyDeltas({
    upsert: [
      { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: now, dropped: 0 },
      { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt: now, seq: 0, gap: null },
      { id: "oms", label: "Orders", state: "connected", lane: "ordered", lastMessageAt: now, seq: 0, gap: null },
    ],
  })
  const alerts = createAlertStore()
  alerts.push({ severity: "info", tone: "up", title: "Market data connected", message: `${WATCHED.length} instruments` })
  const actions = createActionRegistry()
  let dock: WorkspaceApi | null = null
  const attach = (api: WorkspaceApi) => {
    dock = api
  }
  const api = () => dock

  let orderSeq = 0
  let eventSeq = 0
  let printSeq = 0
  let inquirySeq = 0
  const record = (event: Omit<AuditEvent, "id" | "at">) => events.applyDeltas({ upsert: [{ ...event, id: `e${++eventSeq}`, at: Date.now() }] })
  const heard = (feed: string) => {
    const row = feeds.getRow(feed)
    if (row) feeds.applyDeltas({ patch: [{ id: feed, fields: { lastMessageAt: Date.now(), seq: row.seq === undefined ? undefined : row.seq + 1 } }] })
  }
  const print = (p: Omit<Print, "id" | "at">) => {
    const ids = prints.getIds()
    prints.applyDeltas({ upsert: [{ ...p, id: `p${++printSeq}`, at: Date.now() }], remove: ids.slice(0, Math.max(0, ids.length - 199)) })
  }
  const watch = (symbol: string) => {
    const f = FUTURES[symbol]
    if (f && !quotes.getRow(symbol)) quotes.applyDeltas({ upsert: [quoteFor(f)] })
  }

  // A fill: the order, the trail, the tape, the position, and, when it completes, a notice.
  const fill = (order: BlotterRow, quantity: number) => {
    const filled = (order.filled ?? 0) + quantity
    const done = filled >= order.quantity
    orders.applyDeltas({ patch: [{ id: order.id, fields: { filled, status: done ? "Filled" : "PartiallyFilled", allowedActions: done ? [] : ["cancel", "amend"] } }] })
    record({ event: done ? "Filled" : "PartiallyFilled", by: "venue", message: order.id, changes: [{ field: "filled", from: order.filled ?? 0, to: filled }, ...(done ? [{ field: "status", from: order.status, to: "Filled" }] : [])] })
    heard("oms")
    const f = futureOf(order.symbol)
    const px = order.price ?? quotes.getRow(order.symbol)?.last ?? f.px
    print({ symbol: order.symbol, side: order.side, size: quantity, px, mine: true })
    const signed = order.side === "buy" ? quantity : -quantity
    const held = positions.getRow(order.symbol)
    if (!held) {
      positions.applyDeltas({ upsert: [{ id: order.symbol, book: "Futures", instrument: order.symbol, position: signed, quantityUnit: "contracts", average: px, mark: px, dayPnl: 0, totalPnl: 0, risk: f.dv01 === null ? null : signed * f.dv01 }] })
    } else {
      const next = held.position + signed
      // The server's arithmetic: adding to a position averages in; reducing keeps the average; crossing flat starts over.
      const average = next === 0 ? null : held.position === 0 || Math.sign(next) !== Math.sign(held.position) ? px : Math.sign(signed) === Math.sign(held.position) ? ((held.average ?? px) * Math.abs(held.position) + px * quantity) / Math.abs(next) : held.average
      positions.applyDeltas({ patch: [{ id: order.symbol, fields: { position: next, average, risk: f.dv01 === null ? null : next * f.dv01 } }] })
    }
    if (done) alerts.push({ severity: "fill", tone: "primary", title: `${order.side === "buy" ? "Bought" : "Sold"} ${formatQuantity(order.quantity)} ${order.symbol} at ${price(px, order.symbol)}`, message: order.id })
  }

  const send: Desk["send"] = (draft, instrument) => {
    const id = `ORD-${pad(++orderSeq)}`
    const quantity = draft.quantity ?? 0
    const order: BlotterRow = { id, time: Date.now(), symbol: instrument.symbol, side: draft.side, quantity, filled: 0, price: draft.price, status: "Sent", account: draft.account ?? undefined, allowedActions: [] }
    orders.applyDeltas({ upsert: [order] })
    record({
      event: "New",
      by: "trader",
      message: `${draft.side === "buy" ? "Buy" : "Sell"} ${formatQuantity(quantity)} ${instrument.symbol} ${draft.type}`,
      changes: [
        { field: "side", to: draft.side },
        { field: "quantity", to: quantity },
        { field: "price", to: draft.price === null ? null : price(draft.price, instrument.symbol) },
        { field: "status", to: "Sent" },
      ],
    })
    setTimeout(() => {
      const last = quotes.getRow(instrument.symbol)?.last ?? null
      const away = draft.price !== null && last !== null && Math.abs(draft.price - last) > instrument.convention.tick * 16
      if (away) {
        orders.applyDeltas({ patch: [{ id, fields: { status: "Rejected", allowedActions: [] } }] })
        record({ event: "Rejected", by: "venue", message: "Price outside the band", changes: [{ field: "status", from: "Sent", to: "Rejected" }] })
        alerts.push({ severity: "critical", tone: "destructive", title: `${id} rejected`, message: "Price outside the band", allowedActions: ["ack"] })
      } else {
        orders.applyDeltas({ patch: [{ id, fields: { status: "Working", allowedActions: ["cancel", "amend"] } }] })
        record({ event: "Acknowledged", by: "venue", message: `${id} working`, changes: [{ field: "status", from: "Sent", to: "Working" }] })
      }
      heard("oms")
    }, 600)
    return id
  }

  const cancel: Desk["cancel"] = (ids) => {
    const rows = ids.map((id) => orders.getRow(id)).filter((r): r is BlotterRow => r !== undefined && (r.allowedActions?.includes("cancel") ?? false))
    if (!rows.length) return
    orders.applyDeltas({ patch: rows.map((r) => ({ id: r.id, fields: { status: "Cancel sent", allowedActions: [] } })) })
    setTimeout(() => {
      orders.applyDeltas({ patch: rows.map((r) => ({ id: r.id, fields: { status: "Cancelled" } })) })
      for (const r of rows) record({ event: "Cancelled", by: "venue", message: r.id, changes: [{ field: "status", from: r.status, to: "Cancelled" }] })
      heard("oms")
    }, 500)
  }

  // The venue: a quote goes live after a moment, and a few seconds on the venue says how it ended.
  const quote: Desk["quote"] = (id, levels) => {
    const row = inquiries.getRow(id)
    if (!row || ENDED.has(row.status)) return
    inquiries.applyDeltas({ patch: [{ id, fields: { status: "Sending", auto: false } }] })
    setTimeout(() => {
      if (!inquiries.getRow(id)) return
      inquiries.applyDeltas({ patch: [{ id, fields: { status: "Quoted", quoted: levels, message: "Live with the venue" } }] })
      heard("rfq")
      setTimeout(
        () => {
          const current = inquiries.getRow(id)
          if (!current || ENDED.has(current.status)) return
          const level = (current.side === "buy" ? levels.ask : levels.bid) ?? null
          const won = Math.random() < 0.5
          inquiries.applyDeltas({ patch: [{ id, fields: { status: won ? "Done" : "Done away", message: won ? `Done at ${ust.price(level)}` : `Cover ${ust.price(level)}` } }] })
          heard("rfq")
          if (won) alerts.push({ severity: "fill", tone: "primary", title: `${current.client ?? "Client"} ${current.side === "buy" ? "bought" : "sold"} ${formatNotional(current.quantity, { unit: "mm" })} ${current.instrument} at ${ust.price(level)}`, message: current.id })
        },
        3000 + Math.random() * 4000,
      )
    }, 700)
  }
  const pass: Desk["pass"] = (id) => {
    if (!inquiries.getRow(id)) return
    inquiries.applyDeltas({ patch: [{ id, fields: { status: "Passed", message: "Passed" } }] })
    heard("rfq")
  }
  const reconnect = () => {
    feeds.applyDeltas({ patch: [{ id: "md", fields: { state: "connecting" } }] })
    setTimeout(() => {
      feeds.applyDeltas({ patch: [{ id: "md", fields: { state: "connected", lastMessageAt: Date.now() } }] })
      alerts.push({ severity: "info", tone: "up", title: "Market data reconnected" })
    }, 800)
  }

  // An inquiry arrives; the sheet says whether the auto-quoter answers it before anyone sees it.
  const arrive = () => {
    const at = Date.now()
    const note = pick(NOTES)
    const [client, tier] = pick(CLIENTS)
    const params = sheet.getRow(note.id)
    const quantity = (1 + Math.floor(Math.random() * (Math.random() < 0.3 ? 40 : 8))) * 1_000_000
    const mid = roundToTick(note.px + (Math.random() - 0.5) / 4, 1 / 64)
    const auto = (params?.enabled ?? false) && quantity <= (params?.maxSize ?? 0) * 1_000_000
    const half = (params?.width ?? 1) / 128
    const skew = (params?.skew ?? 0) / 64
    const side: Inquiry["side"] = Math.random() < 0.1 ? "two-way" : Math.random() < 0.5 ? "buy" : "sell"
    inquiries.applyDeltas({
      upsert: [
        {
          id: `Q-${pad(++inquirySeq)}`,
          note: note.id,
          receivedAt: at,
          expiresAt: at + 20_000 + Math.floor(Math.random() * 40_000),
          client,
          tier,
          instrument: note.name,
          side,
          quantity,
          bid: roundToTick(mid - 1 / 64, 1 / 64),
          ask: roundToTick(mid + 1 / 64, 1 / 64),
          status: auto ? "Quoted" : "Open",
          auto,
          quoted: auto ? { bid: roundToTick(mid - half + skew, 1 / 64), ask: roundToTick(mid + half + skew, 1 / 64) } : undefined,
        },
      ],
    })
    heard("rfq")
  }

  // The bars, one store per symbol, made when a chart first asks: three hours of one-minute history walked back
  // from the quote's last on the tick grid, then every print the venue makes folded into the open bar.
  const barStores = new Map<string, RowStore<Bar>>()
  const BAR_MS = 60_000
  const barsOf = (symbol: string): RowStore<Bar> => {
    const made = barStores.get(symbol)
    if (made) return made
    const store = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    const f = futureOf(symbol)
    const tick = f.convention.tick
    let px = quotes.getRow(symbol)?.last ?? f.px
    const end = Math.floor(Date.now() / BAR_MS) * BAR_MS
    const bars: Bar[] = []
    for (let i = 0; i < 180; i++) {
      const close = px
      let high = close
      let low = close
      for (let t = 0; t < 6; t++) {
        px = roundToTick(px + (Math.random() < 0.5 ? -1 : 1) * tick * (Math.random() < 0.7 ? 1 : 2), tick)
        high = Math.max(high, px)
        low = Math.min(low, px)
      }
      bars.push({ time: end - i * BAR_MS, open: px, high, low, close, volume: lotOf(symbol) * (20 + Math.round(Math.random() * 200)) })
    }
    store.applyDeltas({ upsert: bars.reverse() })
    barStores.set(symbol, store)
    return store
  }

  const start = () => {
    let beat = 0
    const timer = setInterval(() => {
      beat++
      const at = Date.now()
      // The market: about half the symbols move a tick or two, and every mark and P&L moves with them.
      const moved = quotes.getIds().flatMap((id) => {
        const q = quotes.getRow(id)
        const f = FUTURES[id]
        if (!q || !f || Math.random() > 0.5) return []
        const tick = f.convention.tick
        const last = roundToTick((q.last ?? q.close) + (Math.random() < 0.5 ? -1 : 1) * tick * (1 + Math.floor(Math.random() * 2)), tick)
        return [{ id, fields: { last, bid: roundToTick(last - tick, tick), ask: roundToTick(last + tick, tick), change: last - q.close, changePct: ((last - q.close) / q.close) * 100, volume: (q.volume ?? 0) + Math.round(Math.random() * 400), closes: [...q.closes.slice(-119), last] } }]
      })
      if (moved.length) {
        quotes.applyDeltas({ patch: moved })
        heard("md")
        for (const m of moved) {
          const bars = barStores.get(m.id)
          if (bars) bars.applyDeltas(foldTicks(bars, [{ at, price: m.fields.last, size: lotOf(m.id) * (1 + Math.floor(Math.random() * 8)) }], BAR_MS))
        }
        positions.applyDeltas({
          patch: positions.getIds().flatMap((id) => {
            const p = positions.getRow(id)
            const q = quotes.getRow(id)
            const f = FUTURES[id]
            if (!p || !q || !f || q.last === null || q.last === undefined) return []
            return [{ id, fields: { mark: q.last, dayPnl: Math.round((q.last - q.close) * p.position * f.pointValue), totalPnl: p.average === null || p.average === undefined ? 0 : Math.round((q.last - p.average) * p.position * f.pointValue) } }]
          }),
        })
      }
      // The books: rebuilt around a quote that moved, stirred where it did not.
      const movedIds = new Set(moved.map((m) => m.id))
      for (const symbol of books.keys()) (movedIds.has(symbol) ? rebuildBook : stirBook)(symbol)
      // The notes' market: one note moves a tick every third beat, and a Quoting two-way follows it.
      if (beat % 3 === 0) {
        const row = markets.getRow(pick(markets.getIds()))
        if (row && row.marketBid !== null && row.marketBid !== undefined && row.marketAsk !== null && row.marketAsk !== undefined) {
          const by = (Math.random() < 0.5 ? -1 : 1) * T32.tick
          const struck = { ...row, marketBid: roundToTick(row.marketBid + by, T32.tick), marketAsk: roundToTick(row.marketAsk + by, T32.tick) }
          markets.applyDeltas({ patch: [{ id: row.id, fields: { marketBid: struck.marketBid, marketAsk: struck.marketAsk, ...(row.status === "Quoting" ? twoWay(struck) : {}) } }] })
        }
      }
      // The tape: a print every other beat, at the bid or the ask.
      if (beat % 2 === 0) {
        const id = pick(quotes.getIds())
        const q = id === undefined ? undefined : quotes.getRow(id)
        if (q) {
          const side = Math.random() < 0.5 ? "buy" : "sell"
          print({ symbol: q.symbol, side, size: (1 + Math.floor(Math.random() * 40)) * (q.symbol === "ES" ? 1 : 5), px: (side === "buy" ? q.ask : q.bid) ?? q.last ?? q.close })
        }
      }
      // The venue: an inquiry every couple of seconds or so; the clock ends the ones nobody answered, and the ended leave after a while.
      if (beat % 6 === 0 && Math.random() < 0.7) arrive()
      const expired: string[] = []
      const gone: string[] = []
      for (const id of inquiries.getIds()) {
        const row = inquiries.getRow(id)!
        if (row.expiresAt <= at && !ENDED.has(row.status)) expired.push(id)
        else if (ENDED.has(row.status) && row.expiresAt < at - 12_000) gone.push(id)
      }
      if (expired.length || gone.length) inquiries.applyDeltas({ patch: expired.map((id) => ({ id, fields: { status: "Expired" } })), remove: gone })
      // The server: a working order fills a quarter at a time.
      if (beat % 5 === 0) {
        const working = orders.getIds().filter((id) => orders.getRow(id)?.allowedActions?.includes("cancel"))
        const order = working.length ? orders.getRow(pick(working)) : undefined
        if (order) fill(order, Math.min(order.quantity - (order.filled ?? 0), Math.max(1, Math.ceil(order.quantity / 4))))
      }
      // Every half minute the market data falls behind for a moment. One key, so the notice folds however often it repeats.
      if (beat % 120 === 60) alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: `${(0.8 + Math.random() * 2).toFixed(1)} s behind`, allowedActions: ["reconnect"] })
    }, 250)
    return () => clearInterval(timer)
  }

  // What is already on the desk when it opens: a handful of inquiries, an order that filled, two working, the
  // trail of all three, and the tape so far.
  for (let i = 0; i < 5; i++) arrive()
  const opened = Date.now()
  const history: BlotterRow[] = [
    { id: `ORD-${pad(++orderSeq)}`, time: opened - 95_000, symbol: "ZN", side: "buy", quantity: 10, filled: 10, price: 110.484375, status: "Filled", account: "A-1", allowedActions: [] },
    { id: `ORD-${pad(++orderSeq)}`, time: opened - 40_000, symbol: "ZF", side: "sell", quantity: 20, filled: 5, price: 106.53125, status: "PartiallyFilled", account: "A-1", allowedActions: ["cancel", "amend"] },
    { id: `ORD-${pad(++orderSeq)}`, time: opened - 8_000, symbol: "ES", side: "buy", quantity: 4, filled: 0, price: 5012, status: "Working", account: "A-2", allowedActions: ["cancel", "amend"] },
  ]
  orders.applyDeltas({ upsert: history })
  const trail: Omit<AuditEvent, "id">[] = [
    { at: opened - 95_000, event: "New", by: "trader", message: "Buy 10 ZN limit", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 10 }, { field: "price", to: "110-15+" }, { field: "status", to: "Sent" }] },
    { at: opened - 94_400, event: "Acknowledged", by: "venue", message: `${history[0]!.id} working`, changes: [{ field: "status", from: "Sent", to: "Working" }] },
    { at: opened - 70_000, event: "PartiallyFilled", by: "venue", message: history[0]!.id, changes: [{ field: "filled", from: 0, to: 6 }] },
    { at: opened - 52_000, event: "Filled", by: "venue", message: history[0]!.id, changes: [{ field: "filled", from: 6, to: 10 }, { field: "status", from: "Working", to: "Filled" }] },
    { at: opened - 40_000, event: "New", by: "trader", message: "Sell 20 ZF limit", changes: [{ field: "side", to: "sell" }, { field: "quantity", to: 20 }, { field: "price", to: "106-17" }, { field: "status", to: "Sent" }] },
    { at: opened - 39_400, event: "Acknowledged", by: "venue", message: `${history[1]!.id} working`, changes: [{ field: "status", from: "Sent", to: "Working" }] },
    { at: opened - 21_000, event: "PartiallyFilled", by: "venue", message: history[1]!.id, changes: [{ field: "filled", from: 0, to: 5 }] },
    { at: opened - 8_000, event: "New", by: "trader", message: "Buy 4 ES limit", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 4 }, { field: "price", to: "5,012.00" }, { field: "status", to: "Sent" }] },
    { at: opened - 7_400, event: "Acknowledged", by: "venue", message: `${history[2]!.id} working`, changes: [{ field: "status", from: "Sent", to: "Working" }] },
  ]
  events.applyDeltas({ upsert: trail.map((event) => ({ ...event, id: `e${++eventSeq}` })) })
  prints.applyDeltas({
    upsert: Array.from({ length: 14 }, (_, i): Print => {
      const q = quotes.getRow(WATCHED[(i * 5) % WATCHED.length]!)!
      const side = i % 3 === 0 ? "sell" : "buy"
      return { id: `p${++printSeq}`, at: opened - (14 - i) * 3_800, symbol: q.symbol, side, size: (1 + ((i * 7) % 30)) * (q.symbol === "ES" ? 1 : 5), px: (side === "buy" ? q.ask : q.bid) ?? q.close }
    }),
  })

  return { quotes, inquiries, orders, events, prints, positions, sheet, markets, feeds, staged, alerts, actions, attach, api, watch, book: bookOf, bars: barsOf, stage, send, cancel, quote, pass, setQuote, quoteAction, pullQuotes, reconnect, start }
}

// What the panels read the desk through.
const DeskContext = createContext<Desk | null>(null)
function useDesk(): Desk {
  const desk = useContext(DeskContext)
  if (!desk) throw new Error("The desk is not mounted.")
  return desk
}

type DeskDialog = "find" | "layouts" | "keys" | "rules"
const UiContext = createContext<(dialog: DeskDialog | null) => void>(() => {})

// The stack's view, its active inquiry, and its rules are shared: the stack shows them, the quote ticket takes
// the active one, the Rules dialog edits them.
interface Stack {
  view: RowView<Inquiry>
  active: ActiveInquiry<Inquiry>
  rules: GridRules
  setRules: (rules: GridRules) => void
  columnState: ColumnState
  setColumnState: (state: ColumnState) => void
  threshold: number | null
  setThreshold: (threshold: number | null) => void
}
const StackContext = createContext<Stack | null>(null)
function useStack(): Stack {
  const stack = useContext(StackContext)
  if (!stack) throw new Error("The stack is not mounted.")
  return stack
}

function StackProvider({ children }: { children: ReactNode }) {
  const desk = useDesk()
  const [rules, setRules] = useState<GridRules>(STACK_RULES)
  const [columnState, setColumnState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
  const [threshold, setThreshold] = useState<number | null>(2_000_000)
  // Largest first, then the one about to end, the threshold and the rules folded in. The grid holds it still under a hand.
  const view = useRfqStackView(desk.inquiries, { comparator: STACK_ORDER, threshold, rules, columns: STACK_COLUMNS })
  // The active inquiry stays until the trader acts or the venue ends it; arrivals never take it away.
  const active = useActiveInquiry(view, { isEnded: (row) => ENDED.has(row.status) })
  const value = useMemo<Stack>(() => ({ view, active, rules, setRules, columnState, setColumnState, threshold, setThreshold }), [view, active, rules, columnState, threshold])
  return <StackContext.Provider value={value}>{children}</StackContext.Provider>
}

function Keys({ keys }: { keys: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {formatKeys(keys).map((caps, i) => (
        <KbdGroup key={i}>
          {caps.map((cap) => (
            <Kbd key={cap}>{cap}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  )
}

// The panels, one component per kind. Each reads the desk and draws its own header.

function WatchlistPanel() {
  const desk = useDesk()
  const panel = useWorkspacePanel()
  const link = useLinkGroup({ source: panel.id, defaultGroup: (panel.state.group as LinkGroup | undefined) ?? 1, onGroupChange: (group) => panel.setState({ group }) })
  // Memoized: the grid keeps its rows only while the columns keep their identity.
  const columns = useMemo(
    () => [
      ...watchlistColumns<Quote>({ price: (value, row) => price(value, row.symbol) }),
      { key: "trend", header: "Trend", width: 96, flash: false as const, accessor: (r: Quote) => r.closes, cell: ({ row }: { row: Quote }) => <Sparkline values={row.closes} baseline={row.close} label={`${row.symbol} today`} width={80} height={16} /> },
    ],
    [],
  )
  return (
    <>
      <PanelHeader>
        <PanelTitle>Watchlist</PanelTitle>
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <PanelActions>
          <span className="text-muted-foreground">Enter loads a row</span>
        </PanelActions>
      </PanelHeader>
      <PanelContent>
        <Watchlist store={desk.quotes} columns={columns} className={GRID} validate={(symbol) => symbol in FUTURES} onAdd={desk.watch} onRemove={(ids) => desk.quotes.applyDeltas({ remove: ids })} onRowActivate={(row) => link.setSymbol(row.symbol)} />
      </PanelContent>
    </>
  )
}

function PositionsPanel() {
  const desk = useDesk()
  return (
    <>
      <PanelHeader>
        <PanelTitle>Positions</PanelTitle>
        <span className="text-muted-foreground">Futures book</span>
      </PanelHeader>
      <PanelContent>
        <Positions store={desk.positions} className={GRID} label="Futures positions" riskHeader="DV01" price={(value, row) => price(value, row.instrument)} pnl={money} risk={money} />
      </PanelContent>
    </>
  )
}

function StackPanel() {
  const desk = useDesk()
  const stack = useStack()
  const open = useContext(UiContext)
  const showing = useRowIds(stack.view).length
  return (
    <>
      <PanelHeader>
        <PanelTitle>Inquiries</PanelTitle>
        <span className="text-muted-foreground">{showing} showing</span>
        <PanelActions>
          <Button size="sm" variant="ghost" className={ACTION} onClick={() => open("rules")}>
            Rules
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelContent>
        <RfqStack
          store={desk.inquiries}
          view={stack.view}
          columns={STACK_COLUMNS}
          className={GRID}
          activeId={stack.active.activeId}
          parkedIds={stack.active.parked}
          onActivate={stack.active.setActive}
          threshold={stack.threshold}
          onThresholdChange={stack.setThreshold}
          rules={stack.rules}
          columnState={stack.columnState}
          onColumnStateChange={stack.setColumnState}
          // Park from the menu: the inquiry stays in its place, muted, and is never the next one until it is let back.
          renderContextMenu={(_, ids) =>
            ids.every((id) => stack.active.parked.has(id)) ? <ContextMenuItem onClick={() => ids.forEach(stack.active.unpark)}>Unpark</ContextMenuItem> : <ContextMenuItem onClick={() => ids.forEach(stack.active.park)}>Park</ContextMenuItem>
          }
        />
      </PanelContent>
    </>
  )
}

/** The stack's row as the ticket's inquiry. What may be done is the venue's word, read off the status. */
function toInquiry(row: Inquiry): RfqInquiry {
  const mid = row.bid !== null && row.bid !== undefined && row.ask !== null && row.ask !== undefined ? (row.bid + row.ask) / 2 : null
  const open = !ENDED.has(row.status) && row.status !== "Sending"
  return {
    id: row.id,
    instrument: { symbol: row.note, description: row.instrument, convention: T32 },
    side: row.side,
    quantity: row.quantity,
    client: { name: row.client ?? "Client", tier: row.tier },
    tags: row.auto ? ["auto"] : undefined,
    settlement: "T+1",
    receivedAt: row.receivedAt,
    expiresAt: row.expiresAt,
    market: { label: "Composite", bid: row.bid, ask: row.ask, mid },
    suggested: mid === null ? undefined : { bid: roundToTick(mid - 1 / 64, 1 / 64), ask: roundToTick(mid + 1 / 64, 1 / 64) },
    quoted: row.quoted,
    status: row.status,
    message: row.message,
    allowedActions: open ? ["quote", "quote-auto", "pass"] : [],
  }
}

function QuotePanel() {
  const desk = useDesk()
  const stack = useStack()
  const row = stack.active.row
  const inquiry = row ? toInquiry(row) : null
  const actions = useMemo<RfqAction[]>(
    () => [
      { id: "quote", label: "Quote", primary: true, run: (draft) => desk.quote(draft.inquiryId, { bid: draft.bid, ask: draft.ask }) },
      { id: "quote-auto", label: "Quote auto", needsQuote: false, run: (_, q) => desk.quote(q.id, { bid: q.suggested?.bid ?? null, ask: q.suggested?.ask ?? null }) },
      { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: (_, q) => desk.pass(q.id) },
    ],
    [desk],
  )
  return (
    <>
      <PanelHeader>
        <PanelTitle>Quote</PanelTitle>
        {row && (
          <span className="truncate text-muted-foreground">
            {row.id} · {row.client}
          </span>
        )}
      </PanelHeader>
      <PanelContent className="p-2">
        {inquiry && row ? (
          <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} acknowledged={row.quoted ? row.id : undefined} limits={RFQ_LIMITS} quickSizes={[1_000_000, 5_000_000]} className="w-full" />
        ) : (
          <p className="p-2 text-muted-foreground">No open inquiry. The next one lands here; Enter on a row in the stack picks one.</p>
        )}
      </PanelContent>
    </>
  )
}

function OrderPanel() {
  const desk = useDesk()
  const panel = useWorkspacePanel()
  const link = useLinkGroup({ source: panel.id, defaultGroup: (panel.state.group as LinkGroup | undefined) ?? 1, defaultSymbol: DEFAULT_SYMBOL, onGroupChange: (group) => panel.setState({ group }) })
  const future = futureOf(link.symbol)
  const market = useRow(desk.quotes, future.symbol)
  const stagedRow = useRow(desk.staged, "order")
  const stagedHere = stagedRow?.symbol === future.symbol ? stagedRow : undefined
  const [lastId, setLastId] = useState<string | null>(null)
  const last = useRow(desk.orders, lastId ?? "")
  const instrument = useMemo<TicketInstrument>(() => ({ symbol: future.symbol, convention: future.convention, quantityStep: 1 }), [future])
  const actions = useMemo<TicketAction[]>(
    () => [
      { id: "send", label: (draft) => (draft.side === "buy" ? "Buy" : "Sell"), primary: true, run: (draft, inst) => setLastId(desk.send(draft, inst)) },
      {
        id: "cancel",
        label: "Cancel",
        destructive: true,
        run: () => {
          if (lastId) desk.cancel([lastId])
        },
      },
    ],
    [desk, lastId],
  )
  const busy = last?.status === "Sent" || last?.status === "Cancel sent"
  const allowed = busy ? [] : last?.allowedActions?.includes("cancel") ? ["send", "cancel"] : ["send"]
  const commit = (symbol: string | null) => {
    if (symbol) desk.watch(symbol)
    link.setSymbol(symbol)
  }
  return (
    <>
      <PanelHeader>
        <PanelTitle>Order</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={commit} validate={(symbol) => symbol in FUTURES} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
      </PanelHeader>
      <PanelContent className="p-2">
        <Ticket
          key={stagedHere ? `${future.symbol}:${stagedHere.seq}` : future.symbol}
          defaultDraft={stagedHere ? { side: stagedHere.side, price: stagedHere.price } : undefined}
          instrument={instrument}
          reference={{ bid: market?.bid, ask: market?.ask, last: market?.last }}
          quickSizes={[1, 5, 10, 25]}
          accounts={ACCOUNTS}
          actions={actions}
          allowedActions={allowed}
          limits={ORDER_LIMITS}
          status={last?.status}
          message={last?.status === "Rejected" ? "Price outside the band" : last?.status === "Working" ? `${last.id} working` : undefined}
          acknowledged={last?.status === "Working" ? last.id : undefined}
          className="w-full"
        />
      </PanelContent>
    </>
  )
}

function BlotterPanel() {
  const desk = useDesk()
  const columns = useMemo(() => blotterColumns<BlotterRow>({ price: (value, row) => price(value, row.symbol) }), [])
  const [columnState, setColumnState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
  const [chooser, setChooser] = useState(false)
  // An action runs only on rows whose allowedActions lists it, checked again as the click lands.
  const actions = useMemo<BlotterAction[]>(
    () => [
      { id: "cancel", label: "Cancel", destructive: true, run: (_, ids) => desk.cancel(ids) },
      { id: "amend", label: "Amend", run: () => desk.api()?.focusPanel("order-1") },
    ],
    [desk],
  )
  const meta = useStoreMeta(desk.orders)
  const working = useMemo(() => {
    void meta.version
    return desk.orders.getIds().filter((id) => desk.orders.getRow(id)?.allowedActions?.includes("cancel")).length
  }, [desk, meta.version])
  return (
    <>
      <PanelHeader>
        <PanelTitle>Blotter</PanelTitle>
        <span className="text-muted-foreground">{working} working</span>
        <PanelActions>
          <Button size="sm" variant="ghost" className={ACTION} onClick={() => setChooser(true)}>
            Columns
          </Button>
        </PanelActions>
      </PanelHeader>
      <ColumnChooser open={chooser} onOpenChange={setChooser} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} />
      <PanelContent>
        <Blotter store={desk.orders} columns={columns} className={GRID} sort={BY_TIME} actions={actions} deleteAction="cancel" columnState={columnState} onColumnStateChange={setColumnState} onNew={() => desk.api()?.focusPanel("order-1")} />
      </PanelContent>
    </>
  )
}

function AuditPanel() {
  const desk = useDesk()
  return (
    <>
      <PanelHeader>
        <PanelTitle>Audit trail</PanelTitle>
        <span className="truncate text-muted-foreground">Click an event for its changes, two for the difference</span>
      </PanelHeader>
      <PanelContent>
        <AuditTrail
          store={desk.events}
          className={GRID}
          onExport={(csv) => {
            void navigator.clipboard?.writeText(csv)
            desk.alerts.push({ severity: "info", title: "Audit trail copied", message: `${Math.max(0, csv.split("\n").length - 1)} events as CSV` })
          }}
        />
      </PanelContent>
    </>
  )
}

function ParametersPanel() {
  const desk = useDesk()
  const [openedAt] = useState(() => Date.now())
  // The edit is a command: the server answers 400 ms later by writing the row back, or by refusing.
  const onEdit = (change: EditChange<Sheet>) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
        const at = Date.now()
        desk.sheet.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: at, updatedBy: "you" } as Partial<Sheet> }], meta: { producedAt: at } })
        resolve()
      }, 400)
    })
  return (
    <>
      <PanelHeader>
        <PanelTitle>Quoter</PanelTitle>
        <span className="truncate text-muted-foreground">What the auto-quoter answers on its own, and how wide</span>
      </PanelHeader>
      <PanelContent>
        <ParameterGrid store={desk.sheet} parameters={PARAMETERS} onEdit={onEdit} changedSince={openedAt} className={GRID} />
      </PanelContent>
    </>
  )
}

function ChartPanel() {
  const desk = useDesk()
  const panel = useWorkspacePanel()
  const link = useLinkGroup({ source: panel.id, defaultGroup: (panel.state.group as LinkGroup | undefined) ?? 1, defaultSymbol: DEFAULT_SYMBOL, onGroupChange: (group) => panel.setState({ group }) })
  const future = futureOf(link.symbol)
  const market = useRow(desk.quotes, future.symbol)
  const bars = useMemo(() => desk.bars(future.symbol), [desk, future.symbol])
  const commit = (symbol: string | null) => {
    if (symbol) desk.watch(symbol)
    link.setSymbol(symbol)
  }
  return (
    <>
      <PanelHeader>
        <PanelTitle>Chart</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={commit} validate={(symbol) => symbol in FUTURES} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        {market?.last !== null && market?.last !== undefined && (
          <FlashCell value={market.last} variant="fill" className="px-1">
            {price(market.last, future.symbol)}
          </FlashCell>
        )}
        <PanelActions>
          <Button size="sm" variant="ghost" className={ACTION} onClick={() => panel.float()} disabled={panel.location !== "grid"}>
            float
          </Button>
          <Button size="sm" variant="ghost" className={ACTION} onClick={() => void panel.popout()} disabled={panel.location === "popout"}>
            pop out
          </Button>
          <Button size="sm" variant="ghost" className={ACTION} onClick={panel.toggleMaximize}>
            max
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelContent className="p-1">
        <PriceChart store={bars} convention={future.convention} label={`${future.symbol}, today`} zone="America/Chicago" baseline={market?.close ?? null} className="h-full" />
      </PanelContent>
    </>
  )
}

// The ladder follows the symbol the way the chart does, over the book the venue keeps for it. A click on a size
// stages that price and side into the order ticket, which starts again from them; the ladder itself sends nothing.
function LadderPanel() {
  const desk = useDesk()
  const panel = useWorkspacePanel()
  const link = useLinkGroup({ source: panel.id, defaultGroup: (panel.state.group as LinkGroup | undefined) ?? 1, defaultSymbol: DEFAULT_SYMBOL, onGroupChange: (group) => panel.setState({ group }) })
  const future = futureOf(link.symbol)
  const market = useRow(desk.quotes, future.symbol)
  const book = useMemo(() => desk.book(future.symbol), [desk, future.symbol])
  const commit = (symbol: string | null) => {
    if (symbol) desk.watch(symbol)
    link.setSymbol(symbol)
  }
  return (
    <>
      <PanelHeader>
        <PanelTitle>Ladder</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={commit} validate={(symbol) => symbol in FUTURES} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <span className="truncate text-muted-foreground">Click a size to stage it</span>
      </PanelHeader>
      <PanelContent>
        <DepthLadder store={book} convention={future.convention} mid={market?.last ?? market?.close ?? null} label={`${future.symbol} ladder`} depth={40} onStage={(stage) => desk.stage(future.symbol, stage)} className={GRID} />
      </PanelContent>
    </>
  )
}

function TapePanel() {
  const desk = useDesk()
  return (
    <>
      <PanelHeader>
        <PanelTitle>Tape</PanelTitle>
        <span className="truncate text-muted-foreground">Scroll up and the tail waits for you</span>
      </PanelHeader>
      <PanelContent>
        <DataGrid store={desk.prints} columns={TAPE_COLUMNS} preset="tape" label="Tape" announceRowCount="off" className={GRID} />
      </PanelContent>
    </>
  )
}

function FramesPanel() {
  const desk = useDesk()
  const lanes = useMemo(
    () => [
      { label: "Quotes", store: desk.quotes },
      { label: "RFQ", store: desk.inquiries },
      { label: "Orders", store: desk.orders },
    ],
    [desk],
  )
  return (
    <>
      <PanelHeader>
        <PanelTitle>Frames</PanelTitle>
        <span className="truncate text-muted-foreground">What the desk costs the browser, and each feed's lane</span>
      </PanelHeader>
      <PanelContent className="p-2">
        <PerfMonitor lanes={lanes} />
      </PanelContent>
    </>
  )
}

// The spreads between the Treasury contracts, each cell the row less the column in the row's ticks, and the desk's
// structures under them, over the quotes the watchlist reads: a contract that moves flashes the cells it is part of.
const CURVE: SpreadInstrument[] = ["ZT", "ZF", "ZN", "ZB"].map((symbol) => ({ id: symbol, label: symbol, convention: FUTURES[symbol]!.convention }))
const STRUCTURES: SpreadStructure[] = [
  { id: "ZT/ZN", label: "2s10s", legs: ["ZT", "ZN"] },
  { id: "ZF/ZB", label: "5s30s", legs: ["ZF", "ZB"] },
  { id: "ZT/ZF/ZN", label: "2s5s10s", legs: ["ZT", "ZF", "ZN"] },
]
const lastOf = (quote: Quote) => quote.last ?? quote.close
function SpreadsPanel() {
  const desk = useDesk()
  return (
    <>
      <PanelHeader>
        <PanelTitle>Spreads</PanelTitle>
        <span className="truncate text-muted-foreground">Row less column, in the row's ticks</span>
      </PanelHeader>
      <PanelContent className="flex flex-col gap-2 overflow-auto p-2">
        <SpreadMatrix store={desk.quotes} instruments={CURVE} value={lastOf} label="Treasury futures spreads" className="w-fit" />
        <SpreadMatrix store={desk.quotes} instruments={CURVE} structures={STRUCTURES} value={lastOf} label="Treasury futures structures" className="w-fit" />
      </PanelContent>
    </>
  )
}

// The desk's two-way in the notes over the pretend server: a typed level, size, skew, or width is a command it answers
// 300 ms later, the buttons are the actions it allows on the row, and the quoter's sheet keeps the same skew and width.
const QUOTE_LIMITS: Limits = { maxDistance: { ticks: 6, level: "confirm" }, maxQuantity: { confirm: 25_000_000, block: 100_000_000 } }
function QuotesPanel() {
  const desk = useDesk()
  const actions = useMemo<QuoteAction[]>(
    () => [
      { id: "pause", label: "Pause", run: (row) => desk.quoteAction(row.id, "pause") },
      { id: "resume", label: "Resume", run: (row) => desk.quoteAction(row.id, "resume") },
      { id: "pull", label: "Pull", destructive: true, run: (row) => desk.quoteAction(row.id, "pull") },
    ],
    [desk],
  )
  return (
    <>
      <PanelHeader>
        <PanelTitle>Quotes</PanelTitle>
        <span className="truncate text-muted-foreground">The desk's two-way in the notes; type a level to move it</span>
      </PanelHeader>
      <PanelContent>
        <TwoWayPanel store={desk.markets} convention={T32} actions={actions} limits={QUOTE_LIMITS} onEdit={desk.setQuote} onPullAll={desk.pullQuotes} />
      </PanelContent>
    </>
  )
}

const PANELS = { watchlist: WatchlistPanel, positions: PositionsPanel, stack: StackPanel, quote: QuotePanel, order: OrderPanel, blotter: BlotterPanel, audit: AuditPanel, parameters: ParametersPanel, quotes: QuotesPanel, chart: ChartPanel, ladder: LadderPanel, spreads: SpreadsPanel, tape: TapePanel, frames: FramesPanel }

// The layout: three columns, the market on the left, the inquiries and the orders in the middle, the tickets and
// the chart on the right, tabs where two panels share a place. Ids are fixed so the go keys can name them.
function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "watchlist", id: "watchlist-1", title: "Watchlist", state: { group: 1 }, focus: false })
  api.addPanel({ kind: "stack", id: "stack-1", title: "Inquiries", position: { reference: "watchlist-1", direction: "right" }, focus: false })
  api.addPanel({ kind: "order", id: "order-1", title: "Order", state: { group: 1 }, position: { reference: "stack-1", direction: "right" }, focus: false })
  api.addPanel({ kind: "quote", id: "quote-1", title: "Quote", position: { reference: "order-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "positions", id: "positions-1", title: "Positions", position: { reference: "watchlist-1", direction: "below" }, focus: false })
  api.addPanel({ kind: "ladder", id: "ladder-1", title: "Ladder", state: { group: 1 }, position: { reference: "positions-1", direction: "below" }, focus: false })
  api.addPanel({ kind: "spreads", id: "spreads-1", title: "Spreads", position: { reference: "ladder-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "blotter", id: "blotter-1", title: "Blotter", position: { reference: "stack-1", direction: "below" }, focus: false })
  api.addPanel({ kind: "audit", id: "audit-1", title: "Audit trail", position: { reference: "blotter-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "parameters", id: "parameters-1", title: "Quoter", position: { reference: "blotter-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "quotes", id: "quotes-1", title: "Quotes", position: { reference: "blotter-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "tape", id: "tape-1", title: "Tape", position: { reference: "order-1", direction: "below" }, focus: false })
  api.addPanel({ kind: "frames", id: "frames-1", title: "Frames", position: { reference: "tape-1", direction: "within" }, focus: false })
  api.addPanel({ kind: "chart", id: "chart-1", title: "Chart", state: { group: 1 }, position: { reference: "tape-1", direction: "within" }, focus: false })
  // The tab in front of each group, and the columns' widths; dockview's own API, for what the workspace's does not cover.
  for (const id of ["quote-1", "blotter-1", "chart-1", "ladder-1", "stack-1"]) api.dockview.getPanel(id)?.api.setActive()
  api.dockview.getPanel("watchlist-1")?.api.setSize({ width: 320 })
  api.dockview.getPanel("order-1")?.api.setSize({ width: 360, height: 400 })
}

function Toolbar() {
  const desk = useDesk()
  const stack = useStack()
  const open = useContext(UiContext)
  const [palette, setPalette] = useState(false)
  const link = useLinkGroup({ source: "toolbar", defaultGroup: 1 })
  const go = (id: string) => desk.api()?.focusPanel(id)
  useHotkey("go.watchlist", () => go("watchlist-1"))
  useHotkey("go.stack", () => go("stack-1"))
  useHotkey("go.quote", () => go("quote-1"))
  useHotkey("go.order", () => go("order-1"))
  useHotkey("go.blotter", () => go("blotter-1"))
  useHotkey("go.chart", () => go("chart-1"))
  useHotkey("workspace.next", () => desk.api()?.focusNext())
  useHotkey("workspace.previous", () => desk.api()?.focusNext(-1))
  useHotkey("desk.find", () => open("find"))
  useHotkey("desk.layouts", () => open("layouts"))
  useHotkey("desk.keys", () => open("keys"))
  useHotkey("desk.rules", () => open("rules"))
  // The palette's actions, registered once; the ones about the active inquiry read it as they run.
  const latest = useRef(stack)
  useEffect(() => {
    latest.current = stack
  })
  useEffect(() => {
    const focus = (id: string, title: string, bindingId?: string): PaletteAction => ({ id: `go.${id}`, title, group: "Go", bindingId, run: () => desk.api()?.focusPanel(`${id}-1`) })
    const list: PaletteAction[] = [
      focus("watchlist", "Go to the watchlist", "go.watchlist"),
      focus("stack", "Go to the inquiries", "go.stack"),
      focus("quote", "Go to the quote", "go.quote"),
      focus("order", "Go to the order ticket", "go.order"),
      focus("blotter", "Go to the blotter", "go.blotter"),
      focus("chart", "Go to the chart", "go.chart"),
      focus("ladder", "Go to the ladder"),
      focus("spreads", "Go to the spreads"),
      focus("quotes", "Go to the quotes"),
      focus("positions", "Go to the positions"),
      focus("audit", "Go to the audit trail"),
      focus("parameters", "Go to the quoter"),
      focus("tape", "Go to the tape"),
      focus("frames", "Go to the frames"),
      { id: "order.new", title: "New order", group: "Trade", keywords: ["ticket", "buy", "sell"], run: () => desk.api()?.focusPanel("order-1") },
      {
        id: "rfq.auto",
        title: "Quote the inquiry at the auto level",
        group: "Trade",
        keywords: ["rfq"],
        run: () => {
          const row = latest.current.active.row
          if (!row) return
          const q = toInquiry(row)
          desk.quote(q.id, { bid: q.suggested?.bid ?? null, ask: q.suggested?.ask ?? null })
        },
      },
      {
        id: "rfq.pass",
        title: "Pass the inquiry",
        group: "Trade",
        keywords: ["rfq"],
        run: () => {
          const row = latest.current.active.row
          if (row) desk.pass(row.id)
        },
      },
      { id: "desk.find", title: "Find an instrument", group: "Desk", bindingId: "desk.find", keywords: ["symbol", "search"], run: () => open("find") },
      { id: "desk.layouts", title: "Layouts", group: "Desk", bindingId: "desk.layouts", run: () => open("layouts") },
      { id: "desk.keys", title: "Keys", group: "Desk", bindingId: "desk.keys", keywords: ["hotkeys", "shortcuts"], run: () => open("keys") },
      { id: "desk.rules", title: "Rules for the inquiries", group: "Desk", bindingId: "desk.rules", keywords: ["highlight", "filter", "sort"], run: () => open("rules") },
      { id: "alerts.clear", title: "Clear the notices", group: "Desk", run: () => desk.alerts.clear() },
    ]
    return desk.actions.register(list)
  }, [desk, open])
  return (
    <div className="flex items-center gap-2 border-b border-border px-2 py-1">
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => open("find")}>
        Find an instrument
      </Button>
      <span className="min-w-0 truncate text-muted-foreground">
        Drag a tab to dock it, Shift+drag to float. <Keys keys="]" /> and <Keys keys="[" /> move between panels; <Keys keys="g w" /> goes to the watchlist, <Keys keys="g b" /> to the blotter.
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" className="h-6 gap-1.5 px-2 text-xs" onClick={() => setPalette(true)}>
          Commands <Keys keys="mod+k" />
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => open("layouts")}>
          Layouts
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => open("keys")}>
          Keys
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => open("rules")}>
          Rules
        </Button>
      </div>
      <CommandPalette
        actions={desk.actions}
        symbols={symbols}
        onSymbolSelect={(symbol) => {
          desk.watch(symbol.symbol)
          link.setSymbol(symbol.symbol)
        }}
        open={palette}
        onOpenChange={setPalette}
        className="sm:max-w-xl"
      />
    </div>
  )
}

// The four dialogs the toolbar opens: find, layouts, keys, rules. A dialog is a wall for hotkeys, so the
// desk's single keys rest while one is open.
function Dialogs({ dialog, setDialog, layout }: { dialog: DeskDialog | null; setDialog: (dialog: DeskDialog | null) => void; layout: WorkspaceLayout | null }) {
  const desk = useDesk()
  const stack = useStack()
  const link = useLinkGroup({ source: "find", defaultGroup: 1 })
  // The saved layouts travel in a preferences envelope, and so does the window set a shell would restore: this desk
  // as one main window on the active template. A real desk stores that envelope wherever it stores the rest.
  const [prefs, setPrefs] = useState<Preferences>(() => writeWindowSet(createPreferences({ template: ["layouts", WINDOW_SET_SLOT] }), windowSetOf([{ id: "main", layoutId: "desk", main: true }])))
  const [activeId, setActiveId] = useState<string | null>(null)
  const templates = readLayoutTemplates(prefs)
  const windowSet = readWindowSet(prefs)
  const main = windowSet ? mainWindow(windowSet) : undefined
  const close = () => setDialog(null)
  const onOpenChange = (open: boolean) => {
    if (!open) close()
  }
  return (
    <>
      <Dialog open={dialog === "find"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Find an instrument</DialogTitle>
            <DialogDescription>A ticker or a name. The field says how it read what you typed; the pick goes to link group 1.</DialogDescription>
          </DialogHeader>
          <InstrumentSearch
            search={search}
            autoFocus
            onSelect={(hit) => {
              desk.watch(hit.symbol)
              link.setSymbol(hit.symbol)
              close()
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "layouts"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Layouts</DialogTitle>
            <DialogDescription>Save this arrangement under a name and load it back later. Reset puts the desk the way it opened.</DialogDescription>
          </DialogHeader>
          <LayoutManager
            templates={templates}
            onTemplatesChange={(next) => setPrefs(writeLayoutTemplates(prefs, next))}
            current={layout}
            kinds={Object.keys(PANELS)}
            activeId={activeId}
            onLoad={(next, template) => {
              desk.api()?.load(next)
              setActiveId(template.id)
              setPrefs((p) => writeWindowSet(p, windowSetOf([{ id: "main", layoutId: template.id, main: true }])))
              close()
            }}
            onReset={() => {
              const api = desk.api()
              if (!api) return
              api.clear()
              seed(api)
              setActiveId(null)
              setPrefs((p) => writeWindowSet(p, windowSetOf([{ id: "main", layoutId: "desk", main: true }])))
              close()
            }}
            onExport={(text) => void navigator.clipboard?.writeText(text)}
          />
          {main && (
            <p data-desk-windows={main.layoutId} className="text-muted-foreground">
              In a shell this desk is one window set: <span className="text-foreground">{main.id}</span> showing <span className="text-foreground">{main.layoutId}</span>, restored on launch and snapshotted on quit.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "keys"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Keys</DialogTitle>
            <DialogDescription>Every binding on this desk, the tickets' and the palette's included. Press a new one to remap it.</DialogDescription>
          </DialogHeader>
          <HotkeyEditor />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "rules"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rules for the inquiries</DialogTitle>
            <DialogDescription>Highlights, filters, sort, and columns, as data. The stack follows every keystroke.</DialogDescription>
          </DialogHeader>
          <RulesEditor columns={STACK_COLUMNS} rules={stack.rules} onRulesChange={stack.setRules} store={desk.inquiries} columnState={stack.columnState} onColumnStateChange={stack.setColumnState} />
        </DialogContent>
      </Dialog>
    </>
  )
}

// The foot: the feeds against the session, the session itself with the time to its edge, two clocks, and who is signed in.
function Feeds() {
  const desk = useDesk()
  const meta = useStoreMeta(desk.feeds)
  const feeds = useMemo(() => {
    void meta.version
    return desk.feeds.getIds().flatMap((id) => desk.feeds.getRow(id) ?? [])
  }, [desk, meta.version])
  return <FeedHealth feeds={feeds} compact session={GLOBEX} />
}

function Session() {
  const now = useNow()
  const status = GLOBEX.status(now)
  const next = GLOBEX.nextTransition(now)
  return (
    <span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
      <span>
        Globex{" "}
        <span className="text-foreground" data-session-status={status}>
          {status}
        </span>
      </span>
      {next && (
        <>
          <span>{status === "open" ? "closes in" : "opens in"}</span>
          <Countdown expiresAt={next.at} compact announce={false} className="text-foreground" />
        </>
      )}
    </span>
  )
}

function Foot({ sessionEndsAt }: { sessionEndsAt: number }) {
  return (
    <StatusBar
      environment={{ label: "SANDBOX", tone: "primary" }}
      clocks={CLOCKS}
      user="you"
      left={
        <>
          <Feeds />
          <Session />
        </>
      }
      right={<SessionStatus expiresAt={sessionEndsAt} />}
    />
  )
}

// The sign-in the desk pretends to have: twenty minutes a session, two of warning, and a renewal that lands after a
// moment. The guard walls the desk at the end and unmounts nothing, so a half-typed ticket is still there after it.
const SESSION_MS = 20 * 60_000

export default function TerminalDemo() {
  const [desk] = useState(createDesk)
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null)
  const [dialog, setDialog] = useState<DeskDialog | null>(null)
  const [sessionEndsAt, setSessionEndsAt] = useState(() => Date.now() + SESSION_MS)
  const renew = () =>
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        setSessionEndsAt(Date.now() + SESSION_MS)
        resolve(true)
      }, 600),
    )
  useEffect(() => desk.start(), [desk])
  const alertActions = useMemo<NoticeAction[]>(
    () => [
      {
        id: "reconnect",
        label: "Reconnect",
        onAction: (alert) => {
          desk.reconnect()
          desk.alerts.dismiss(alert.id)
        },
      },
      { id: "ack", label: "Acknowledge", onAction: (alert) => desk.alerts.dismiss(alert.id) },
    ],
    [desk],
  )
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <LinkGroupProvider>
        <DeskContext.Provider value={desk}>
          <UiContext.Provider value={setDialog}>
            <StackProvider>
              <div data-desk className="flex h-[48rem] min-w-[56rem] flex-col overflow-hidden rounded-md border border-border bg-background font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
                <Toolbar />
                <SessionGuard expiresAt={sessionEndsAt} onReauthenticate={renew} className="border-b border-border px-2 py-1">
                  <p className="text-muted-foreground">A desk's sign-in goes here: a password, a token prompt, or one button to the identity provider. Nothing on the desk has moved.</p>
                </SessionGuard>
                <DeskAlerts alerts={desk.alerts} actions={alertActions} />
                <Workspace className="min-h-0 flex-1" panels={PANELS} seed={seed} onLayoutChange={setLayout} onReady={desk.attach} watermark="No panels. Open Layouts and reset the desk." />
                <Foot sessionEndsAt={sessionEndsAt} />
                <Dialogs dialog={dialog} setDialog={setDialog} layout={layout} />
              </div>
            </StackProvider>
          </UiContext.Provider>
        </DeskContext.Provider>
      </LinkGroupProvider>
    </HotkeysProvider>
  )
}

const noticeTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })

type NoticeAction = { id: string; label: string; onAction: (alert: Alert) => void }

function Notice({ alerts, id, actions, ttlMs }: { alerts: AlertStore; id: string; actions: NoticeAction[]; ttlMs?: number }) {
  const alert = useAlert(alerts, id, { ttlMs })
  if (!alert) return null
  return (
    <AlertItem tone={alert.tone} data-alert-id={id} data-severity={alert.severity}>
      <AlertHeader>
        <AlertSeverity tone={alert.tone}>{alert.severity}</AlertSeverity>
        <AlertTitle>{alert.title}</AlertTitle>
        {alert.count > 1 && <span className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)} data-alert-count={alert.count}>×{alert.count}</span>}
        <time dateTime={new Date(alert.at).toISOString()} className={cn("shrink-0 text-muted-foreground", NUMERIC_CLASS)}>{noticeTime.format(alert.at)}</time>
        <AlertDismiss aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)} />
      </AlertHeader>
      {alert.message && <AlertBody>{alert.message}</AlertBody>}
      <AlertActions>{actions.map((action) => <AlertActionButton key={action.id} alert={alert} action={action.id} onAction={action.onAction}>{action.label}</AlertActionButton>)}</AlertActions>
    </AlertItem>
  )
}

export function DeskAlerts({ alerts, actions }: { alerts: AlertStore; actions: NoticeAction[] }) {
  const ids = useRowIds(useAlertView(alerts))
  // Notices can expire while history is open; keep its trigger mounted for focus on close.
  return (
    <Dialog>
      <Alerts className="border-b border-border px-2 py-1">
        <AlertsAnnouncer alerts={alerts} id={ids[0] ?? null} assertive={["critical"]} />
        {ids.length > 0 && <AlertsList>{ids.slice(0, 1).map((id) => <Notice key={id} alerts={alerts} id={id} actions={actions} ttlMs={12_000} />)}</AlertsList>}
        {ids.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
        <div className="flex gap-2">
          <DialogTrigger className={buttonVariants({ variant: "ghost", size: "sm" })}>{ids.length > 1 ? `${ids.length - 1} more` : "History"}</DialogTrigger>
          {ids.length > 0 && <Button variant="ghost" size="sm" onClick={() => alerts.clear()}>Clear all</Button>}
        </div>
      </Alerts>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0"><DialogTitle>All notices</DialogTitle><DialogDescription>Every notice, newest first.</DialogDescription></DialogHeader>
        <div className="h-80 min-h-0 min-w-0"><AlertHistory alerts={alerts} /></div>
      </DialogContent>
    </Dialog>
  )
}
