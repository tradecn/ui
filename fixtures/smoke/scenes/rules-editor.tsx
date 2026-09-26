import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMemo, useState } from "react"
import { ColumnChooserPanel } from "@/components/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"
import { RulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorDirection, RulesEditorFilterCount, RulesEditorItem, RulesEditorLabel, RulesEditorMatchCount, RulesEditorMove, RulesEditorOperator, RulesEditorProblem, RulesEditorRemove, RulesEditorRuleCount, RulesEditorTarget, RulesEditorTone, RulesEditorToneSwatch, RulesEditorValue, useRulesEditor, type RulesEditorProps } from "@/components/ui/rules-editor"
import { NUMERIC_CLASS } from "@/lib/format"
import type { GridRules } from "@/lib/grid-rules"
import { createRowStore } from "@/lib/row-store"

interface Rfq {
  id: string
  client: string
  px: number
  size: number
  status: string
}

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 90, accessor: (r) => r.client },
  { key: "px", header: "Price", width: 80, numeric: true, accessor: (r) => r.px },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: (r) => r.size },
  { key: "status", header: "Status", width: 90, accessor: (r) => r.status },
]

// The editor starts empty; the spec builds a highlight, a filter, and a sort key through the consumer's
// native-select and input, and reads each back in the grid.
export function RulesEditorScene() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: [
        { id: "a", client: "ALPHA", px: 99.5, size: 5_000_000, status: "Open" },
        { id: "b", client: "BETA", px: 100.25, size: 25_000_000, status: "Quoted" },
        { id: "c", client: "GAMMA", px: 99.75, size: 1_000_000, status: "Open" },
      ],
    })
    return s
  }, [])
  const [rules, setRules] = useState<GridRules>({})
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="flex w-[56rem] flex-col gap-2" data-rules-state={JSON.stringify(rules)}>
      <div style={{ height: 140 }}>
        <DataGrid store={store} columns={columns} label="Ruled by the editor" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
      <TabbedRulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
    </div>
  )
}

type TabValue = "highlights" | "filters" | "sort" | "columns"

export function TabbedRulesEditor<T>({ columnState, onColumnStateChange, defaultTab = "highlights", ...props }: Omit<RulesEditorProps<T>, "children"> & { defaultTab?: TabValue; columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
  return (
    <RulesEditor {...props}>
      <EditorSections defaultTab={defaultTab} columns={props.columns} columnState={columnState} onColumnStateChange={onColumnStateChange} />
    </RulesEditor>
  )
}

function EditorSections<T>({ columns, columnState, onColumnStateChange, defaultTab = "highlights" }: { columns: ColumnDef<T>[]; defaultTab?: TabValue; columnState?: ColumnState; onColumnStateChange?: (state: ColumnState) => void }) {
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
