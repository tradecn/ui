# Items

Every tradecn item at this tag, by kind. Install one as the skill's step 3 says: preview with `bun x shadcn@4.21.0 add --dry-run -c <app dir> https://tradecn.dev/r/<tag>/<name>.json`, then install with `add -y -o` only when it would overwrite no file the app has edited, one URL per argument. Read its page at `https://tradecn.dev/<tag>/docs/<name>/`. The list is generated from the registry, so it names what the tag has.

## Components

### Alerts (`alerts`)

Composable notice containers, lists, headers, bodies, and actions. Supply your own markup and data, or use the included alert-store hooks for newest-first views, per-notice updates, expiry, and announcements. Add the optional history grid wherever it belongs in your application.

Exports: `Alerts`, `AlertsList`, `AlertItem`, `AlertHeader`, `AlertTitle`, `AlertBody`, `AlertSeverity`, `AlertActions`, `AlertActionButton`, `AlertDismiss`, `AlertsEmpty`, `AlertsAnnouncer`, `useAlert`, `useAlertView`, `AlertHistory`, `alertColumns`, `useToastBridge`, `ALERT_TONE_BAR`, `ALERT_TONE_TEXT`, `DEFAULT_ALERT_HISTORY_LABELS`.

### Audit Trail (`audit-trail`)

Composable event history with a tape grid, selected-event changes, cumulative comparisons and CSV export.

Exports: `AuditTrail`, `AuditTrailGrid`, `AuditTrailChanges`, `AuditTrailExportButton`, `useAuditTrail`, `useAuditTrailChanges`, `auditTrailColumns`, `foldChanges`, `diffEvents`, `formatAuditValue`, `DEFAULT_AUDIT_TRAIL_LABELS`.

### Blotter (`blotter`)

The data grid as an order blotter: time, symbol, side, quantity, filled, price, status, and account. The status is the server's word, printed as it arrives and never worked out. An action such as Cancel is offered only for the orders whose allowedActions the server put it in, the button says how many that is, and the check is made again against the store as the click lands.

Exports: `Blotter`, `BlotterGrid`, `BlotterActionScope`, `BlotterNewButton`, `BlotterSelection`, `BlotterActionButton`, `BlotterActionMenuItem`, `useBlotter`, `useBlotterActions`, `blotterColumns`, `allowedRows`.

### Column Chooser (`column-chooser`)

Compose column visibility, order, width readings, and reset controls over a grid’s controlled column state.

Exports: `ColumnChooser`, `ColumnChooserItem`, `ColumnChooserSearch`, `ColumnChooserAnnouncer`, `ColumnChooserHiddenCount`, `ColumnChooserVisibility`, `ColumnChooserName`, `ColumnChooserFrozen`, `ColumnChooserRule`, `ColumnChooserWidth`, `ColumnChooserResetWidth`, `ColumnChooserMove`, `ColumnChooserResetAll`, `useColumnChooser`, `useColumnChooserItem`, `DEFAULT_COLUMN_CHOOSER_LABELS`, `chooserRows`, `moveColumnTo`, `moveColumnBy`, `setColumnVisible`, `resetColumnWidth`, `isDefaultColumnState`, `useColumnChooserCommand`.

### Command Palette (`command-palette`)

Compose a command palette from public parts on your own shadcn command. Shared behavior supplies registered actions, Shift+Enter secondary actions, async symbol search, recents and live shortcut data. Use the optional dialog wrapper or compose an inline go-bar with your own grammar and result markup.

Exports: `CommandPalette`, `CommandPaletteContent`, `CommandPaletteDialog`, `CommandPaletteInput`, `CommandPaletteList`, `CommandPaletteItem`, `CommandPaletteResults`, `CommandPaletteEmpty`, `CommandPaletteSecondary`, `CommandPaletteKeys`, `useCommandPalette`, `createActionRegistry`, `scorePaletteAction`.

### Countdown (`countdown`)

Time left to a moment: digits that tick once a second on one shared clock, and a bar that shrinks to nothing on one animation the compositor runs, turning in the last seconds and stopping at zero. It rounds up, so it never says zero while time is left, and it decides nothing: the server's word says whether the thing it timed is over.

Exports: `Countdown`, `countdownTier`, `formatRemaining`, `PROVISIONAL_COUNTDOWN_THRESHOLDS`.

