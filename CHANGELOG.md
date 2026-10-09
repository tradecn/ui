# Changelog

## [2.0.0](https://github.com/tradecn/ui/compare/v1.4.13...v2.0.0) (2026-10-09)


### ⚠ BREAKING CHANGES

* **registry:** Ticket requires a whole quantity and choices from their lists (`checkDraft` gains `choices` and `type`, `tif`, and `account` problems), drops non-whole quick sizes, and says its status from a region instead of an `<output>`; `TicketLabels`, `RfqTicketLabels`, `LimitsLabels`, `DataGridLabels`, `AuditTrailLabels` (`outside`), `ColumnChooserLabels` (`ruleWords`), and `RulesEditorLabels` (`itemName`, `ruleWords`) gain required words, and `LimitsLabels.ticks` and `bps`, `AuditTrailLabels.fields`, and `ColumnChooserLabels.hiddenCount` take a function of the count; a filter rule with a problem is skipped and hides nothing; RfqTicket holds only the requested sides and follows a resized inquiry's size; QuoteField's step buttons say "step"; QuotePanel names rows by instrument by default; a row's `getRowProps` class lands on its frozen cells.
* **registry:** `RulesEditorLabels.matches` and `.shown` take a function of the counts as well as a template, and `DEFAULT_RULES_EDITOR_LABELS` holds functions there, so code that reads them as strings calls them instead.
* **registry:** Watchlist, Positions, and RfqStack name each row by `getRowLabel` (the symbol; the instrument; the client, side, size, and instrument) instead of by its cells, and read the focused row's cells once through a polite live region inside the grid. Find a row by that name, pass your own `getRowLabel`, or pass `null` to name rows by their cells and read nothing, as v1 did; an RfqStack row named that way now changes its name as its countdown's digits do.
* **registry:** GridRules treat a rule they can't read as matching no rows, so a filter rule with an unknown op excludes every row, where v1 ignored it alone and threw beside another filter rule. RulesEditor moves a rule with Alt+Up/Down only from the item and its buttons, with no other modifier held; v1 also moved it from inside a select or a text field. RulesEditor's `onRulesChange` hands back `ReadGridRules`, where v1 typed it `GridRules`, so hold the editor's rules in that type. `RuleDecoration["data-tone"]` widens from `RuleTone` to optional `string`. `useRulesEditorItem()` returns the read types, so a custom control checks a rule's fields before reading them, and `useRulesEditor().problem` takes the rule's kind.
* **registry:** Countdown names its timer with the label and the time left, prints `–` for an endless wait, and holds the bar still for a deadline that isn't finite. RfqStack treats `filter` and `getRowProps` as dependencies, sorts values that aren't finite last, prints an unknown side as sent, refuses threshold text that isn't a plain decimal, and describes the active row; `useActiveInquiry`'s `setActive` ignores an ended or missing id. PriceChart holds a focused plot's name and value text through a live feed and keeps an emptied focused plot's tab stop. DepthLadder shows its empty state for a tick that isn't a finite positive number.
* **registry:** Ticket and RfqTicket show a limit block under its field without an alert or a description, hold the actions it stops with `aria-disabled` instead of disabling them, and say the block from their announcer when a press meets it, never as the market or typing changes it; a refused press no longer stores a block's words in its field. A reason added to a standing question makes the next press ask again, and a question whose action leaves `allowedActions` is withdrawn. QuoteField ties its error to the input with `aria-describedby`, and `announceError={false}` shows it without an alert or a description. QuotePanel refuses a size whose text carries a fraction, even where `Number` would round it to a whole number.
* **registry:** A press on the buttons of Ticket, RfqTicket, and QuotePanel counts once: the second click of a double-click and the clicks a held Enter repeats run nothing, so neither answers a `Send anyway?`, `Quote anyway?`, or `Pull all anyway?` question. A ticket's `quantityStep` that is not a whole number from 1 to `Number.MAX_SAFE_INTEGER` steps by one, and QuotePanel refuses sizes above `Number.MAX_SAFE_INTEGER`.
* **registry:** Neither ticket's send key runs a `destructive` action, even at the default `checked` or when it sends a quote; give one its own binding if it needs a key. A ticket's `defaultDraft` price, and the RFQ ticket's `defaultDraft` levels and Auto, snap to the quote grid, so `run` receives the level the field shows. QuotePanel's limit confirm needs a fresh Enter on the same value in the same opening of the editor: leaving the editor, Tab, a held Enter, or changing the text no longer sends the asked value; the default `askAgain` text reads `{message} Press Enter again to send it, or Escape to discard it.`; and with `limits` on the generated columns, a question line sits above the grid. A `validate` call without the grid's commit argument never answers a question, where v1's second identical call sent the value. QuotePanel's number fields refuse `1e3` and `0x10`, and a negative width is refused.
* **registry:** createActionRegistry no longer replaces an action when the same id is registered again; registrations stack and each unregister removes only what its call added. A consumer that re-registered an action under one id to swap its handler should unregister the old registration first, or register from one owner. The palette shows one row per id and scope and runs the instance whose panel contained the captured focus; give multi-instance panels a within callback so the right one answers. A scoped row's data-row value is now a marked JSON tuple (action!["panel:book","book.cancel"]), and every symbol row spells its key the same way (symbol!["ZN","CBOT"], recent-symbol! alike), so v1 selectors on scoped action rows and on all symbol rows need the new spelling. Action recents persist the scope they ran in and deduplicate by id and scope; v1 id-only entries keep matching, and running a scoped action retires its stale scope-less twin. The editor's capture contract changed: Tab, Shift+Tab, and Option+Tab cancel capture and move on instead of recording, bare Enter and Space are refused until Shift, Ctrl, Meta, or Alt makes them recordable, and the default cancelHint reads Escape cancels, Tab moves on, Backspace unbinds — a v1 end-to-end test that pressed one of these during capture now binds nothing, and bindings on those keys are entered as text.
* **registry:** QuotePanel's two-way crossing reads the instrument's quote direction. On undeclared yield and discount conventions the refusals flip from v1 — a bid below the ask is the crossed one, since those bases quote inverted by default — so a desk that quotes bid at or below ask on yield or discount declares quoteInverted: false on the convention to keep v1's reading; undeclared price and spread keep it without declaring anything.
* **data-grid:** DataGrid controls, nested grids and external portals now own their pointer actions; they no longer implicitly select, focus, edit or activate the enclosing row. Pass an explicit row id to custom actions and update controlled selection or focus when needed. Row actions honor child cancellation, and row menus only open from current plain row content. Use ancestor capture handlers to observe rejected React menu and long-press starts, target handlers to suppress native menus, and the documented wrapper for controls styled with pointer-events: none. Closed ShadowRoot hosts must declare control or independent interaction ownership with data-grid-interaction.
* **rfq-ticket:** checkQuote rejects crossed levels through the instrument's quote direction — yield and discount invert by default, so a rates desk whose yield quotes bid below offer declares quoteInverted: false on the convention, while price and spread keep the v1 reading unless the convention declares quoteInverted: true, as cash credit does; InstrumentConvention gains that field with quoteInvertedOf reading the effective direction. The default crossed message reads The quote is crossed., so update tests matching the old directional text and translated crossed labels that name a direction. checkQuote treats a non-finite level as absent. rfq.tick-up and rfq.tick-down step the side the key event came from rather than comparing focus against the global document. When the control under focus unmounts or disables, focus parks on the ticket root without scrolling - a parent that watched for body to run its own recovery no longer sees it.
* **ticket:** ticket.send runs the first allowed action that checks the draft, preferring the marked primary — v1 ran the marked primary, else the first allowed action, even one with checked: false, so give an unchecked action its own binding when it needs a key. describeDraft prints the level with formatQuote in the instrument's quote basis instead of formatPrice. The mod+up and mod+down shortcuts step by the quote step instead of convention.tick, their binding descriptions read "Price up one step" and "Price down one step", and reference values are read as quotes: the buttons print with formatQuote and store the snapped value they show, so update tests that match the old reference labels or binding descriptions. When the control under focus unmounts or disables, focus parks on the ticket without scrolling.
* **column-chooser:** ColumnChooser's collection is one Tab stop with roving focus. ColumnChooserVisibility, ColumnChooserMove, and ColumnChooserResetWidth default to tabIndex={-1}; pass tabIndex={0} to restore a part's own Tab stop. Arrows, Home, and End move focus between presented columns, Space toggles the focused column's visibility, Delete or Backspace resets its width override, and Alt+Home or Alt+End moves it to the edge of its side. useColumnChooserItem adds moveToEdge, useColumnChooserCommand is new and public, and the default dragHint text names the new keys. Space and Delete on an item act only when it renders the matching visibility or reset-width control, run through that control's own click so its vetoes hold, and are cancelled on every handled press so held repeats cannot scroll the page. An item made editable or given an arrow-owning role keeps every native key and owns a Tab stop of its own while navigation skips it. Items advertise their keys through aria-keyshortcuts, each hidden item speaks labels.hidden as its state as well as the count suffix, and the root watches its own subtree so the stop follows hidden, inert, aria-hidden, class, style, and details toggles even when nothing re-renders.
* **format:** `parsePrice` snaps plain decimals typed into a fraction convention onto the printable grid, so every reader of a parsed price moves — `onValueChange`, ticket drafts and limit checks, RFQ quotes, QuotePanel edits, and saved grid-rule thresholds, which change matches on upgrade when their decimals sit off the grid; `describeRule` prints readable string values through a column's rowless `format` wherever it pairs with `parse`; and values too large to print back in a convention's notation parse as null.
* **rfq-ticket:** RfqTicket shortcuts run from the whole ticket and a disabled ticket runs none; step, suggestion, and quick-size keys act only while an allowed action needs a quote; `rfq.send` runs only a quote-sending action — an explicit `primary: true` on a `needsQuote: false` action no longer rides the key, and the key caps follow the key; `rfq.size-N` declares only for the quick sizes passed, so `remap` of an undeclared size throws; `unregister` of an RFQ id does nothing while a ticket holds the default — register the id or `remap(id, "")`; both level fields say the new `labels.invalidLevel` text; and `rfq-ticket.tsx` requires a `lib/hotkeys.ts` with `declareDefault`.
* **ticket:** Ticket shortcuts run from the whole ticket, so keys pressed on the root are consumed where v1 scoped them to the inner box; a disabled ticket runs no shortcuts; `ticket.size-N` is declared only for the quick sizes passed, so `remap` of an undeclared size throws where v1 succeeded; and `unregister` of a ticket id does nothing while a hotkeys-enabled ticket is mounted — register the id or `remap(id, "")` instead. `ticket.tsx` requires a `lib/hotkeys.ts` with `declareDefault`.
* **row-store:** Custom RowStore implementations must provide a pure prepareView factory returning a PreparedRowView with reversible connect/release ownership. Hook-owned views now disconnect on cleanup instead of becoming terminally disposed, so isDisposed is no longer an unmount signal. Use useView with stable options instead of calling createView during render, and let the hook own its connection. Imperative createView and caller-owned RowView interfaces remain available.
* **blotter:** Blotter Delete and Backspace actions now require focus on the grid itself. Editors, custom controls, header controls, selection checkboxes, nested grids and portaled content retain their keys. Remove editing-only event-prevention workarounds; use action buttons, menu items or useBlotterActions().run for commands elsewhere. Shift+Tab back to the grid preserves selection; a plain cell click can replace it.
* **watchlist:** Watchlist Delete and Backspace removal shortcuts now require focus on the grid itself. Keys from cell editors, custom controls, header controls, selection checkboxes, nested grids and portaled content no longer request row removal. Remove event-prevention workarounds used solely to protect text editing, return focus to the grid for its shortcuts, and use the public removal controls or commands elsewhere in a layout.
* **data-grid:** DataGrid shortcuts now run only when the grid itself has focus, instead of also running from nested controls. Return to the grid with Shift+Tab or click a cell without a control before using its shortcuts. Handle application overrides in onKeyDownCapture and call preventDefault(); a parent's bubbling onKeyDown runs after the grid. See the DataGrid section of the v1-to-v2 migration guide.
* **session-guard:** Replace SessionGuard and SessionGuardProps with SessionGuardProvider and SessionGuardProviderProps, then compose warning, dialog and actions or copy the complete SessionNotice recipe. Provider children now own all markup. Supply a persistent fallbackFocusRef to SessionGuardDialog and caller-owned title/description content. Wrapper classes and phase markers belong to the shared recipe; the primary slot belongs to SessionGuardWarning, and countdown/action selectors move to their new public parts. See the SessionGuard section of the v1-to-v2 migration guide.
* **column-chooser:** ColumnChooser is now an inline root with required children. Replace ColumnChooserPanel with a composed ColumnChooser, or copy ColumnSettingsPanel from complete Usage. Move open/onOpenChange and dialog content classes to the caller's Dialog; use DialogTrigger for button opening or an explicit installed close-focus target for menu/hotkey opening. Compose items, readings and actions explicitly. Root moves follow presented/search order and root edits compare effective settings, normalize defaults and prune retired keys; use baseState for shared reset defaults. Pure helpers and label exports remain available.
* **status-bar:** StatusBar now requires children. Replace environment, clocks and user props with StatusBarEnvironmentBadge, StatusBarClocks/StatusBarClockReadout and StatusBarUser; move left/center/right content and the spacer into JSX. Pass custom clock sources to each readout, use group aria-label and reading prefix props for labels, and supply root data-environment and application slot markers where needed. Descriptor types, formatting helpers, tone classes and default labels remain available.
* **instrument-search:** InstrumentSearch requires caller-owned children. Compose InstrumentSearchContent, InstrumentSearchInput and InstrumentSearchList with InstrumentSearchItem rows; add InstrumentSearchHint where needed. Move autoFocus to Input, omit Hint instead of showHint, and replace renderHit with Item children and useInstrumentSearchState. Keep search, query, callbacks, limits and clearOnSelect on the root. Define search functions at module scope or memoize them with useCallback. See the complete Usage recipe and InstrumentSearch section of the migration guide.
* **audit-trail:** AuditTrail now requires children. Compose AuditTrailGrid and caller-owned AuditTrailChanges content; move grid options to AuditTrailGrid and onExport to AuditTrailExportButton. Replace pane visibility with conditional composition. Keep store, view, columns, formatters, labels and selection on the root. Use the complete Usage table recipe or a custom changes layout, and omit optional parts when they are unavailable. The formerly ignored selectionMode prop is removed; the grid retains multi-selection.
* **blotter:** Blotter requires caller-owned children. Move columns, formatters, label, sorting, menu rendering, deletion keys and other grid inputs to BlotterGrid. Keep store, actions, onNew, selection and focus on Blotter. Replace the implicit toolbar and menu with BlotterActionScope, BlotterActionButton, BlotterActionMenuItem, BlotterSelection and BlotterNewButton; supply newLabel as button children. The migration guide and complete ordinary/custom examples show the replacement compositions.
* **watchlist:** Watchlist now requires children. Compose WatchlistGrid and optional WatchlistAddForm, WatchlistAddInput and WatchlistAddButton; move columns, price, label, menu content and other grid options to WatchlistGrid. Replace addPlaceholder with input placeholder/naming props, and explicitly include watchlistRemoveColumn and WatchlistRemoveMenuItem or your own public removal controls. Keep store, callbacks, normalization, validation, selection and focus on Watchlist. See the complete Watchlist Usage recipe and v1-to-v2 migration guide.
* **perf-monitor:** PerfMonitor requires children. Replace implicit frame readings and histogram with PerfMonitorValue and PerfMonitorHistogram; replace lanes with caller-owned PerfMonitorLane providers and PerfMonitorLaneValue readings. Render custom readouts directly and omit the histogram for compact layouts. PerfReadout is removed, and PerfMonitorLane is now a provider component rather than a descriptor type. See docs/migrating-v1-to-v2.md#perfmonitor and the complete PerfMonitor Usage example.
* **spread-matrix:** SpreadMatrix requires children, and root instruments now supplies structure metadata. Move label to SpreadMatrixTable, map instruments/columns and structures into public rows/cells, and supply headings, captions and unit text in JSX. The columns, structures and labels props, SpreadMatrixLabels, and DEFAULT_SPREAD_MATRIX_LABELS are removed. data-mode and header data attributes belong to the caller. See the SpreadMatrix section of the v1-to-v2 migration guide.
* **depth-ladder:** DepthLadder now requires children. Compose its headers, viewport, virtual rows, cells, and Recenter control explicitly, and move emptyState to DepthLadderEmpty children. Existing book, formatting, virtualization, and staging inputs retain their defaults. See docs/migrating-v1-to-v2.md#depthladder and docs/depth-ladder.md for the replacement composition.
* **layout-manager:** LayoutManager requires children and no longer renders a default manager. Compose its save/import fields, template items, readings, and actions. Move onExport and onReset to caller-owned controls; use exportTemplate for JSON. Render list semantics, empty states, and action placement in caller JSX. All labels and pure helpers remain available. See docs/migrating-v1-to-v2.md#layoutmanager for the API, marker, and focus mapping.
* **hotkey-editor:** HotkeyEditor requires children and no longer renders a default settings screen. Compose HotkeyEditorItem readings, editing fields and controls, and render groups from useHotkeyEditor. Move onExport/onImport into caller controls. Supply the removed import, export, resetAll, remapped and empty labels in caller JSX. See docs/migrating-v1-to-v2.md#hotkeyeditor for the complete mapping.
* **rules-editor:** RulesEditor requires children and no longer renders a default editor. Compose its items, fields, readings, actions, and empty states explicitly. Move columnState and onColumnStateChange to a caller-owned ColumnChooserPanel. Compose installed shadcn Tabs for navigation, moving defaultTab to defaultValue on Tabs or controlled tab state; RulesEditorTab is no longer exported. Update selectors for the moved item markers and removed fixed tab/panel IDs as described in the migration guide. Rule helpers and the remaining root inputs stay available.
* **price-chart:** PriceChart requires children. Compose PriceChartHeader, PriceChartLast, PriceChartChange, PriceChartReadout and one PriceChartPlot explicitly; place PriceChartEmpty inside the plot when needed. Compose PriceChartLegend rows with PriceChartOverlaySwatch for overlays. All existing root plotting options remain available. See docs/migrating-v1-to-v2.md#pricechart.
* **command-palette:** CommandPalette now requires children and no longer inserts its dialog, input, list or result markup. Compose CommandPaletteDialog and CommandPaletteContent with the public input/list/item parts, and render groups through CommandPaletteResults or useCommandPalette. Move className to Dialog or Content; replace labels.empty and labels.searching with caller-owned Empty content. Apply the former five-recent display limit in caller JSX. The registry no longer installs Badge. See docs/migrating-v1-to-v2.md for the complete mapping.
* **feed-health:** FeedHealth requires both `feeds` and `children` and no longer generates its rows, tooltips, controls or announcements. The old self-closing call is a type error. Add `FeedHealthList` with a child callback returning `FeedHealthItem` and your readings; the list supplies keys from stable, unique feed ids. Mount one `FeedHealthAnnouncer` to inherit the collection. Direct-item layouts still pass `feeds={[feed]}`; pass `[]` and optionally compose `FeedHealthEmpty` when the collection is empty. Move `actions` and `pendingMs` into per-feed `useFeedActions` hooks; replace `compact` with caller styling that retains tier text. Replace `labels`, `FeedHealthLabels` and `DEFAULT_FEED_HEALTH_LABELS` with caller-owned accessible names and pending labels. Move feed selectors to the item div, add action data attributes yourself and apply destructive styling at the call site. Install `separator`, `dropdown-menu` or `button` separately when your layout uses them. See the FeedHealth section of the v1-to-v2 migration guide.
* **alerts:** Replace `<Alerts alerts={...} actions={...} />` with caller-composed notice parts inside `<Alerts><AlertsList>…</AlertsList></Alerts>`. Subscribe in each row with `useAlert`, supply expiry there, and mount `AlertsAnnouncer` or an announcing toast adapter. Compose `AlertActionButton` instead of passing the removed `AlertAction[]` configuration. Move collection limits, timestamps, counts, empty content, clear controls, and overflow dialogs to the caller; slice to three notices and supply `Dismiss: {title}` names to preserve v1 defaults. Rename `AlertList` to `AlertHistory`. Replace `AlertsLabels` and `DEFAULT_ALERTS_LABELS` with the history-specific exports: map `listTitle` to `title`, use `noticeTitle` for the formerly hardcoded title-column header, and move strip/dialog labels into caller content. Install shadcn Dialog separately when needed. See `docs/migrating-v1-to-v2.md` for every removed prop, label mapping, and changed slot.

