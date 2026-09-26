import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"
import { NUMERIC_CLASS, createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooserPanel } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorDirection, RulesEditorFilterCount, RulesEditorItem, RulesEditorLabel, RulesEditorMatchCount, RulesEditorMove, RulesEditorOperator, RulesEditorProblem, RulesEditorRemove, RulesEditorRuleCount, RulesEditorTarget, RulesEditorTone, RulesEditorToneSwatch, RulesEditorValue, useRulesEditor, type RulesEditorProps } from "@/registry/tradecn/ui/rules-editor"

interface Rfq {
  id: string
  client: string
  size: number
  px: number | null
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "client", header: "Client", width: 180, sortable: true, accessor: (r) => r.client },
  { key: "size", header: "Size", width: 160, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 170, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
]

const rows: Rfq[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, px: 99.5 },
  { id: "Q-2", client: "BETA", size: 25_000_000, px: 100.015625 },
  { id: "Q-3", client: "GAMMA", size: 10_000_000, px: null },
]

// The editor and the grid share one rules object and one column state. Edit a rule and the grid follows the keystroke.
export default function RulesEditorTabsDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: rows })
    return s
  })
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "threshold", column: "px", when: { op: "gte", value: "100-00" }, tone: "primary", label: "Price threshold" }],
    filter: [],
    sort: [],
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="w-lg max-w-full space-y-3">
      <TabbedRulesEditor className="overflow-x-auto" columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
      <div className="h-48">
        <DataGrid store={store} columns={columns} preset="watchlist" label="Quotes with rules" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
    </div>
  )
}

type TabValue = "highlights" | "filters" | "sort" | "columns"

export function TabbedRulesEditor<T>({ columnState, onColumnStateChange, defaultTab = "highlights", ...props }: Omit<RulesEditorProps<T>, "children"> & { defaultTab?: TabValue; columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
  return (
    <RulesEditor {...props}>
      <RulesEditorSections defaultTab={defaultTab} columns={props.columns} columnState={columnState} onColumnStateChange={onColumnStateChange} />
    </RulesEditor>
  )
}

export function RulesEditorSections<T>({ columns, columnState, onColumnStateChange, defaultTab = "highlights" }: { columns: ColumnDef<T>[]; defaultTab?: TabValue; columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
  const { rules, labels } = useRulesEditor()
  const [tab, setTab] = useState<string>(defaultTab)
  const hasColumns = columnState !== undefined && onColumnStateChange !== undefined
  const selected = tab === "columns" && !hasColumns ? "highlights" : tab
  return (
    <Tabs value={selected} onValueChange={(value) => setTab(String(value))}>
      <TabsList aria-label={labels.title} className="h-auto max-w-full flex-wrap">
        <TabsTrigger value="highlights" onFocus={() => setTab("highlights")}>{labels.highlights}<RulesEditorRuleCount kind="highlights" /></TabsTrigger>
        <TabsTrigger value="filters" onFocus={() => setTab("filters")}>{labels.filters}<RulesEditorRuleCount kind="filters" /></TabsTrigger>
        <TabsTrigger value="sort" onFocus={() => setTab("sort")}>{labels.sort}<RulesEditorRuleCount kind="sort" /></TabsTrigger>
        {hasColumns && <TabsTrigger value="columns" onFocus={() => setTab("columns")}>{labels.columns}{columnState.hidden.length > 0 && <span className={`${NUMERIC_CLASS} text-muted-foreground`}>{columnState.hidden.length}</span>}</TabsTrigger>}
      </TabsList>
      <TabsContent value="highlights">
        <div className="flex flex-col gap-2">
          {rules.columns?.length ? (
            <ul className="flex flex-col gap-1">
              {rules.columns?.map((rule, index) => (
                <li key={rule.id}>
                  <RulesEditorItem kind="highlights" index={index}>
                    <span aria-hidden title={labels.dragHint} className="cursor-grab text-muted-foreground">⠿</span>
                    <RulesEditorColumn />
                    <RulesEditorOperator />
                    <RulesEditorValue />
                    <RulesEditorValue field="low" />
                    <RulesEditorValue field="high" />
                    <RulesEditorValue field="values" />
                    <RulesEditorTone />
                    <RulesEditorToneSwatch />
                    <RulesEditorTarget />
                    <RulesEditorLabel />
                    <RulesEditorMatchCount />
                    <RulesEditorMove direction="up"><span aria-hidden>▲</span></RulesEditorMove>
                    <RulesEditorMove direction="down"><span aria-hidden>▼</span></RulesEditorMove>
                    <RulesEditorRemove><span aria-hidden>×</span></RulesEditorRemove>
                    <RulesEditorProblem />
                  </RulesEditorItem>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{labels.noHighlights}</p>
          )}
          <RulesEditorAdd kind="highlights">{labels.addHighlight}</RulesEditorAdd>
          <p className="text-muted-foreground">{labels.dragHint}</p>
        </div>
      </TabsContent>
      <TabsContent value="filters">
        <div className="flex flex-col gap-2">
          {rules.filter?.length ? (
            <ul className="flex flex-col gap-1">
              {rules.filter?.map((_, index) => (
                <li key={index}>
                  <RulesEditorItem kind="filters" index={index}>
                    <span aria-hidden title={labels.dragHint} className="cursor-grab text-muted-foreground">⠿</span>
                    <RulesEditorColumn />
                    <RulesEditorOperator />
                    <RulesEditorValue />
                    <RulesEditorValue field="low" />
                    <RulesEditorValue field="high" />
                    <RulesEditorValue field="values" />
                    <RulesEditorMatchCount />
                    <RulesEditorMove direction="up"><span aria-hidden>▲</span></RulesEditorMove>
                    <RulesEditorMove direction="down"><span aria-hidden>▼</span></RulesEditorMove>
                    <RulesEditorRemove><span aria-hidden>×</span></RulesEditorRemove>
                    <RulesEditorProblem />
                  </RulesEditorItem>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{labels.noFilters}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <RulesEditorAdd kind="filters">{labels.addFilter}</RulesEditorAdd>
            <RulesEditorFilterCount />
          </div>
          <p className="text-muted-foreground">{labels.dragHint}</p>
        </div>
      </TabsContent>
      <TabsContent value="sort">
        <div className="flex flex-col gap-2">
          {rules.sort?.length ? (
            <ol className="flex flex-col gap-1">
              {rules.sort?.map((_, index) => (
                <li key={index}>
                  <RulesEditorItem kind="sort" index={index}>
                    <span aria-hidden title={labels.dragHint} className="cursor-grab text-muted-foreground">⠿</span>
                    <span aria-hidden className={`${NUMERIC_CLASS} w-4 text-right text-muted-foreground`}>{index + 1}</span>
                    <RulesEditorColumn />
                    <RulesEditorDirection />
                    <RulesEditorMove direction="up"><span aria-hidden>▲</span></RulesEditorMove>
                    <RulesEditorMove direction="down"><span aria-hidden>▼</span></RulesEditorMove>
                    <RulesEditorRemove><span aria-hidden>×</span></RulesEditorRemove>
                    <RulesEditorProblem />
                  </RulesEditorItem>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">{labels.noSort}</p>
          )}
          <RulesEditorAdd kind="sort">{labels.addSort}</RulesEditorAdd>
          <p className="text-muted-foreground">{labels.dragHint}</p>
        </div>
      </TabsContent>
      {hasColumns && <TabsContent value="columns"><div className="flex flex-col gap-2"><ColumnChooserPanel columns={columns} columnState={columnState} onColumnStateChange={onColumnStateChange} rules={rules.columns} /></div></TabsContent>}
    </Tabs>
  )
}