### Data Grid (`data-grid`)

Virtualized grid fed by a row store one row at a time: a delta re-renders one row, numeric cells flash by direction, frozen and resizable columns, keyboard selection by row id, a reorder hold, a right-click menu, footer totals, cells edited in place as commands the server answers, presets for blotter, watchlist, RFQ, option chain, tape, and parameters.

Exports: `DataGrid`, `DATA_GRID_PRESETS`, `exportCsv`, `editProblem`, `isEditProblem`, `EMPTY_COLUMN_STATE`, `compareForSort`, `comparatorFor`, `resolveColumns`.

### Depth Ladder (`depth-ladder`)

A composable virtual price ladder with public headers, rows, cells, size readings, and recenter controls. Mounted rows subscribe to their own price level; shared behavior preserves following, keyboard navigation, and order staging.

Exports: `DepthLadder`, `DepthLadderHeader`, `DepthLadderColumnHeader`, `DepthLadderViewport`, `DepthLadderRows`, `DepthLadderRow`, `DepthLadderSizeCell`, `DepthLadderPriceCell`, `DepthLadderSize`, `DepthLadderOwnSize`, `DepthLadderEmpty`, `DepthLadderRecenter`, `useDepthLadder`, `useDepthLadderRow`, `levelId`, `tickIndexOf`, `priceAtTick`, `DEFAULT_DEPTH_LADDER_LABELS`.

### Feed Health (`feed-health`)

Composable feed readings with connection state, data age, staleness tiers and lane metadata. Callers own rows, tooltips and controls; a per-feed action hook preserves permission checks and pending requests, and an explicit announcer reports tier changes.

Exports: `FeedHealth`, `FeedHealthList`, `FeedHealthEmpty`, `FeedHealthItem`, `FeedHealthTooltipTrigger`, `FeedHealthTooltipContent`, `FeedHealthIndicator`, `FeedHealthTier`, `FeedAge`, `FeedHealthLane`, `FeedHealthDetails`, `FeedHealthPending`, `FeedHealthAnnouncer`, `useFeedActions`, `useFeedActionMenu`, `stalenessTier`, `createClock`, `feedActionsFor`, `PROVISIONAL_THRESHOLDS`, `alwaysOpen`, `formatAge`.

### Flash Cell (`flash-cell`)

A cell that flashes on change, colored up, down, or flat, as a fill or an inset ring. Web Animations on the existing element, a shared memory so virtualized rows resume mid-flash, reduced-motion aware. Introduces the up/down/flat tokens.

Exports: `FlashCell`.

### Hotkey Editor (`hotkey-editor`)

Composable shortcut readings, capture and text fields, reset controls and conflict messages over the hotkey registry. Callers own grouping, row content, empty states and import/export actions.

Exports: `HotkeyEditor`, `HotkeyEditorItem`, `HotkeyEditorSearch`, `HotkeyEditorKeys`, `HotkeyEditorChange`, `HotkeyEditorEdit`, `HotkeyEditorCapture`, `HotkeyEditorInput`, `HotkeyEditorReset`, `HotkeyEditorResetAll`, `HotkeyEditorProblem`, `HotkeyEditorConflicts`, `useHotkeyEditor`, `useHotkeyEditorItem`, `DEFAULT_HOTKEY_EDITOR_LABELS`, `matchesQuery`, `groupOf`, `scopeWord`.

### Instrument Search (`instrument-search`)

Composable instrument search with shared query recognition, debounced requests and selection. Arrange the input, results, recognition hints and application controls through public parts; choose each result row and its order.

Exports: `InstrumentSearch`, `InstrumentSearchContent`, `InstrumentSearchInput`, `InstrumentSearchList`, `InstrumentSearchItem`, `InstrumentSearchHint`, `useInstrumentSearchState`, `useInstrumentSearch`, `toSymbolAdapter`, `matchedIdentifier`, `DEFAULT_INSTRUMENT_SEARCH_LABELS`, `isCusip`, `isIsin`, `parseCoupon`, `parseMaturity`, `parseCouponMaturity`, `recognizeQuery`, `QUERY_KIND_LABELS`.

### Layout Manager (`layout-manager`)

Composable saved workspace layouts with public template readings, save and import fields, rename controls, and confirmed actions. The caller owns the list, persistence, export, reset, and workspace loading.

