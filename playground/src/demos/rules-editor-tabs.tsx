import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooserPanel } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorDirection, RulesEditorFilterCount, RulesEditorItem, RulesEditorLabel, RulesEditorMatchCount, RulesEditorMove, RulesEditorOperator, RulesEditorPanel, RulesEditorProblem, RulesEditorRemove, RulesEditorRuleCount, RulesEditorTab, RulesEditorTabList, RulesEditorTarget, RulesEditorTone, RulesEditorToneSwatch, RulesEditorValue, useRulesEditor, type RulesEditorProps } from "@/registry/tradecn/ui/rules-editor"

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

export function TabbedRulesEditor<T>({ columnState, onColumnStateChange, ...props }: Omit<RulesEditorProps<T>, "children"> & { columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
  return (
    <RulesEditor {...props}>
      <RulesEditorSections columns={props.columns} columnState={columnState} onColumnStateChange={onColumnStateChange} />
    </RulesEditor>
  )
}

export function RulesEditorSections<T>({ columns, columnState, onColumnStateChange }: { columns: ColumnDef<T>[]; columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
  const { rules, labels } = useRulesEditor()
  const hasColumns = columnState !== undefined && onColumnStateChange !== undefined
  return (
    <>
      <RulesEditorTabList>
        <RulesEditorTab value="highlights">{labels.highlights}<RulesEditorRuleCount kind="highlights" /></RulesEditorTab>
        <RulesEditorTab value="filters">{labels.filters}<RulesEditorRuleCount kind="filters" /></RulesEditorTab>
        <RulesEditorTab value="sort">{labels.sort}<RulesEditorRuleCount kind="sort" /></RulesEditorTab>
        {hasColumns && <RulesEditorTab value="columns">{labels.columns}{columnState.hidden.length > 0 && <span className="lining-nums tabular-nums">{columnState.hidden.length}</span>}</RulesEditorTab>}
      </RulesEditorTabList>
      <RulesEditorPanel value="highlights">
        {!rules.columns?.length && <p className="text-muted-foreground">{labels.noHighlights}</p>}
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
        <RulesEditorAdd kind="highlights">{labels.addHighlight}</RulesEditorAdd>
        <p className="text-muted-foreground">{labels.dragHint}</p>
      </RulesEditorPanel>
      <RulesEditorPanel value="filters">
        {!rules.filter?.length && <p className="text-muted-foreground">{labels.noFilters}</p>}
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
        <div className="flex flex-wrap items-center gap-2">
          <RulesEditorAdd kind="filters">{labels.addFilter}</RulesEditorAdd>
          <RulesEditorFilterCount />
        </div>
        <p className="text-muted-foreground">{labels.dragHint}</p>
      </RulesEditorPanel>
      <RulesEditorPanel value="sort">
        {!rules.sort?.length && <p className="text-muted-foreground">{labels.noSort}</p>}
        <ol className="flex flex-col gap-1">
          {rules.sort?.map((_, index) => (
            <li key={index}>
              <RulesEditorItem kind="sort" index={index}>
                <span aria-hidden title={labels.dragHint} className="cursor-grab text-muted-foreground">⠿</span>
                <span aria-hidden className="w-4 text-right text-muted-foreground lining-nums tabular-nums">{index + 1}</span>
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
        <RulesEditorAdd kind="sort">{labels.addSort}</RulesEditorAdd>
        <p className="text-muted-foreground">{labels.dragHint}</p>
      </RulesEditorPanel>
      {hasColumns && <RulesEditorPanel value="columns"><ColumnChooserPanel columns={columns} columnState={columnState} onColumnStateChange={onColumnStateChange} rules={rules.columns} /></RulesEditorPanel>}
    </>
  )
}