### Features

* **agent-kit:** a skill, rules and a review prompt for a coding agent, and a contract check it can run ([#245](https://github.com/tradecn/ui/issues/245)) ([808562b](https://github.com/tradecn/ui/commit/808562b6d9b2e45a19c94ad24bccf303cda876ce))
* **data-grid:** share column reset defaults ([2fa1545](https://github.com/tradecn/ui/commit/2fa15459e0dd589f49690f98a9e4dfeb2d624e7e))
* **registry:** steady row names for the grids ([#306](https://github.com/tradecn/ui/issues/306)) ([e73d481](https://github.com/tradecn/ui/commit/e73d481520ec8669cf5c5699cb44e28d831d5376))
* **use-hotkeys:** give the registry a defaults layer ([#279](https://github.com/tradecn/ui/issues/279)) ([9b2b0e6](https://github.com/tradecn/ui/commit/9b2b0e6d0fbe10b5bfbbb68e3f540ba7c037ac05))
* **workspace:** compose tab contents and controls ([#248](https://github.com/tradecn/ui/issues/248)) ([a82369f](https://github.com/tradecn/ui/commit/a82369f340ed8ec89d5a60ab4100efb5534f42e7))


### Bug Fixes

* **agent-kit:** name every built-in under the floor and the registry's prerequisites ([#264](https://github.com/tradecn/ui/issues/264)) ([59a8990](https://github.com/tradecn/ui/commit/59a8990645a0e5b52c9dc5b1c1c58c4092901024))
* **alerts:** true up the history grid and restore the released anchors ([#260](https://github.com/tradecn/ui/issues/260)) ([6b9c138](https://github.com/tradecn/ui/commit/6b9c138bcd3388e5ee3bb9766463932f5362b033))
* **blotter:** respect keyboard ownership ([#255](https://github.com/tradecn/ui/issues/255)) ([febe437](https://github.com/tradecn/ui/commit/febe43710e3c7f60577e773c817801c53cd0d9a0))
* **column-chooser:** scale keyboard navigation to wide grids ([#259](https://github.com/tradecn/ui/issues/259)) ([57dc6d1](https://github.com/tradecn/ui/commit/57dc6d1990d3ae787e5de47d81d21f7007efe951))
* **command-palette:** cede the open binding to the consumer's declaration ([#266](https://github.com/tradecn/ui/issues/266)) ([d96583d](https://github.com/tradecn/ui/commit/d96583d531afb535f97d72c46d332aa2a2301760))
* **countdown:** size the bar from a fresh sample ([#284](https://github.com/tradecn/ui/issues/284)) ([88d7fe8](https://github.com/tradecn/ui/commit/88d7fe8ca2e463d46bdbf68bfa740b57e768365d))
* **countdown:** step the bar without Web Animations and keep class clocks bound ([#262](https://github.com/tradecn/ui/issues/262)) ([1555ca5](https://github.com/tradecn/ui/commit/1555ca5b74c804fe1c97df4794f728795e0d6b57))
* **data-grid:** act once for a held key and keep the keyboard's column in view ([#315](https://github.com/tradecn/ui/issues/315)) ([0ce04b1](https://github.com/tradecn/ui/commit/0ce04b1894c8bae8cbf869c7f70d26b3e347dc91))
* **data-grid:** arrivals flash on time, the keyboard respects the view, and quiet editors send nothing ([#296](https://github.com/tradecn/ui/issues/296)) ([825e265](https://github.com/tradecn/ui/commit/825e26506938e6e8a6990c708fff01da7d5171cd))
* **data-grid:** bring the focused row into view before Shift+F10 opens its menu ([#307](https://github.com/tradecn/ui/issues/307)) ([ca28bdb](https://github.com/tradecn/ui/commit/ca28bdbffc1f3a7083e1fe940406c3795b688485))
* **data-grid:** clean up resize gestures and preserve column updates ([#257](https://github.com/tradecn/ui/issues/257)) ([effedf0](https://github.com/tradecn/ui/commit/effedf0dd96187a79cf242777daa4b46b8271058))
* **data-grid:** keep the focused and edited rows rendered ([#305](https://github.com/tradecn/ui/issues/305)) ([1e43467](https://github.com/tradecn/ui/commit/1e434672eda77740f4546daa2a5c59f64b00d263))
* **data-grid:** respect keyboard ownership and visible columns ([#253](https://github.com/tradecn/ui/issues/253)) ([8c9a28c](https://github.com/tradecn/ui/commit/8c9a28cf9f22dd7f02b2b8c3f58a4b7403b9d91a))
* **data-grid:** respect pointer ownership in custom cells ([#258](https://github.com/tradecn/ui/issues/258)) ([1799d47](https://github.com/tradecn/ui/commit/1799d471f5e13a12214be515e23485e516e43cf5))
* **depth-ladder:** speak the focused cell and stage only on the ladder ([#276](https://github.com/tradecn/ui/issues/276)) ([aa11e08](https://github.com/tradecn/ui/commit/aa11e084e8de0cc23eb596a0741ec059eeab7649))
* **format:** a quote whose snap overflows is not a quote ([#285](https://github.com/tradecn/ui/issues/285)) ([dc51998](https://github.com/tradecn/ui/commit/dc519987cedd51cf54cd214ca4ea64031aab4a79))
* **format:** snap fraction decimals to the printable grid ([#273](https://github.com/tradecn/ui/issues/273)) ([fc2893f](https://github.com/tradecn/ui/commit/fc2893f6ba6710fb8ea7114a0d55016baa0e3ab0))
* **layout-manager:** give the import name field its own name ([#269](https://github.com/tradecn/ui/issues/269)) ([22a84d1](https://github.com/tradecn/ui/commit/22a84d136082c3994e40dacd9cf6a5d025099157))
* **limits:** preserve custom block fields ([235f9b0](https://github.com/tradecn/ui/commit/235f9b0601d66969cb8c41a78686363a8568ebb9))
* **panel:** run caller handlers before the drag guards ([#267](https://github.com/tradecn/ui/issues/267)) ([3d9e950](https://github.com/tradecn/ui/commit/3d9e95026ba02fa7cb136b6680b86c9321613349))
* **perf-monitor:** call samplers and meta sources through their instances ([#263](https://github.com/tradecn/ui/issues/263)) ([8d1d371](https://github.com/tradecn/ui/commit/8d1d37150658a3b0925abada6dcf9c16316af40e))
* **price-chart:** repaint on a system scheme flip and name the triggers ([#277](https://github.com/tradecn/ui/issues/277)) ([202edd2](https://github.com/tradecn/ui/commit/202edd26f010802d446ff9e942e2b9f6ba4a258b))
* **quote-field:** a non-finite value is no value ([#280](https://github.com/tradecn/ui/issues/280)) ([699c9d3](https://github.com/tradecn/ui/commit/699c9d3c695a587f6ab62f7839ef206e94d7e40b))
* **registry:** a repeated rejection speaks, and the aging tier meets the floor ([#291](https://github.com/tradecn/ui/issues/291)) ([9339d75](https://github.com/tradecn/ui/commit/9339d7501791aec58308a6548909fd15c23eab5d))
* **registry:** close the alerts certification's findings ([#314](https://github.com/tradecn/ui/issues/314)) ([c4016d9](https://github.com/tradecn/ui/commit/c4016d95ea7e877b9f492381de5c0623511f2328))
* **registry:** close the grid presets' and trading blocks' remaining defects ([#317](https://github.com/tradecn/ui/issues/317)) ([5c5be1d](https://github.com/tradecn/ui/commit/5c5be1de76ee6098081d8d07467598ac888e11ac))
* **registry:** close the grid's keyboard, focus, naming, and wording defects ([#316](https://github.com/tradecn/ui/issues/316)) ([c0eca8a](https://github.com/tradecn/ui/commit/c0eca8a687d11508268cb5a53e6ff9b6bc5b1c99))
* **registry:** close the leaves certification's findings ([#289](https://github.com/tradecn/ui/issues/289)) ([23da8df](https://github.com/tradecn/ui/commit/23da8df6dddea5e95bd18626957086fa6d158c98))
* **registry:** close the libs certification's findings ([#311](https://github.com/tradecn/ui/issues/311)) ([f42ccfc](https://github.com/tradecn/ui/commit/f42ccfcd6f05ffe817f8ae2d564c49df63de415c))
* **registry:** close the merge wave's banked follow-ups ([#290](https://github.com/tradecn/ui/issues/290)) ([97792b2](https://github.com/tradecn/ui/commit/97792b2bc26be925224eb3e097f29ab53bdc5611))
* **registry:** close the shell pages' review findings ([#287](https://github.com/tradecn/ui/issues/287)) ([d6fe0fe](https://github.com/tradecn/ui/commit/d6fe0fe3c89054507ceb78456cc3bd3d7d177e76))
* **registry:** close the shells certification's findings ([#310](https://github.com/tradecn/ui/issues/310)) ([2408da2](https://github.com/tradecn/ui/commit/2408da2ac1e22fd44eeb50422999c85999473842))
* **registry:** close the themes certification's findings ([#312](https://github.com/tradecn/ui/issues/312)) ([0068b82](https://github.com/tradecn/ui/commit/0068b82850580943fb9491173f76cad627a33410))
* **registry:** close the trading pages' review findings ([#288](https://github.com/tradecn/ui/issues/288)) ([019c0c3](https://github.com/tradecn/ui/commit/019c0c34457794c56a4bee00393b12edfa70d940))
* **registry:** count a press once on the tickets and the quote panel ([#300](https://github.com/tradecn/ui/issues/300)) ([dabf46c](https://github.com/tradecn/ui/commit/dabf46c5285da6e567d4adbf49d41c9a2501688f))
* **registry:** palette actions answer from the focused panel, and capture refuses Tab ([#292](https://github.com/tradecn/ui/issues/292)) ([13d9df1](https://github.com/tradecn/ui/commit/13d9df19b587722b6822271625dabb76e8159394))
* **registry:** read a comma only between thousands in every number field ([#313](https://github.com/tradecn/ui/issues/313)) ([8f24c57](https://github.com/tradecn/ui/commit/8f24c575596261d86865ca9254a78bce7e8d11d7))
* **registry:** say the limits when a press meets them ([#301](https://github.com/tradecn/ui/issues/301)) ([46769d6](https://github.com/tradecn/ui/commit/46769d6d7c57a6cc9cf6275ce9b928a051ff0c10))
* **registry:** the blocks certification's findings ([#299](https://github.com/tradecn/ui/issues/299)) ([832654f](https://github.com/tradecn/ui/commit/832654f0c2ee8ea99a78a797257d25ddfe334dfa))
* **registry:** the grids certification's rules findings ([#304](https://github.com/tradecn/ui/issues/304)) ([a4c5109](https://github.com/tradecn/ui/commit/a4c510979bd78edc7bb782e5af3476e166b5e826))
* **registry:** the grids certification's time and sort findings ([#303](https://github.com/tradecn/ui/issues/303)) ([5c128b0](https://github.com/tradecn/ui/commit/5c128b09146a6a5b2090eb8d53d6dbdca4244c27))
* **registry:** the hotkeys certification's findings ([#308](https://github.com/tradecn/ui/issues/308)) ([80950c9](https://github.com/tradecn/ui/commit/80950c9d90f45a17e8d323418e4c178001184781))
* **registry:** the trading certification's findings ([#302](https://github.com/tradecn/ui/issues/302)) ([975d806](https://github.com/tradecn/ui/commit/975d806907e8384d23e85a9785775a268c881639))
* **registry:** the workspace survives hostile layouts, and shells tell the truth ([#293](https://github.com/tradecn/ui/issues/293)) ([90db90f](https://github.com/tradecn/ui/commit/90db90f17806963e0332c6a4203e3148967a05bf))
* **rfq-ticket:** keep declared bindings through remounts and quote from the whole ticket ([#275](https://github.com/tradecn/ui/issues/275)) ([187c76e](https://github.com/tradecn/ui/commit/187c76ef509324598797f60648ac6b3262ceeef6))
* **rfq-ticket:** read crossing through the quote direction and step the key's own side ([#282](https://github.com/tradecn/ui/issues/282)) ([e9199c6](https://github.com/tradecn/ui/commit/e9199c62b1345f58752b022d45862e1b871d8008))
* **row-store:** connect owned views after commit ([#256](https://github.com/tradecn/ui/issues/256)) ([4e8b319](https://github.com/tradecn/ui/commit/4e8b3196c6486b9cd440c325af6a8fc0367e143d))
* **session-calendar:** describe how a repeated local time really resolves ([#271](https://github.com/tradecn/ui/issues/271)) ([bce7720](https://github.com/tradecn/ui/commit/bce77203c504583186c633d5ceda038bebe9f65f))
* **session-guard:** speak the status through hidden text ([#268](https://github.com/tradecn/ui/issues/268)) ([9fcbb18](https://github.com/tradecn/ui/commit/9fcbb1889f86a2531553ffae59c7fb659e83e344))
* **site:** pin installation guides to their release ([#251](https://github.com/tradecn/ui/issues/251)) ([217340d](https://github.com/tradecn/ui/commit/217340d2480a9f7de4a7d238e4db3d4f7418381a))
* **sparkline:** forget the crosshair when the chart stops being live ([#309](https://github.com/tradecn/ui/issues/309)) ([84dbf16](https://github.com/tradecn/ui/commit/84dbf16b38870a66f273e0c0e9fea0bffd1f4d71))
* **sparkline:** step the crosshair with Up and Down and keep the caller's ref ([#261](https://github.com/tradecn/ui/issues/261)) ([054a9aa](https://github.com/tradecn/ui/commit/054a9aa956faab2bd19a2e194c358675c1d9e165))
* **ticket:** run shortcuts from the whole ticket and cede declared bindings ([#274](https://github.com/tradecn/ui/issues/274)) ([d2b996d](https://github.com/tradecn/ui/commit/d2b996d4cabc7bb8722a42af0907ae6f90e04483))
* **ticket:** send checked actions only, step and print in the quote basis ([#281](https://github.com/tradecn/ui/issues/281)) ([5b6d808](https://github.com/tradecn/ui/commit/5b6d808295859e4dcbf007bb98a6dd4baf285c23))
* **typography:** hold the 12 px floor where the source check couldn't see it ([#244](https://github.com/tradecn/ui/issues/244)) ([ce030b9](https://github.com/tradecn/ui/commit/ce030b9ca1f57ff3155ad37f3b493dc444c46578))
* **use-hotkeys:** read the canonical plus form back everywhere it is written ([#265](https://github.com/tradecn/ui/issues/265)) ([7a52421](https://github.com/tradecn/ui/commit/7a5242107e459f0a4ab83c894e2c66a489a67955))
* **watchlist:** preset callbacks follow the caller, and the grid pages state their edges ([#297](https://github.com/tradecn/ui/issues/297)) ([e8e0937](https://github.com/tradecn/ui/commit/e8e093709ca88dd7e8235c3cd39edaf8dcba116d))
* **watchlist:** respect keyboard ownership ([#254](https://github.com/tradecn/ui/issues/254)) ([96c6046](https://github.com/tradecn/ui/commit/96c60464cd3135fa29690daee8f1d404b6d15871))
* **window-set:** say the owner decides what closing main means ([#270](https://github.com/tradecn/ui/issues/270)) ([5e8c2fd](https://github.com/tradecn/ui/commit/5e8c2fd6d5a68a50f45e4fdbf923cf9e4e9717ac))
* **workspace:** one bad value drops alone, and the shells pages close their review ([#298](https://github.com/tradecn/ui/issues/298)) ([0458cff](https://github.com/tradecn/ui/commit/0458cfff8ebaceada66034c5d7e01fae94e94fd0))


### Maintenance

* **alerts:** expose composable notice parts ([#221](https://github.com/tradecn/ui/issues/221)) ([b9ffda2](https://github.com/tradecn/ui/commit/b9ffda234591c6596474fcd5435872baeb87e497))
* **audit-trail:** expose composable history parts ([4fc58c1](https://github.com/tradecn/ui/commit/4fc58c192337cb7fb65752de461da4a3355337e6))
* **blotter:** expose composable order controls and grid ([#239](https://github.com/tradecn/ui/issues/239)) ([9d3eff6](https://github.com/tradecn/ui/commit/9d3eff62840c4202851eb7634d8782645496f5ea))
* **column-chooser:** expose composable column settings ([6d0f46c](https://github.com/tradecn/ui/commit/6d0f46c67c1482cde3b3293713516b3316b90156))
* **command-palette:** expose composable search results and controls ([d23d4a5](https://github.com/tradecn/ui/commit/d23d4a572e7df48e03683532e66154d9aec76272))
* **depth-ladder:** expose composable ladder parts ([bdb7b42](https://github.com/tradecn/ui/commit/bdb7b421eda5c50f56a45c16f48343e10fa6ef9e))
* **feed-health:** expose composable feed readings and actions ([#226](https://github.com/tradecn/ui/issues/226)) ([b29043a](https://github.com/tradecn/ui/commit/b29043aa074010e54f59422bcb516a9bef2930d1))
* **hotkey-editor:** expose composable shortcut fields and controls ([#233](https://github.com/tradecn/ui/issues/233)) ([770b5a1](https://github.com/tradecn/ui/commit/770b5a1eccc22fe0220bf9d630171b86f81bf91f))
* **instrument-search:** expose composable search parts ([1e72755](https://github.com/tradecn/ui/commit/1e727554860d8ced89f76d23d184e16c56ff5e90))
* **layout-manager:** expose composable template fields and controls ([#234](https://github.com/tradecn/ui/issues/234)) ([8185b86](https://github.com/tradecn/ui/commit/8185b867dc1c14ba5fdfae039570a06c858c3d7c))
* **perf-monitor:** expose composable frame and lane readings ([626f639](https://github.com/tradecn/ui/commit/626f63977715071374bdb376a5a3b9e09dccd418))
* **price-chart:** expose composable chart parts ([#230](https://github.com/tradecn/ui/issues/230)) ([80d1b3a](https://github.com/tradecn/ui/commit/80d1b3a67085f9a59057604d8b5b138be7b1fc22))
* **rules-editor:** expose composable rule fields and controls ([#232](https://github.com/tradecn/ui/issues/232)) ([315891d](https://github.com/tradecn/ui/commit/315891d8567907a49806ac6e4ebc40d461395c51))
* **session-guard:** expose composable session controls ([#246](https://github.com/tradecn/ui/issues/246)) ([e6cd393](https://github.com/tradecn/ui/commit/e6cd3935858a68081c305eebdac489f77c0f6d49))
* **spread-matrix:** expose composable spread tables ([e9d6593](https://github.com/tradecn/ui/commit/e9d6593bc4beb8c5a9127553adc939040aecd84a))
* **status-bar:** expose composable status readings ([ccde2e9](https://github.com/tradecn/ui/commit/ccde2e99d89b8d15f61df2cacfade2d5c00a90dd))
* **watchlist:** expose composable controls and grid ([74a9990](https://github.com/tradecn/ui/commit/74a999027bd3bdd5b27bcce907beb73c860541bf))


### Documentation

* **alerts:** start with a single notice ([#224](https://github.com/tradecn/ui/issues/224)) ([33d1597](https://github.com/tradecn/ui/commit/33d1597378c7756912672275982296a8fc3d19d1))
* **command-palette:** keep the dialog's focus docs base-agnostic ([#229](https://github.com/tradecn/ui/issues/229)) ([80a062b](https://github.com/tradecn/ui/commit/80a062b1432776cdcfaa920950e78b1b1c210a28))
* **registry:** pin the adapter identity, caption ownership, and limits wording ([#278](https://github.com/tradecn/ui/issues/278)) ([050a608](https://github.com/tradecn/ui/commit/050a608aafd817d489d6f312416b30e723956e59))
* **registry:** state the blocks' edit contract and true the ticket demos ([#283](https://github.com/tradecn/ui/issues/283)) ([d337ecc](https://github.com/tradecn/ui/commit/d337eccea8aa7cd938a271768e03dbe1b7e4e11e))
* **registry:** state the removal-focus and delta-batch contracts ([#286](https://github.com/tradecn/ui/issues/286)) ([0787914](https://github.com/tradecn/ui/commit/0787914a028f3e3b22cdff35ea1def8f47637d61))
* **registry:** the hotkeys pages say what ships ([#294](https://github.com/tradecn/ui/issues/294)) ([1e6f1bd](https://github.com/tradecn/ui/commit/1e6f1bd83da65092816c2ccbcec3ea5e139d8c3b))
* **registry:** true up the readings, tokens, and shell pages ([#272](https://github.com/tradecn/ui/issues/272)) ([c053f70](https://github.com/tradecn/ui/commit/c053f70d1eb48f3aac599b54930e98e9d77d3ad9))
* **typography:** the body-color cells read set per theme ([#295](https://github.com/tradecn/ui/issues/295)) ([6f413ca](https://github.com/tradecn/ui/commit/6f413caa568640db0abff1beffa13ba7a98bd49c))

## [1.4.13](https://github.com/tradecn/ui/compare/v1.4.12...v1.4.13) (2026-09-24)


### Documentation

* **repo:** simplify README ([#219](https://github.com/tradecn/ui/issues/219)) ([90b443e](https://github.com/tradecn/ui/commit/90b443e2355bddf7c523ae543706aeb37ff5336a))

## [1.4.12](https://github.com/tradecn/ui/compare/v1.4.11...v1.4.12) (2026-09-24)


### Documentation

* **alert-store:** simplify the documentation examples ([45d30bf](https://github.com/tradecn/ui/commit/45d30bf3a517b007ae9cc15608cbcbbf2fcd1878))
* **audit-trail:** make the event history ready to inspect ([88fcf5f](https://github.com/tradecn/ui/commit/88fcf5f98a6be953ce52c6ed6e2ab626c224275e))
* **countdown:** make timer examples self-contained ([f8095ae](https://github.com/tradecn/ui/commit/f8095ae0ddb1f52bd701c509d609cd95408dde4e))
* **format:** organize the examples by value type ([f9e20bb](https://github.com/tradecn/ui/commit/f9e20bb0dca594743d17991b5ae11f029aa8ec2f))
* **hotkey-editor:** simplify setup and show exported overrides ([ac5197e](https://github.com/tradecn/ui/commit/ac5197ec2cf0bcd62a8a6cca5af2cf13e96d8c6d))
* **instrument-search:** simplify the documentation examples ([e89b82b](https://github.com/tradecn/ui/commit/e89b82bf6095cc3b99d949bc7fc3236d1ccd5b5a))
* **limits:** simplify usage and clarify preview outcomes ([60f15a0](https://github.com/tradecn/ui/commit/60f15a029f46ab181253a6bf483a79a6c4ab2cb9))
* **perf-monitor:** separate basic monitoring from grid load ([12c41ef](https://github.com/tradecn/ui/commit/12c41ef47c3f888371b8e5ffae161b88be6750c6))
* **quote-field:** make the comparison easy to copy and inspect ([56924a3](https://github.com/tradecn/ui/commit/56924a3dc70cb35ec609662cc9c7bd27ab612389))
* **rules-editor:** complete and simplify the example ([c795260](https://github.com/tradecn/ui/commit/c7952602bb801f33bc982263220013f0e798c91f))
* **site:** make the color comparison self-contained ([9050561](https://github.com/tradecn/ui/commit/9050561395d3e8eb14211ff477d6760a31b793e0))
* **typography:** make the font specimen self-contained ([8d549df](https://github.com/tradecn/ui/commit/8d549dfbd54aea7af723fb17f1d23a17865c0c07))
* **window-set:** clarify and contain the simulated shell example ([62315da](https://github.com/tradecn/ui/commit/62315da1f380b6a6a073f54a7ca263b0bbfeba08))

## [1.4.11](https://github.com/tradecn/ui/compare/v1.4.10...v1.4.11) (2026-09-24)


### Documentation

* **blotter:** simplify the documentation examples ([c168f97](https://github.com/tradecn/ui/commit/c168f979847d2e1bbbc5b455dec0ff65b57b9c88))
* **column-chooser:** simplify the documentation examples ([aa49ce7](https://github.com/tradecn/ui/commit/aa49ce7d53db552f8ff8829a33f99ec82496913d))
* **session-calendar:** simplify the documentation examples ([b532b28](https://github.com/tradecn/ui/commit/b532b2882a14a43dc87f4ccba15000a0e0550d6d))
* **status-bar:** simplify the documentation examples ([65f5f0e](https://github.com/tradecn/ui/commit/65f5f0e5a438bb3cf0c1448e1404c16e0d6a5f80))

## [1.4.10](https://github.com/tradecn/ui/compare/v1.4.9...v1.4.10) (2026-09-24)


### Documentation

* **alerts:** simplify the documentation examples ([7181599](https://github.com/tradecn/ui/commit/71815995ef9c9aa8e646390635c224352d383210))
* **flash-cell:** simplify the documentation examples ([b16198c](https://github.com/tradecn/ui/commit/b16198cd5ec2ee684a883076de599b9edc72c3aa))
* **parameter-grid:** simplify the documentation examples ([#195](https://github.com/tradecn/ui/issues/195)) ([78462b2](https://github.com/tradecn/ui/commit/78462b2178af6b038c242281d250f4bbfc9b23ab))
* **session-guard:** simplify the documentation examples ([0e7d3c7](https://github.com/tradecn/ui/commit/0e7d3c74eb49f8a56703380e73d93d4a87d91eaf))

## [1.4.9](https://github.com/tradecn/ui/compare/v1.4.8...v1.4.9) (2026-09-24)


### Bug Fixes

* **use-hotkeys:** handlers fenced apart are not a conflict ([#192](https://github.com/tradecn/ui/issues/192)) ([a70664c](https://github.com/tradecn/ui/commit/a70664cea92732e83cc719ff5abd04fd8bd86eb1))


### Documentation

* **grid-rules:** simplify the documentation examples ([#191](https://github.com/tradecn/ui/issues/191)) ([e2fb5e4](https://github.com/tradecn/ui/commit/e2fb5e4ea40403495b4e37a4ede10187c27b76cb))
* **layout-manager:** simplify the documentation examples ([#190](https://github.com/tradecn/ui/issues/190)) ([f01b6ad](https://github.com/tradecn/ui/commit/f01b6ad6bc55dab3fc8237b64619a91ba2db2b6c))
* **sparkline:** simplify the documentation examples ([#194](https://github.com/tradecn/ui/issues/194)) ([a8a921f](https://github.com/tradecn/ui/commit/a8a921fa196c2b554f96d69e8534b0e12f26743a))

## [1.4.8](https://github.com/tradecn/ui/compare/v1.4.7...v1.4.8) (2026-09-24)


### Bug Fixes

* **limits:** a spread distance is in basis points already ([#188](https://github.com/tradecn/ui/issues/188)) ([9757cd4](https://github.com/tradecn/ui/commit/9757cd4363932b27c5b184af48443dbb77a7548b))
* **ticket:** the group carries its status as data-status ([#189](https://github.com/tradecn/ui/issues/189)) ([d02900c](https://github.com/tradecn/ui/commit/d02900cdb07466b7c1d96c68710a4ec1f0e5fa49))


### Documentation

* **preferences:** simplify the documentation examples ([#186](https://github.com/tradecn/ui/issues/186)) ([ebcabdb](https://github.com/tradecn/ui/commit/ebcabdb3818c6412e5766d10ff998f9e3bde81e1))

## [1.4.7](https://github.com/tradecn/ui/compare/v1.4.6...v1.4.7) (2026-09-24)


### Documentation

* **depth-ladder:** simplify the documentation examples ([#179](https://github.com/tradecn/ui/issues/179)) ([e64e854](https://github.com/tradecn/ui/commit/e64e85482e1d90f909f9804a10c16eaa5c9c318d))
* **feed-health:** simplify the documentation examples ([#184](https://github.com/tradecn/ui/issues/184)) ([c9410af](https://github.com/tradecn/ui/commit/c9410afc61f23d8af58c81bdbd91a4a9bb543192))
* **panel:** simplify the documentation examples ([#173](https://github.com/tradecn/ui/issues/173)) ([3e577d9](https://github.com/tradecn/ui/commit/3e577d9d4730041d9954d1e8070bdc336d07314e))
* **positions:** simplify the documentation examples ([#182](https://github.com/tradecn/ui/issues/182)) ([c76e60d](https://github.com/tradecn/ui/commit/c76e60df45734909d5912ff7fa7505e061131f43))
* **price-chart:** simplify the documentation examples ([#183](https://github.com/tradecn/ui/issues/183)) ([d3b22c6](https://github.com/tradecn/ui/commit/d3b22c645e3c0088b45b15daf621605e5c673a66))
* **rfq-stack:** simplify the documentation examples ([#176](https://github.com/tradecn/ui/issues/176)) ([65657a4](https://github.com/tradecn/ui/commit/65657a4e77b4b6dd67e67b80e48554c384dea545))
* **rfq-ticket:** simplify the documentation examples ([#177](https://github.com/tradecn/ui/issues/177)) ([47497b6](https://github.com/tradecn/ui/commit/47497b6a3fbd57ba25b1531c9299ee0b735fa21e))
* **row-store:** simplify the documentation examples ([#178](https://github.com/tradecn/ui/issues/178)) ([2a1e492](https://github.com/tradecn/ui/commit/2a1e492d96b94b08bf262291dd7cf11667adfb19))
* **spread-matrix:** simplify the documentation examples ([#180](https://github.com/tradecn/ui/issues/180)) ([7133d86](https://github.com/tradecn/ui/commit/7133d863c031a17664cb2f90cf480b3ed967cacf))
* **ticket:** simplify the documentation examples ([#185](https://github.com/tradecn/ui/issues/185)) ([6fccaa0](https://github.com/tradecn/ui/commit/6fccaa0a3695d38f4ec53ec92f1c743ecbcb6ec6))
* **use-hotkeys:** simplify the documentation examples ([#175](https://github.com/tradecn/ui/issues/175)) ([750e6bd](https://github.com/tradecn/ui/commit/750e6bdca96ec09f10ced50be0665f97d8ec8d13))
* **watchlist:** simplify the documentation examples ([#181](https://github.com/tradecn/ui/issues/181)) ([a50f4ff](https://github.com/tradecn/ui/commit/a50f4ff92be9b5b20765421809baaf078d1969c3))

## [1.4.6](https://github.com/tradecn/ui/compare/v1.4.5...v1.4.6) (2026-09-23)


### Documentation

* **command-palette:** simplify the documentation examples ([#171](https://github.com/tradecn/ui/issues/171)) ([ac59f25](https://github.com/tradecn/ui/commit/ac59f25b0bde7c19628ad8e2a551e44fd64e45e0))
* **workspace:** simplify the documentation examples ([#169](https://github.com/tradecn/ui/issues/169)) ([eee0a72](https://github.com/tradecn/ui/commit/eee0a72eafc9f2cca2677165ed177c34c1ecb4dd))

## [1.4.5](https://github.com/tradecn/ui/compare/v1.4.4...v1.4.5) (2026-09-23)


### Documentation

* **quote-panel:** simplify the documentation examples ([#166](https://github.com/tradecn/ui/issues/166)) ([988ca71](https://github.com/tradecn/ui/commit/988ca71113034513409dbf6c82429cbe3295ce68))

## [1.4.4](https://github.com/tradecn/ui/compare/v1.4.3...v1.4.4) (2026-09-23)


### Documentation

* **data-grid:** add shared preview alignment controls ([#164](https://github.com/tradecn/ui/issues/164)) ([f3e3a92](https://github.com/tradecn/ui/commit/f3e3a92ace5637624cbd422885c634e6382bdb16))

## [1.4.3](https://github.com/tradecn/ui/compare/v1.4.2...v1.4.3) (2026-09-23)


### Documentation

* **data-grid:** center the documentation previews ([#161](https://github.com/tradecn/ui/issues/161)) ([8c0e95f](https://github.com/tradecn/ui/commit/8c0e95f27e21f58724f97cd1ce971147ffb3539d))

## [1.4.2](https://github.com/tradecn/ui/compare/v1.4.1...v1.4.2) (2026-09-23)


### Maintenance

* **site:** color the code blocks ([#158](https://github.com/tradecn/ui/issues/158)) ([7335caa](https://github.com/tradecn/ui/commit/7335caa9656a63e7595550ceb86e8b5257e8c70e))


### Documentation

* **data-grid:** separate basic usage from focused examples ([#157](https://github.com/tradecn/ui/issues/157)) ([ffc9708](https://github.com/tradecn/ui/commit/ffc970839b966361b33f19636e5ea0e3d4d75451))

## [1.4.1](https://github.com/tradecn/ui/compare/v1.4.0...v1.4.1) (2026-09-23)


### Documentation

* **alert-store:** clarify notice fields and store behavior ([#143](https://github.com/tradecn/ui/issues/143)) ([ada2f0e](https://github.com/tradecn/ui/commit/ada2f0ed48e69d93e56d23e76681f6eb14bc2411))
* **blotter:** clarify props and action behavior ([#145](https://github.com/tradecn/ui/issues/145)) ([16bd9d8](https://github.com/tradecn/ui/commit/16bd9d8968bc93937686f4a7f68b5629c8071758))
* **column-chooser:** clarify props and column state ([#140](https://github.com/tradecn/ui/issues/140)) ([8e5d2da](https://github.com/tradecn/ui/commit/8e5d2daa34935e40bd0882f36d4de9da25c9c386))
* **depth-ladder:** clarify size and interaction behavior ([#151](https://github.com/tradecn/ui/issues/151)) ([2749e28](https://github.com/tradecn/ui/commit/2749e285338d77f990fd4f9b3bc5c2abc0a4b588))
* **feed-health:** clarify feed inputs and lifecycle ([#142](https://github.com/tradecn/ui/issues/142)) ([65d4bd4](https://github.com/tradecn/ui/commit/65d4bd4a3179919b21ad1b8974f26d255a23452c))
* **flash-cell:** clarify props and flash behavior ([#150](https://github.com/tradecn/ui/issues/150)) ([b8e46ca](https://github.com/tradecn/ui/commit/b8e46cad2accd2e0a26c4bad379fe5cd5bd935b7))
* **hotkey-editor:** clarify shortcut editing reference ([#147](https://github.com/tradecn/ui/issues/147)) ([432bd64](https://github.com/tradecn/ui/commit/432bd64f997d1291135470e851b442ba9e7050e3))
* **layout-manager:** clarify template workflows and storage ([#139](https://github.com/tradecn/ui/issues/139)) ([98f02a3](https://github.com/tradecn/ui/commit/98f02a334de4317c53a2293f93a4ae5811a1ec24))
* **perf-monitor:** clarify sampling and report fields ([#141](https://github.com/tradecn/ui/issues/141)) ([2fc7c60](https://github.com/tradecn/ui/commit/2fc7c600bf039fa4058a2d431c25429f2db17f05))
* **price-chart:** clarify data and update behavior ([#152](https://github.com/tradecn/ui/issues/152)) ([c71654e](https://github.com/tradecn/ui/commit/c71654e1804d5a5c740e6edda6b3c444234b01a1))
* **quote-field:** clarify props and editing behavior ([#146](https://github.com/tradecn/ui/issues/146)) ([b8fcb64](https://github.com/tradecn/ui/commit/b8fcb64506e5d00e9590f7558462eb4362590b33))
* **repo:** clarify color research and theme checks ([#156](https://github.com/tradecn/ui/issues/156)) ([c5fc7a4](https://github.com/tradecn/ui/commit/c5fc7a42470b399d884d44aae2f800bf7886bee1))
* **rules-editor:** clarify controls and rule behavior ([#138](https://github.com/tradecn/ui/issues/138)) ([3cde29c](https://github.com/tradecn/ui/commit/3cde29c0d8fe48c017b8176ffe2e6ec37ce6d3bc))
* **session-guard:** clarify phase and reauthentication behavior ([#135](https://github.com/tradecn/ui/issues/135)) ([f2a296a](https://github.com/tradecn/ui/commit/f2a296ad1095cac9cf952823e63f2b088a9287d5))
* **sparkline:** clarify props and rendering behavior ([#148](https://github.com/tradecn/ui/issues/148)) ([59e4619](https://github.com/tradecn/ui/commit/59e4619f0529e66d1ec811235d6ce67ec8c472e2))
* **status-bar:** clarify props and clock behavior ([#149](https://github.com/tradecn/ui/issues/149)) ([5d2d53a](https://github.com/tradecn/ui/commit/5d2d53abd5c27e496ba1ad859a01bb6f3e03a4a7))
* **tradecn-amber:** correct palette and contrast guidance ([#153](https://github.com/tradecn/ui/issues/153)) ([a0ef980](https://github.com/tradecn/ui/commit/a0ef9804b9b8f3804f7d13bd7704753a151489f4))
* **tradecn-slate-east:** clarify palette and color conventions ([#155](https://github.com/tradecn/ui/issues/155)) ([1fb449e](https://github.com/tradecn/ui/commit/1fb449eef1502f03a457c523bc13c1404e129bd0))
* **tradecn-slate:** clarify palette and contrast guidance ([#154](https://github.com/tradecn/ui/issues/154)) ([e488b5c](https://github.com/tradecn/ui/commit/e488b5cc74149d2b42d6bcde64c9e135cd2f3551))
* **watchlist:** clarify props and add and removal behavior ([#144](https://github.com/tradecn/ui/issues/144)) ([8b973c6](https://github.com/tradecn/ui/commit/8b973c6b08336b9298dcf128c283e150cac1f349))

## [1.4.0](https://github.com/tradecn/ui/compare/v1.3.2...v1.4.0) (2026-09-23)


### Features

* **price-chart:** an intraday chart on uPlot ([#127](https://github.com/tradecn/ui/issues/127)) ([5228d5c](https://github.com/tradecn/ui/commit/5228d5c2f5657a2bc416f5113a3c7939a090faba))


### Documentation

* **spread-matrix:** clarify spread calculations and flashes ([#134](https://github.com/tradecn/ui/issues/134)) ([f858572](https://github.com/tradecn/ui/commit/f858572384b6a2cea1d360de35f8063aba3a79f8))

## [1.3.2](https://github.com/tradecn/ui/compare/v1.3.1...v1.3.2) (2026-09-23)


### Documentation

* **quote-panel:** clarify editing and custom columns ([#131](https://github.com/tradecn/ui/issues/131)) ([de1a0fa](https://github.com/tradecn/ui/commit/de1a0fa406984958a3ddfa80b6803592cc6622ef))
* **window-set:** clarify adapter and controller contracts ([#128](https://github.com/tradecn/ui/issues/128)) ([f866e38](https://github.com/tradecn/ui/commit/f866e38d06e412f7d189fb609ee45664c8b0b6be))

## [1.3.1](https://github.com/tradecn/ui/compare/v1.3.0...v1.3.1) (2026-09-23)


### Documentation

* **countdown:** the variants keep running, and say less twice ([#123](https://github.com/tradecn/ui/issues/123)) ([b9cd36c](https://github.com/tradecn/ui/commit/b9cd36cd874ae6215223b89973ae2ac93966c659))
* **repo:** correct desktop shell recipes ([#124](https://github.com/tradecn/ui/issues/124)) ([7325b05](https://github.com/tradecn/ui/commit/7325b05636fbac64a576c7c92848a5a8634524b8))

## [1.3.0](https://github.com/tradecn/ui/compare/v1.2.1...v1.3.0) (2026-09-23)


### Features

* **depth-ladder:** a price ladder that follows the mid until touched ([#106](https://github.com/tradecn/ui/issues/106)) ([5be7272](https://github.com/tradecn/ui/commit/5be7272b29eb24d981c96233b980908a1f414ef0))
* **quote-panel:** a market maker's two-way panel over the editing contract ([#117](https://github.com/tradecn/ui/issues/117)) ([44abf58](https://github.com/tradecn/ui/commit/44abf58095e9d964285f1c404b3dd689b6dce68b))
* **session-guard:** a banner before the end, a wall at it, and nothing underneath unmounts ([#119](https://github.com/tradecn/ui/issues/119)) ([06b5cf4](https://github.com/tradecn/ui/commit/06b5cf4d8be9e66b6673f97c09bff54c1456a48f))
* **spread-matrix:** instruments as rows and columns, each cell a signed spread ([#115](https://github.com/tradecn/ui/issues/115)) ([5427e81](https://github.com/tradecn/ui/commit/5427e8161eaf29e08ff438c17cb7fd500f2b86ab))
* **window-set:** the windows a desk has, as data and a driver over the shell, with the shells page ([#121](https://github.com/tradecn/ui/issues/121)) ([d09a4c5](https://github.com/tradecn/ui/commit/d09a4c5d8442c2e83cff37b889438d5b7a5251cb))


### Documentation

* **alerts:** simplify the component reference ([#120](https://github.com/tradecn/ui/issues/120)) ([1035ac2](https://github.com/tradecn/ui/commit/1035ac2234f29b22c941bf3d95886a229595bc74))
* **audit-trail:** simplify the API reference ([#111](https://github.com/tradecn/ui/issues/111)) ([8801fe2](https://github.com/tradecn/ui/commit/8801fe2e1d40d072a207647d9176c731cb059ce2))
* **countdown:** each variant gets a block of its own ([#116](https://github.com/tradecn/ui/issues/116)) ([f2354d0](https://github.com/tradecn/ui/commit/f2354d02b5c03c56dc0615fe01c331fa1c04c826))
* **countdown:** name each compact timer for its row ([#118](https://github.com/tradecn/ui/issues/118)) ([260f204](https://github.com/tradecn/ui/commit/260f204f2432a62fc2f2ba06dfc6904547da8897))
* **instrument-search:** simplify API reference ([#113](https://github.com/tradecn/ui/issues/113)) ([8749105](https://github.com/tradecn/ui/commit/8749105f6dd15f8cf051c2ffb92d748dd3e0914d))
* **limits:** simplify API reference ([#114](https://github.com/tradecn/ui/issues/114)) ([b440c75](https://github.com/tradecn/ui/commit/b440c7560788457d7557dd8843f3bb307b6d8261))
* **positions:** simplify the API reference ([#112](https://github.com/tradecn/ui/issues/112)) ([67c6bd0](https://github.com/tradecn/ui/commit/67c6bd0e57d4baa2c4d8148821dee073f89e8fc9))
* **session-calendar:** clarify options and calendar behavior ([#122](https://github.com/tradecn/ui/issues/122)) ([5b4ff51](https://github.com/tradecn/ui/commit/5b4ff51638e4163879b4dc284076ae95763a4424))
* **typography:** simplify font setup and guidance ([#108](https://github.com/tradecn/ui/issues/108)) ([e59da09](https://github.com/tradecn/ui/commit/e59da0924024cc4e6dc376c63e321895a2c40f11))

## [1.2.1](https://github.com/tradecn/ui/compare/v1.2.0...v1.2.1) (2026-09-22)


### Maintenance

* **site:** a version menu, and every release keeps its pages ([#94](https://github.com/tradecn/ui/issues/94)) ([15bdd6f](https://github.com/tradecn/ui/commit/15bdd6fe3c36e533256b1a69650c828655abe071))
* **site:** one desk on the front page, every item on it ([#107](https://github.com/tradecn/ui/issues/107)) ([7c7da04](https://github.com/tradecn/ui/commit/7c7da0416e29bccb0b8c21a6f2ae910d43e84b7d))


### Documentation

* **command-palette:** simplify the API reference ([#102](https://github.com/tradecn/ui/issues/102)) ([a1a8835](https://github.com/tradecn/ui/commit/a1a88357e4329e70fa2533b1a295958e777a22d8))
* **format:** simplify the API reference ([#96](https://github.com/tradecn/ui/issues/96)) ([a799160](https://github.com/tradecn/ui/commit/a79916099e3977aa6c8515d46652e33476e7734d))
* **grid-rules:** simplify the API reference ([#95](https://github.com/tradecn/ui/issues/95)) ([e625055](https://github.com/tradecn/ui/commit/e62505548ecbf2db1543074a5abaa41211d69cae))
* **parameter-grid:** simplify the API reference ([#100](https://github.com/tradecn/ui/issues/100)) ([b71e999](https://github.com/tradecn/ui/commit/b71e999b97d386cbcd33156a84812d58d7529ef4))
* **preferences:** simplify the API reference ([#99](https://github.com/tradecn/ui/issues/99)) ([08f306b](https://github.com/tradecn/ui/commit/08f306bd903716b798e486e7f78597597f2c5b1d))
* **registry:** an item's page is headed by the name you import ([#97](https://github.com/tradecn/ui/issues/97)) ([f2840d8](https://github.com/tradecn/ui/commit/f2840d88cb921abc914e48c7138c758a0df5a7b8))
* **rfq-ticket:** simplify the API reference ([#90](https://github.com/tradecn/ui/issues/90)) ([407c5b8](https://github.com/tradecn/ui/commit/407c5b81dce9f62189fab071b9c1417c06415453))
* **row-store:** simplify the API reference ([#104](https://github.com/tradecn/ui/issues/104)) ([dedab9e](https://github.com/tradecn/ui/commit/dedab9e3aab1bda62b8755094acb2c57c3bc246c))
* **ticket:** simplify the API reference ([#93](https://github.com/tradecn/ui/issues/93)) ([3467c4a](https://github.com/tradecn/ui/commit/3467c4af63657fa804c218cb30380738fbadcb16))
* **use-hotkeys:** simplify the API reference ([#103](https://github.com/tradecn/ui/issues/103)) ([c737ea2](https://github.com/tradecn/ui/commit/c737ea2e08b2ed93d8a7d19cd10a924bbf4a0416))

## [1.2.0](https://github.com/tradecn/ui/compare/v1.1.0...v1.2.0) (2026-09-22)


### Features

* **audit-trail:** the life of an order as events, with a changes pane ([#73](https://github.com/tradecn/ui/issues/73)) ([976eba3](https://github.com/tradecn/ui/commit/976eba317d5f4cec3a0eab908ef06f6fe6e4d0fc))
* **data-grid:** editable cells, and a parameter grid over them ([#70](https://github.com/tradecn/ui/issues/70)) ([b3a9faa](https://github.com/tradecn/ui/commit/b3a9faa38491aa2109d98c1ca7696c8d617a2efe))
* **feed-health:** actions the server allows, in each feed's menu ([#76](https://github.com/tradecn/ui/issues/76)) ([db63803](https://github.com/tradecn/ui/commit/db638031389165db221345ec95330e7fb2364ff0))
* **instrument-search:** a field that reads what was typed before it asks the server ([#77](https://github.com/tradecn/ui/issues/77)) ([da0e0d0](https://github.com/tradecn/ui/commit/da0e0d02331bf3f72c4201d205f9762e8c3f3f1d))
* **layout-manager:** named layouts for a workspace ([#74](https://github.com/tradecn/ui/issues/74)) ([cabd5b5](https://github.com/tradecn/ui/commit/cabd5b56d18c29077bb91773e69553fa9a4caee9))
* **positions:** a book of positions on the grid ([#72](https://github.com/tradecn/ui/issues/72)) ([6f1008c](https://github.com/tradecn/ui/commit/6f1008c1eb31452e8901c4e321c27aeac655e31d))
* **ticket:** quick sizes on both tickets, as buttons and mod+1 to mod+9 ([#78](https://github.com/tradecn/ui/issues/78)) ([c91f07a](https://github.com/tradecn/ui/commit/c91f07ab5e3f73bf27b8322597bd29468af2db63))


### Maintenance

* **ci:** a docs commit cuts a patch ([#81](https://github.com/tradecn/ui/issues/81)) ([6a3e54a](https://github.com/tradecn/ui/commit/6a3e54a2e0d2a0243e9d77d698fce256fb8358b5))


### Documentation

* **contract:** simplify the item contract ([#84](https://github.com/tradecn/ui/issues/84)) ([3b74434](https://github.com/tradecn/ui/commit/3b7443430484c558da85389901108dd40142d420))
* **countdown:** simplify the guide and add a props reference ([#75](https://github.com/tradecn/ui/issues/75)) ([85c22f1](https://github.com/tradecn/ui/commit/85c22f1c7f02edec23933b6cbfe606790c030afb))
* **data-grid:** simplify the API reference ([#79](https://github.com/tradecn/ui/issues/79)) ([fb13280](https://github.com/tradecn/ui/commit/fb13280729028a05897c4cd0f1cf0c2139bd8a8d))
* **panel:** simplify the API reference ([#87](https://github.com/tradecn/ui/issues/87)) ([e73e868](https://github.com/tradecn/ui/commit/e73e86815464588a13722dc1c0bb89972c44574a))
* **rfq-stack:** simplify the API reference ([#89](https://github.com/tradecn/ui/issues/89)) ([4e29a1e](https://github.com/tradecn/ui/commit/4e29a1ea914658ef04b3a7b4c55f17ed4cebb54b))
* **workspace:** simplify the API reference ([#82](https://github.com/tradecn/ui/issues/82)) ([03616e8](https://github.com/tradecn/ui/commit/03616e8e1475baac6ecd87093f0c02afd68407ea))

## [1.1.0](https://github.com/tradecn/ui/compare/v1.0.0...v1.1.0) (2026-09-22)


### Features

* **alerts:** a strip of notices over a store that folds repeats ([#63](https://github.com/tradecn/ui/issues/63)) ([6e3adb2](https://github.com/tradecn/ui/commit/6e3adb257c40519b52e1a16fe73e7aeff7b15a40))
* **column-chooser:** a dialog over one grid's columns ([#60](https://github.com/tradecn/ui/issues/60)) ([60197ff](https://github.com/tradecn/ui/commit/60197ff10c3f10ecc22d6fc79cbe5b7836c5c9fd))
* **data-grid:** footer totals, a tape preset, and parking in the stack ([#69](https://github.com/tradecn/ui/issues/69)) ([2a6a44d](https://github.com/tradecn/ui/commit/2a6a44d17b3cb8db325c3adc0e15ad1f132df5d8))
* **grid-rules:** rules as data, and a rules prop on the grid ([#58](https://github.com/tradecn/ui/issues/58)) ([969a888](https://github.com/tradecn/ui/commit/969a8888b69832e629aeaba980201911d0d1774a))
* **limits:** fat-finger checks as data, and both tickets take them ([#66](https://github.com/tradecn/ui/issues/66)) ([716a60f](https://github.com/tradecn/ui/commit/716a60ff53b182654b5b13ca5cd0add970ba7cc3))
* **preferences:** the envelope a desk's settings travel in ([#62](https://github.com/tradecn/ui/issues/62)) ([e3d3e12](https://github.com/tradecn/ui/commit/e3d3e12f4906dd28f8770de681752dffc04e238d))
* **rules-editor:** the editor over one grid's rules ([#61](https://github.com/tradecn/ui/issues/61)) ([6889595](https://github.com/tradecn/ui/commit/6889595bf3a25fd9896236b98d5ceb524abd79b6))
* **session-calendar:** sessions, holidays, and early closes in the venue's zone ([#65](https://github.com/tradecn/ui/issues/65)) ([3f90537](https://github.com/tradecn/ui/commit/3f90537ea1d5e9b381aa88d310cdc9d08d16b864))
* **status-bar:** the strip at the bottom of every terminal ([#64](https://github.com/tradecn/ui/issues/64)) ([8f0f7fa](https://github.com/tradecn/ui/commit/8f0f7faf46d8abc3da0e9fe6e8f0de35fb09c25f))


### Bug Fixes

* **row-store:** a view survives StrictMode's mount rehearsal ([#67](https://github.com/tradecn/ui/issues/67)) ([e2ffbeb](https://github.com/tradecn/ui/commit/e2ffbeb9c9b24834bd42faa477583dbf6e98d978))

## [1.0.0](https://github.com/tradecn/ui/compare/v0.3.0...v1.0.0) (2026-09-22)


### ⚠ BREAKING CHANGES

* **registry:** `tradecn-terminal` and `tradecn-terminal-classic` are removed. A consumer that installed either keeps it as values in its own stylesheet and nothing breaks; to move on, `npx shadcn@latest add tradecn/ui/tradecn-amber#v1.0.0 --diff` (its successor) or `tradecn-slate`. The items' default light marks (`--up`, `--down`, `--stale`, `--expiring`, `--panel-sync`, `--link-1` to `--link-4`) are now `tradecn-slate`'s light side and the dark `--down` is its dark vermilion; items never overwrite a variable you already have, so delete the old lines and run the item again to take them. Nothing tradecn draws is under 12 px, so the `option-chain` preset's `fontClass` is `text-xs`. tradecn.dev wears `tradecn-amber` in both modes.

### Features

* **registry:** 1.0.0, everything comports with the research or goes ([#53](https://github.com/tradecn/ui/issues/53)) ([9bfdf64](https://github.com/tradecn/ui/commit/9bfdf64c3acd52a4e66ca623dcc2e2df672571cb))

## [0.3.0](https://github.com/tradecn/ui/compare/v0.2.0...v0.3.0) (2026-09-22)


### Features

* **registry:** three themes with a light side and a dark side from the color research, slate, slate-east, and amber, with a Color page and a rule that direction never rides on hue alone ([#52](https://github.com/tradecn/ui/issues/52)) ([63d252d](https://github.com/tradecn/ui/commit/63d252d8df2ebb955545f050242d31d09bc0c0a7))
* **typography:** research-grounded font system with consumer overrides ([#50](https://github.com/tradecn/ui/issues/50)) ([72b6cb0](https://github.com/tradecn/ui/commit/72b6cb0266f4d74da0ce1c831a96990ff40652cb))

## [0.2.0](https://github.com/tradecn/ui/compare/v0.1.6...v0.2.0) (2026-09-22)


### Features

* **countdown:** time left as digits on one shared clock and a bar on one animation, turning in the last seconds and stopping at zero ([#40](https://github.com/tradecn/ui/issues/40)) ([02971af](https://github.com/tradecn/ui/commit/02971af7efceb1aeac77e2b5b7cd3068c8b1fceb))
* **format:** a quote basis per instrument, coupons in eighths, maturities, ticks between two prices, and millions as the desk says them ([#42](https://github.com/tradecn/ui/issues/42)) ([6714e8d](https://github.com/tradecn/ui/commit/6714e8dcd894fbc41a32e786437767e31695f5d7))
* **hotkey-editor:** the settings screen for the hotkey registry, with three ways to change a shortcut and conflicts said in words ([#47](https://github.com/tradecn/ui/issues/47)) ([9f5d8b6](https://github.com/tradecn/ui/commit/9f5d8b6f931f79ebcebf80f8b4cf82eb94d32ec9))
* **panel:** a link transport over a shell's own two functions, and one workspace per window for shells whose windows are separate contexts ([#48](https://github.com/tradecn/ui/issues/48)) ([360ddef](https://github.com/tradecn/ui/commit/360ddefd4dddaf04a6939d25befd84b588be7ef1))
* **perf-monitor:** the frame rate on the screen it measures, a histogram against the budget, and a line per lane from its store ([#46](https://github.com/tradecn/ui/issues/46)) ([bc1ceac](https://github.com/tradecn/ui/commit/bc1ceacadf0ec3cb022a8ce0d14f771630a312ed))
* **quote-field:** a field that types a quote the way the instrument quotes it, in its basis, and steps by its step ([#43](https://github.com/tradecn/ui/issues/43)) ([5642a0e](https://github.com/tradecn/ui/commit/5642a0ec33b99e09551d164ea4aadb07b3f2d0e6))
* **rfq-stack:** the stack of open inquiries with a countdown per row, a threshold for the small auto quotes, and the one rule for which inquiry is in the ticket ([#45](https://github.com/tradecn/ui/issues/45)) ([f2cf838](https://github.com/tradecn/ui/commit/f2cf8388d5eba8b9afcd7d0c25317cc10a924087))
* **rfq-ticket:** a dealer's ticket for a request for quote, one inquiry each, quoting in the instrument's basis against the market ([#44](https://github.com/tradecn/ui/issues/44)) ([d217dee](https://github.com/tradecn/ui/commit/d217dee4ed1bf3e82505513a34510f536ecf52e3))

## [0.1.6](https://github.com/tradecn/ui/compare/v0.1.5...v0.1.6) (2026-09-21)


### Maintenance

* **site:** item pages in shadcn's shape, one sentence up top and the install spelled out under Command and Manual ([#32](https://github.com/tradecn/ui/issues/32)) ([a3353f0](https://github.com/tradecn/ui/commit/a3353f087c2a95e3057068b4f7197f6d5632eaad))

## [0.1.5](https://github.com/tradecn/ui/compare/v0.1.4...v0.1.5) (2026-09-21)


### Maintenance

* **site:** live previews on every docs page, one demo per item embedded from the playground ([#27](https://github.com/tradecn/ui/issues/27)) ([9566f7e](https://github.com/tradecn/ui/commit/9566f7e792ebce7407d4688b413322bf9572f5b9))

## [0.1.4](https://github.com/tradecn/ui/compare/v0.1.3...v0.1.4) (2026-09-21)


### Maintenance

* **registry:** point homepage and the README at tradecn.dev ([#21](https://github.com/tradecn/ui/issues/21)) ([8c57463](https://github.com/tradecn/ui/commit/8c574637ab39bb8f4509f0ba75011e3415e9c7c9))
* **repo:** New Earth Technologies holds the license, and the logo lands in the repo and on the site ([#22](https://github.com/tradecn/ui/issues/22)) ([ff7dcf2](https://github.com/tradecn/ui/commit/ff7dcf2cbd5f52aca9c56008a3eff84cff5bad17))
* **repo:** pull request titles pick the next tag, checked the way release-please reads them ([#24](https://github.com/tradecn/ui/issues/24)) ([9b5441a](https://github.com/tradecn/ui/commit/9b5441a2409de9af544111d0c7d1578ec00a3a66))
* **site:** docs pages on tradecn.dev, one per docs/*.md at the tag ([#23](https://github.com/tradecn/ui/issues/23)) ([0f90d2a](https://github.com/tradecn/ui/commit/0f90d2a7f02fdeb13e1734c892b7b1c0573faf3b))
* **site:** take the page's palette from main's registry, not the tag's ([#20](https://github.com/tradecn/ui/issues/20)) ([6b58a9c](https://github.com/tradecn/ui/commit/6b58a9c4b4979d4876f4190a80799ba391c3c0ab))

## [0.1.3](https://github.com/tradecn/ui/compare/v0.1.2...v0.1.3) (2026-09-21)


### Features

* **ticket:** an order ticket as the registry's first block, typing 99-16+ and stepping by the tick, with buttons the server allowed and a status it said ([#19](https://github.com/tradecn/ui/issues/19)) ([4e1f136](https://github.com/tradecn/ui/commit/4e1f1362fcb0ee51275a370b046bcb7c4eb2c3b2))
* **workspace:** panels that dock, tab, float, and pop out, on dockview, each one a hotkey scope, with a layout that carries its own persistence boundaries ([#16](https://github.com/tradecn/ui/issues/16)) ([e61d954](https://github.com/tradecn/ui/commit/e61d954242c53cf3f5637f510cce16720f669297))

## [0.1.2](https://github.com/tradecn/ui/compare/v0.1.1...v0.1.2) (2026-09-21)


### Features

* **blotter:** the data grid as an order blotter, with the server's status and actions gated by what it allows ([#13](https://github.com/tradecn/ui/issues/13)) ([e401f13](https://github.com/tradecn/ui/commit/e401f131a068a2ebd6864c29d61ba144ca878538))
* **panel:** panel chrome as a hotkey scope, with a symbol tag, link groups across windows, and a popout that keeps state ([#9](https://github.com/tradecn/ui/issues/9)) ([9f65030](https://github.com/tradecn/ui/commit/9f6503043ff6497ffeece9c49c42c9a7f94b9c17))
* **sparkline:** a line for a grid cell, colored and worded by direction, with gaps kept and an optional crosshair ([#11](https://github.com/tradecn/ui/issues/11)) ([a71463c](https://github.com/tradecn/ui/commit/a71463ce41cc513be65cbfc293c385395285ffc0))
* **tradecn-terminal-classic:** the terminal theme with green and red ([#15](https://github.com/tradecn/ui/issues/15)) ([3fc5854](https://github.com/tradecn/ui/commit/3fc5854c762e12ee1af72cea7d9cd5847e20f02b))
* **tradecn-terminal:** a terminal theme, black and amber with square corners and a monospace stack ([#14](https://github.com/tradecn/ui/issues/14)) ([c8cfc2f](https://github.com/tradecn/ui/commit/c8cfc2f4c59fc14e0a6e853a200b2392a757272a))
* **watchlist:** the data grid as a watchlist, with an add field that finds what is already there and three ways to remove ([#12](https://github.com/tradecn/ui/issues/12)) ([57c31d1](https://github.com/tradecn/ui/commit/57c31d14096600df7308dc6820d8250c3b4e4ac1))

## [0.1.1](https://github.com/tradecn/ui/compare/v0.1.0...v0.1.1) (2026-09-21)


### Features

* **command-palette:** palette and go-bar on the consumer's command, with a second action, symbol search, and live shortcuts ([#7](https://github.com/tradecn/ui/issues/7)) ([499301a](https://github.com/tradecn/ui/commit/499301aff9a28815cd482d6be8fdd42c2fefffe6))
* **use-hotkeys:** hotkey registry with DOM scopes, chords, conflict detection, and remapping ([#5](https://github.com/tradecn/ui/issues/5)) ([5bbc872](https://github.com/tradecn/ui/commit/5bbc8727f880ee1a9a776c5bdf777b2e535ad806))

## 0.1.0 (2026-09-20)


### Features

* **data-grid:** virtualized delta-fed grid with flash cells, reorder hold, and presets ([4d59736](https://github.com/tradecn/ui/commit/4d59736acb73fc523a35b9f61dc7530f604282ce))
* **feed-health:** per-feed state, age, and staleness tier with lane-specific indicators ([c1c5c92](https://github.com/tradecn/ui/commit/c1c5c92120bf2e7a4e4d5c7c882e71164d581200))
* **flash-cell:** direction-colored flash on change with shared memory and the market tokens ([656d7d8](https://github.com/tradecn/ui/commit/656d7d8dab9e3f74be153f73a7e9f3dabe0a6d4e))
* **format:** number formatting for trading screens ([a335979](https://github.com/tradecn/ui/commit/a335979ae4d9cf9a45e499b2aee507e0f4b88930))
* **row-store:** per-row subscriptions, views with reorder hold, frame batcher ([51b81d3](https://github.com/tradecn/ui/commit/51b81d3eb3dafbf5b707f475d823d747679e7d50))


### Bug Fixes

* **feed-health:** bring its own tooltip provider so Radix consumers render ([8cc9376](https://github.com/tradecn/ui/commit/8cc937610419a8528075e076d24ec2b143ecb4ce))

## Changelog