Exports: `LayoutManager`, `useLayoutManager`, `LayoutManagerItem`, `useLayoutManagerItem`, `LayoutManagerSaveName`, `LayoutManagerSave`, `LayoutManagerTaken`, `LayoutManagerImportTrigger`, `LayoutManagerImportContent`, `LayoutManagerImportText`, `LayoutManagerImportName`, `LayoutManagerImportSubmit`, `LayoutManagerImportProblem`, `LayoutManagerName`, `LayoutManagerRenameField`, `LayoutManagerActive`, `LayoutManagerPanelCount`, `LayoutManagerSavedAt`, `LayoutManagerUnknownKinds`, `LayoutManagerLoad`, `LayoutManagerRename`, `LayoutManagerDuplicate`, `LayoutManagerDelete`, `readLayoutTemplates`, `writeLayoutTemplates`, `parseLayoutTemplates`, `saveTemplate`, `importTemplate`, `exportTemplate`, `DEFAULT_LAYOUT_MANAGER_LABELS`, `LAYOUT_TEMPLATES_SLOT`, `LAYOUT_TEMPLATES_VERSION`, `renameTemplate`, `duplicateTemplate`, `deleteTemplate`.

### Panel (`panel`)

The frame around a book, a chart, or a blotter. A panel is a hotkey scope, so its keys come with it, and palette actions registered with the scope and within answer from the focused panel. A header that is a drag handle, a symbol tag you click to retype, link groups that carry a symbol between panels and between windows, and a popout that moves the panel to its own window without remounting it.

Exports: `Panel`, `PanelHeader`, `PanelTitle`, `PanelActions`, `PanelContent`, `SymbolTag`, `LinkGroupDot`, `PanelPopout`.

### Parameter Grid (`parameter-grid`)

A parameter table on the data grid: one row per instrument, tier, or pair, a frozen name, an enable box that asks the server and never flips itself, the values typed in place and held pending until the server's row comes back with them, a rejection printed in the cell, when the server last changed each row, and a mark on the rows changed since a moment. Every value is the consumer's; nothing here decides one.

Exports: `ParameterGrid`, `parameterColumns`, `parameterEdit`, `allowsAction`, `DEFAULT_PARAMETER_GRID_LABELS`.

### Perf Monitor (`perf-monitor`)

Composable frame statistics, histograms, and store lane readings. One sampler and report subscription per monitor; callers own the markup, labels, controls, and lane order.

Exports: `PerfMonitor`, `PerfMonitorValue`, `PerfMonitorHistogram`, `PerfMonitorLane`, `PerfMonitorLaneValue`, `usePerfReport`, `usePerfLane`, `percentile`, `histogram`, `summarize`, `formatMs`, `createFrameSampler`.

### Positions (`positions`)

The data grid as a book of positions: instrument, the position signed in its unit (millions of notional or a count of contracts) with the side named, average, mark, the day's and the total P&L colored by their sign with the sign printed, a risk column the desk names, and totals of what is shown under the body. Every number is the server's; the grid prints and adds and never multiplies a position by a mark. One grid per book.

Exports: `Positions`, `positionsColumns`, `positionsTotals`, `formatPosition`, `positionSide`, `withSign`.

### Price Chart (`price-chart`)

A composable intraday chart on uPlot. Arrange the header, price readings, cursor readout and overlay legend around a line or candle plot. One store subscription feeds the readings and canvas; the plot owns resize, theme updates and the pointer and keyboard crosshair.

Exports: `PriceChart`, `PriceChartHeader`, `PriceChartLast`, `PriceChartChange`, `PriceChartReadout`, `PriceChartPlot`, `PriceChartEmpty`, `PriceChartLegend`, `PriceChartOverlaySwatch`, `usePriceChart`, `CHART_TOKEN_CLASS`, `DEFAULT_PRICE_CHART_LABELS`, `barId`, `barStart`, `foldTick`, `foldTicks`, `EMPTY_COLUMNS`, `columnsOf`, `EMPTY_SUMMARY`, `directionBetween`, `summarize`, `priceOf`, `priceStep`, `priceIncrements`, `priceDecimals`, `formatChange`, `timeFormatter`, `dayFormatter`.

### Quote Field (`quote-field`)

