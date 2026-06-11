import type { Backend } from "./backend";

// ─── Pattern object types ─────────────────────────────────────────────

export interface ExpandCollapsePattern {
  expand(): void;
  collapse(): void;
}

export interface ScrollPattern {
  scroll(horizontalAmount: number, verticalAmount: number): void;
  setScrollPercent(horizontalPercent: number, verticalPercent: number): void;
}

export interface RangeValuePattern {
  getValue(): Promise<number>;
  setValue(value: number): Promise<void>;
}

export interface WindowPattern {
  setVisualState(state: number): void;
  waitForInputIdle(timeoutMs: number): boolean;
}

export interface SelectionPattern {
  getSelection(): string[];
}

export interface GridPattern {
  getRowCount(): number;
  getColumnCount(): number;
  getItem(row: number, column: number): string;
}

export interface TablePattern {
  getRowHeaders(): string[];
  getColumnHeaders(): string[];
}

export interface SelectionItemPattern {
  select(): void;
  addToSelection(): void;
  removeFromSelection(): void;
  isSelected(): boolean;
}

export type PatternName =
  | "ExpandCollapse"
  | "Scroll"
  | "RangeValue"
  | "Window"
  | "Selection"
  | "Grid"
  | "Table"
  | "SelectionItem";

export type PatternMap = {
  ExpandCollapse: ExpandCollapsePattern;
  Scroll: ScrollPattern;
  RangeValue: RangeValuePattern;
  Window: WindowPattern;
  Selection: SelectionPattern;
  Grid: GridPattern;
  Table: TablePattern;
  SelectionItem: SelectionItemPattern;
};

// ─── Resolver ─────────────────────────────────────────────────────────

export function resolvePattern<T extends PatternName>(
  name: T,
  backend: Backend,
  elementHandle: string,
): PatternMap[T] {
  const el = elementHandle;
  switch (name) {
    case "ExpandCollapse":
      return {
        expand: () => backend.expandCollapseExpand(el),
        collapse: () => backend.expandCollapseCollapse(el),
      } as PatternMap[T];
    case "Scroll":
      return {
        scroll: (h: number, v: number) => backend.scrollPatternScroll(el, h, v),
        setScrollPercent: (h: number, v: number) => backend.scrollPatternSetScrollPercent(el, h, v),
      } as PatternMap[T];
    case "RangeValue":
      return {
        getValue: () => backend.rangeValueGetValue(el),
        setValue: (v: number) => backend.rangeValueSetValue(el, v),
      } as PatternMap[T];
    case "Window":
      return {
        setVisualState: (s: number) => backend.windowPatternSetVisualState(el, s),
        waitForInputIdle: (t: number) => backend.windowPatternWaitForInputIdle(el, t),
      } as PatternMap[T];
    case "Selection":
      return {
        getSelection: () => backend.selectionGetSelection(el),
      } as PatternMap[T];
    case "Grid":
      return {
        getRowCount: () => backend.gridGetRowCount(el),
        getColumnCount: () => backend.gridGetColumnCount(el),
        getItem: (r: number, c: number) => backend.gridGetItem(el, r, c),
      } as PatternMap[T];
    case "Table":
      return {
        getRowHeaders: () => backend.tableGetRowHeaders(el),
        getColumnHeaders: () => backend.tableGetColumnHeaders(el),
      } as PatternMap[T];
    case "SelectionItem":
      return {
        select: () => backend.selectionItemSelect(el),
        addToSelection: () => backend.selectionItemAddToSelection(el),
        removeFromSelection: () => backend.selectionItemRemoveFromSelection(el),
        isSelected: () => backend.selectionItemIsSelected(el),
      } as PatternMap[T];
  }
}