A field that types a quote the way the instrument quotes it: 99-16+ for a note on price, 4.253 for a bill on discount, 12.6 for credit on a spread. It parses on every keystroke and hands the number up, marks what is not a quote on blur and prints a good one back in the notation, and steps by the instrument's own step with the arrows and two buttons, ten with Shift. A held modifier leaves the arrows to the registry above it.

Exports: `QuoteField`.

### Quote Panel (`quote-panel`)

A market maker's two-way panel: one row per instrument with the market's bid and ask, the desk's bid and ask, the skew and the width, a size per side, the server's status word, and the actions the server allows on the row. Every level, size, skew, and width is typed in place through the grid's editing contract, so an edit is a command the server answers and the cell shows it as pending until the row comes back with it; the limits table runs on every edit, a block refusing the value and a confirm asking in words above the grid until a fresh Enter on that value answers it. Pull all asks again. Everything the panel shows is the server's.

Exports: `QuotePanel`, `quotePanelColumns`, `quoteEdit`, `allowsQuoteAction`, `DEFAULT_QUOTE_PANEL_LABELS`.

### RFQ Stack (`rfq-stack`)

The stack of open inquiries: the data grid in its RFQ preset with an inquiry's columns, a compact countdown in every row on one shared clock, a threshold that hides the small auto-quoted ones, and a mark on the one in the ticket. The order is the desk's, held still under a hand; an arrival never moves the viewport, the focus, the mark, or the order. With it, useActiveInquiry: the one rule a stack and a ticket agree on, that the active inquiry stays until the trader acts or the server ends it, and an arrival never changes it.

Exports: `RfqStack`, `useRfqStackView`, `rfqStackColumns`, `rfqThresholdFilter`, `stackOrder`, `bySize`, `byTimeLeft`, `byArrival`, `formatStackSize`, `useActiveInquiry`.

### RFQ Ticket (`rfq-ticket`)

A dealer's ticket for a request for quote: the inquiry as it came (who, which way, how much, in what, with the venue's words on it), the market beside it, the levels already quoted, the auto price when there is one, a countdown to its end, and the fields to type a level in the instrument's own basis. The buttons are the actions the server allowed, checked again as the click lands; the status is the venue's word, printed as it is. One ticket is one inquiry, so a new one never lands in a ticket being worked. Quick sizes, the inquiry's own first, as buttons and mod+1 to mod+9, and the draft carries the size the quote is for.

Exports: `RfqTicket`, `RFQ_TICKET_BINDINGS`, `checkQuote`, `describeQuote`, `quoteDistance`, `quotedSides`, `formatSize`, `DEFAULT_RFQ_TICKET_LABELS`, `QUICK_SIZE_KEYS`.

### Rules Editor (`rules-editor`)

Compose an editor for grid highlights, filters, and sort order with public fields, actions, validation, and live match counts.

Exports: `RulesEditor`, `RulesEditorItem`, `RulesEditorColumn`, `RulesEditorOperator`, `RulesEditorValue`, `RulesEditorTone`, `RulesEditorToneSwatch`, `RulesEditorTarget`, `RulesEditorLabel`, `RulesEditorDirection`, `RulesEditorProblem`, `RulesEditorMatchCount`, `RulesEditorFilterCount`, `RulesEditorRuleCount`, `RulesEditorAdd`, `RulesEditorMove`, `RulesEditorRemove`, `useRulesEditor`, `useRulesEditorItem`, `DEFAULT_RULES_EDITOR_LABELS`, `valueShape`, `withOp`, `withColumn`, `parseValues`, `valuesText`, `moveItem`, `newHighlight`, `newFilter`, `newSort`, `newRuleId`.

### Session Guard (`session-guard`)

Compose session warnings, sign-in dialogs and custom controls around one expiry and one shared request. Keep surrounding drafts mounted while the application renews the session. SessionStatus provides an independent phase and countdown readout.

Exports: `SessionGuardProvider`, `SessionGuardWarning`, `SessionGuardWarningText`, `SessionGuardRemaining`, `SessionGuardReauthenticate`, `SessionGuardActionLabel`, `SessionGuardError`, `SessionGuardDialog`, `useSessionGuard`, `SessionStatus`, `useSessionStatus`, `sessionStatus`, `DEFAULT_SESSION_GUARD_LABELS`, `DEFAULT_WARN_MS`.

### Sparkline (`sparkline`)

A line small enough for a grid cell that still says which way, how far, and between what. Colored by direction against the first reading or a baseline, with the same direction in words for a screen reader. A missing reading is a gap, not a shift. Fixed size for a grid column, or it fills its box through one shared ResizeObserver. An optional crosshair that moves with the pointer and the arrow keys.

Exports: `Sparkline`, `buildSparklineGeometry`, `nearestPointIndex`, `observeSize`, `resetSizeObserver`.

### Spread Matrix (`spread-matrix`)

Composable spread tables for instruments, curves and butterflies, with signed readings in ticks or basis points and row/cell quote subscriptions.

Exports: `SpreadMatrix`, `SpreadMatrixTable`, `SpreadMatrixHead`, `SpreadMatrixRow`, `SpreadMatrixCell`, `SpreadMatrixStructureRow`, `SpreadMatrixStructureCell`, `SpreadMatrixLegs`, `SpreadMatrixValue`, `useSpreadMatrixRow`, `useSpreadMatrixCell`, `useSpreadMatrixStructure`, `spreadBetween`, `structureSpread`, `formatSpread`, `defaultWeights`.

### Status Bar (`status-bar`)

Composable environment, market clock and account readings for terminal bars and custom layouts.

Exports: `StatusBar`, `StatusBarEnvironmentBadge`, `StatusBarClocks`, `StatusBarClockReadout`, `StatusBarUser`, `STATUS_TONE_CLASS`, `formatClock`, `clockFormat`, `DEFAULT_STATUS_BAR_LABELS`.

### Ticket (`ticket`)

An order ticket that types a price the way the instrument quotes it (99-16+), steps it by the quote step with the arrows and the buttons, and hands a checked draft to the action you named. Buttons are the actions the server allowed and nothing else; the status is the server word, printed as it is; an acknowledgement rings the ticket once in primary. Quick sizes as buttons under the quantity and on mod+1 to mod+9. Its keys work while you type in it, and inside a dialog.

Exports: `Ticket`, `TICKET_BINDINGS`, `describeDraft`, `checkDraft`, `parseQuantity`, `DEFAULT_TICKET_LABELS`, `DEFAULT_ORDER_TYPES`, `DEFAULT_TIME_IN_FORCES`, `QUICK_SIZE_KEYS`, `formatQuickSize`.

### Watchlist (`watchlist`)

A watchlist with composable add controls, removal actions and a virtual grid. Reuse symbol normalization, validation and selection in your own layout; the list stays in your row store.

Exports: `Watchlist`, `WatchlistGrid`, `WatchlistAddForm`, `WatchlistAddInput`, `WatchlistAddButton`, `WatchlistRemoveButton`, `WatchlistRemoveMenuItem`, `useWatchlist`, `useWatchlistAdd`, `watchlistColumns`, `watchlistRemoveColumn`.

### Workspace (`workspace`)

Panels that dock, tab, float, and pop out, on dockview. The dock owns where things sit; tradecn owns what each panel is: a kind, a title, and the small JSON it asked to keep. Every docked panel is a hotkey scope of its kind with the active border, and the dock decides which one is active. A layout is written out some milliseconds after the last change, carries its own persistence boundaries, and is read back through a parser that takes nothing on trust.

Exports: `Workspace`, `useWorkspacePanel`, `WorkspaceTab`, `WorkspaceTabTitle`, `WorkspaceTabClose`, `WorkspaceTabActions`, `useWorkspaceTab`.

## Hooks

### Hotkeys (`use-hotkeys`)

A hotkey registry: bindings declared as data with an id, keys, a scope, and a description; one keydown listener; scopes read from the DOM so a panel's keys beat global ones; chords with a timeout; conflict detection; remapping with the consumer's persistence. Typing is protected, menus are left alone, and a dialog is a wall while focus is inside it.

Exports: `HotkeysProvider`, `HotkeyScope`, `useHotkey`, `useHotkeys`, `useHotkeyList`, `usePendingChord`, `useHotkeyScope`, `useMaybeHotkeys`, `useDeclaredHotkeyIds`.

## Utilities

### Agent Kit (`agent-kit`)

What a coding agent needs to build with tradecn: a skill with the design rules and an index of every item at the tag, an instructions file for UI code, a review prompt that writes its findings as a change order, and checkContract, which reads a rendered screen for text under the size floor, numbers out of lining tabular figures, direction carried by color alone, and controls with no accessible name.

Exports: `checkContract`, `CONTRACT_RULES`.

### Alert Store (`alert-store`)

A store for notices over the row store's ordered lane: a notice with the same key replaces the last and grows its count instead of adding a row, a cap lets the oldest without an action go first, and the severity, tone, and allowed actions are the consumer's words and the server's ids, never decided here.

Exports: `byNewest`, `createAlertStore`.

### Format (`format`)

Number formatting for trading screens: tick-derived precision, 32nds and 64ths with + halves, yields, basis points, DV01, compact notional and millions, coupons in eighths, maturities, ticks between two prices, a quote basis per instrument (price, yield, discount, spread) with its own step, signed values, one null sentinel.

Exports: `NULL_TOKEN`, `numberFormat`, `decimalsFromTick`, `roundToTick`, `stepByTick`, `formatFraction`, `formatPrice`, `parsePrice`, `formatYield`, `formatBps`, `formatDv01`, `formatNotional`, `formatSigned`, `formatPercent`, `formatQuantity`, `formatCoupon`, `formatMaturity`, `daysToMaturity`, `ticksBetween`, `formatTicks`, `NUMERIC_CLASS`, `MONO_NUMERIC_CLASS`, `numericFontClass`, `QUOTE_BASIS_LABELS`, `quoteBasisOf`, `quoteInvertedOf`, `quoteStepOf`, `formatQuote`, `parseQuote`, `stepQuote`, `createInstrumentFormatter`.

### Grid Rules (`grid-rules`)

Rules as data for a grid: color a cell or a row when a value crosses a line, show only the rows that pass, order by a stack of columns, all as plain objects a desk writes without a build. A value is typed in the column's own format, a tone is a token name, and an applied rule says itself in words beside the color.

Exports: `RULE_OPS`, `NUMBER_OPS`, `TEXT_OPS`, `RULE_OP_LABELS`, `RULE_TONES`, `ON_TINT_CLASS`, `RULE_TONE_CLASS`, `opsFor`, `columnName`, `normalizeValue`, `compareValues`, `compareDirected`, `readRuleValue`, `readCondition`, `readColumnRule`, `readFilterRule`, `readSortRule`, `readRules`, `compileCondition`, `ruleProblem`, `describeRule`, `compileFilter`, `compileComparator`, `ruleDecoration`, `applyRules`.

### Limits (`limits`)

Fat-finger checks as data: a size above a line, a level too far from the market in the instrument's own unit, a side the book may not take, each a block or an ask-again, returned in the shape the tickets print. The numbers are the desk's, the words are the consumer's, and nothing here decides a limit.

Exports: `DEFAULT_LIMITS_LABELS`, `marketSideFor`, `distanceFromMarket`, `checkLimits`, `blocks`, `confirms`, `problemsByField`.

### Preferences (`preferences`)

The envelope everything a trader or a desk changes without a build travels in: slots with a version and a JSON value for a workspace layout, a grid's column state, hotkey overrides, rules, a threshold, and a payload that says which slots may leave as a desk template, which are one person's, and which never leave a session. Parse, set, read, diff, export, import, and migrate; not a store and not a provider.

Exports: `PREFERENCES_MARK`, `PREFERENCES_VERSION`, `PREFERENCE_BOUNDARIES`, `DEFAULT_BOUNDARY`, `toJson`, `createPreferences`, `parsePreferences`, `getSlot`, `setSlot`, `removeSlot`, `boundaryOf`, `withBoundary`, `diffPreferences`, `exportableSlots`, `exportPreferences`, `importPreferences`, `migratePreferences`, `readSlot`.

### Row Store (`row-store`)

Store-agnostic row store for high-rate feeds: apply one delta batch per frame, subscribe per row, sorted and filtered views with a reorder hold, and a frame batcher for message-driven feeds.

Exports: `createRowStore`, `createFrameBatcher`.

### Session Calendar (`session-calendar`)

A session calendar from sessions, holidays, and early closes in a venue's own time zone, the SessionCalendar feed-health reads plus the next transition, the time to the close, and whether a date is a trading day. Sessions may run across midnight. Time zones and daylight saving go through Intl.DateTimeFormat, no dependency, and the lib ships no venue's data.

Exports: `SESSION_STATUSES`, `localTime`, `parseTime`, `addDays`, `weekdayOf`, `zonedInstant`, `createSessionCalendar`.

### Window Set (`window-set`)

For shells whose windows are separate JavaScript contexts: the set of windows a desk has, which layout each shows, and where each sits, as data with its boundaries, and a controller that drives the consumer's adapter over the shell's own calls: open a window, close one, hear one close, ask where one is. restore() opens the main window first and the rest after it, stopping at the first that fails; a snapshot reads the bounds back. No shell package is imported.

Exports: `createWindowSet`, `parseWindowSet`, `windowSetOf`, `mainWindow`, `readWindowSet`, `writeWindowSet`, `defaultWindowUrl`, `WINDOW_SET_BOUNDARIES`, `WINDOW_SET_KIND`, `WINDOW_SET_VERSION`, `WINDOW_SET_SLOT`, `parseWindowRecord`.

## Themes

### Amber (`tradecn-amber`)

Warm paper in light mode, near-black in dark mode, and blue and vermilion for up and down.

### Slate (`tradecn-slate`)

Cool neutral surfaces with a blue primary, bluish green for up and vermilion for down, in light and dark modes.

### Slate East (`tradecn-slate-east`)

Slate with the direction convention reversed: vermilion for up and bluish green for down.

## Shared

Files no item leads with, installed with every item that bundles them.

### `@/hooks/use-clock`

Installed with `countdown`, `feed-health`, `rfq-stack`, `rfq-ticket`, `session-guard`, `status-bar`.

Exports: `useNow`.

### `@/hooks/use-flash`

Installed with `alerts`, `audit-trail`, `blotter`, `column-chooser`, `data-grid`, `depth-ladder`, `flash-cell`, `parameter-grid`, `positions`, `price-chart`, `quote-panel`, `rfq-stack`, `rfq-ticket`, `rules-editor`, `sparkline`, `spread-matrix`, `ticket`, `watchlist`.

Exports: `createFlashMemory`, `compareValues`, `directionOf`, `FILL_COLORS`, `RING_COLORS`, `directionClass`, `resetReducedMotionCache`, `playFlash`, `useFlash`.

### `@/hooks/use-link-group`

Installed with `panel`, `workspace`.

Exports: `LinkGroupProvider`, `useLinkGroupStore`, `useLinkGroup`.

### `@/hooks/use-popout`

Installed with `panel`, `workspace`.

Exports: `mirrorRoot`, `usePopout`.

### `@/hooks/use-row-store`

Installed with `alerts`, `audit-trail`, `blotter`, `column-chooser`, `data-grid`, `depth-ladder`, `parameter-grid`, `positions`, `price-chart`, `quote-panel`, `rfq-stack`, `row-store`, `rules-editor`, `spread-matrix`, `watchlist`.

Exports: `useRow`, `useRowIds`, `useStoreMeta`, `useView`.

### `@/lib/clock`

Installed with `countdown`, `feed-health`, `rfq-stack`, `rfq-ticket`, `session-guard`, `status-bar`.

Exports: `createClock`, `sharedClock`.

### `@/lib/hotkeys`

Installed with `command-palette`, `hotkey-editor`, `panel`, `rfq-ticket`, `ticket`, `use-hotkeys`, `workspace`.

Exports: `detectPlatform`, `normalizeKeys`, `formatKeys`, `matchesKeys`, `keysFromEvent`, `isEditableTarget`, `isMenuTarget`, `scopeChain`, `createHotkeyRegistry`.

### `@/lib/link-group`

Installed with `panel`, `workspace`.

Exports: `LINK_GROUPS`, `cycleLinkGroup`, `normalizeSymbol`, `isLinkMessage`, `createLinkGroupStore`, `createCallbackTransport`, `createBroadcastChannelTransport`.

### `@/lib/workspace-layout`

Installed with `layout-manager`, `workspace`.

Exports: `WORKSPACE_LAYOUT_KIND`, `WORKSPACE_LAYOUT_VERSION`, `WORKSPACE_PERSISTENCE_BOUNDARIES`, `toPanelState`, `parseWorkspaceLayout`, `unknownPanelKinds`, `isReservedPanelId`, `nextPanelId`, `createWorkspacePanelStore`, `debounce`.
