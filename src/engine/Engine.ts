/**
 * The public engine: cell storage + dependency graph + evaluator, glued
 * together with incremental recalculation. Editing a cell re-evaluates only
 * its transitive dependents (plus volatile formulas), in topological order.
 */

import type { Ast } from '../ast/nodes';
import { buildConfig, type EngineConfig } from '../config/types';
import { extractDependencies } from '../dependency/extract';
import { DependencyGraph } from '../dependency/graph';
import type { EvaluationContext } from '../evaluator/context';
import { evaluateAst } from '../evaluator/interpreter';
import { buildDefaultRegistry } from '../functions/index';
import type { FunctionRegistry } from '../functions/registry';
import { parseFormula } from '../parser/parser';
import { cellAddressFromKey, cellAddressKey } from '../reference/addressing';
import type { SimpleCellAddress, SimpleCellRange } from '../reference/types';
import { parseNumericString } from '../value/coercion';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
  type ScalarValue,
} from '../value/types';

/** What the user can put into a cell. Strings starting with "=" are formulas. */
export type RawCellContent = string | number | boolean | CellError | null;

export interface ChangedCell {
  address: SimpleCellAddress;
  /** The new computed value; null when the cell is now empty. */
  value: ScalarValue | null;
}

type Cell =
  | { kind: 'value'; value: ScalarValue }
  /** `value` is null until the first evaluation. */
  | { kind: 'formula'; formula: string; ast: Ast; value: ScalarValue | null };

export class Engine {
  readonly config: EngineConfig;
  /** Per-engine registry; the default function set registers here. */
  readonly functions: FunctionRegistry;

  private readonly cells = new Map<string, Cell>();
  private readonly graph = new DependencyGraph();
  /**
   * Slot index = stable sheet id (never reused). A removed sheet leaves an
   * undefined hole so references to other sheets keep working, and formulas
   * that pointed into the removed sheet read #REF! forever, like Excel.
   */
  private readonly sheets: (string | undefined)[] = ['Sheet1'];
  /** Set while inside batch(): accumulates work instead of recalculating. */
  private pending: { seeds: SimpleCellAddress[]; direct: ChangedCell[] } | undefined;

  private constructor(config?: Partial<EngineConfig>) {
    this.config = buildConfig(config);
    this.functions = buildDefaultRegistry();
  }

  static buildEmpty(config?: Partial<EngineConfig>): Engine {
    return new Engine(config);
  }

  /** Live sheet names, in creation order. */
  getSheetNames(): string[] {
    return this.sheets.filter((name): name is string => name !== undefined);
  }

  /** The sheet's stable id, matched case-insensitively like Excel. */
  getSheetId(name: string): number | undefined {
    const lower = name.toLowerCase();
    const id = this.sheets.findIndex((existing) => existing?.toLowerCase() === lower);
    return id === -1 ? undefined : id;
  }

  /** Adds a sheet (auto-named "SheetN" if no name given) and returns its id. */
  addSheet(name?: string): number {
    let sheetName = name;
    if (sheetName === undefined) {
      let n = this.sheets.length + 1;
      while (this.getSheetId(`Sheet${n}`) !== undefined) {
        n++;
      }
      sheetName = `Sheet${n}`;
    } else if (this.getSheetId(sheetName) !== undefined) {
      throw new Error(`Sheet "${sheetName}" already exists`);
    }
    this.sheets.push(sheetName);
    return this.sheets.length - 1;
  }

  /**
   * Removes a sheet and all its cells. Formulas elsewhere that referenced it
   * recalculate to #REF! and are reported in the returned changes.
   */
  removeSheet(sheet: number): ChangedCell[] {
    this.assertSheet(sheet);
    if (this.pending) {
      throw new Error('removeSheet() inside batch() is not supported');
    }
    const seeds = this.graph.precedentsInSheet(sheet);
    for (const key of [...this.cells.keys()]) {
      const address = cellAddressFromKey(key);
      if (address.sheet === sheet) {
        this.graph.removeFormula(address);
        this.cells.delete(key);
      }
    }
    this.sheets[sheet] = undefined;
    return this.recalculate(seeds);
  }

  private assertSheet(sheet: number): void {
    if (this.sheets[sheet] === undefined) {
      throw new Error(`Sheet ${sheet} does not exist`);
    }
  }

  /**
   * Sets a cell's content (formula, value, or null/"" to clear) and
   * recalculates its dependents. Returns every cell whose value changed.
   */
  setCellContents(address: SimpleCellAddress, content: RawCellContent): ChangedCell[] {
    this.assertSheet(address.sheet);
    const direct = this.applyContent(address, content);
    if (this.pending) {
      this.pending.seeds.push(address);
      if (direct) {
        this.pending.direct.push(direct);
      }
      return [];
    }
    return mergeChanges(direct ? [direct] : [], this.recalculate([address]));
  }

  /**
   * Groups many edits into a single recalculation. Returns the combined
   * changes (recalculation still runs if the callback throws, so the engine
   * never ends up with stale dependents).
   */
  batch(callback: () => void): ChangedCell[] {
    if (this.pending) {
      throw new Error('batch() cannot be nested');
    }
    const pending: { seeds: SimpleCellAddress[]; direct: ChangedCell[] } = { seeds: [], direct: [] };
    this.pending = pending;
    let changes: ChangedCell[] = [];
    try {
      callback();
    } finally {
      this.pending = undefined;
      changes = mergeChanges(pending.direct, this.recalculate(pending.seeds));
    }
    return changes;
  }

  /** The cell's computed value; null for empty cells. */
  getCellValue(address: SimpleCellAddress): ScalarValue | null {
    const cell = this.cells.get(cellAddressKey(address));
    if (!cell) {
      return null;
    }
    return cell.value;
  }

  /** The formula text stored in the cell ("=SUM(A1:A3)"), if it holds one. */
  getCellFormula(address: SimpleCellAddress): string | undefined {
    const cell = this.cells.get(cellAddressKey(address));
    return cell?.kind === 'formula' ? cell.formula : undefined;
  }

  /** Updates storage and graph; returns the direct change for non-formula edits. */
  private applyContent(address: SimpleCellAddress, content: RawCellContent): ChangedCell | undefined {
    const key = cellAddressKey(address);
    const previous = this.cells.get(key);

    if (content === null || content === '') {
      if (!previous) {
        return undefined;
      }
      this.cells.delete(key);
      this.graph.removeFormula(address);
      return { address, value: null };
    }

    if (typeof content === 'string' && content.startsWith('=')) {
      const ast = parseFormula(content, this.config, (name) => this.getSheetId(name));
      this.cells.set(key, { kind: 'formula', formula: content, ast, value: null });
      this.graph.setFormula(address, extractDependencies(ast, address));
      // Recalculation reports the new value.
      return undefined;
    }

    const value = parseContent(content, this.config);
    this.cells.set(key, { kind: 'value', value });
    this.graph.removeFormula(address);
    if (previous?.kind === 'value' && valuesEqual(previous.value, value)) {
      return undefined;
    }
    return { address, value };
  }

  private recalculate(seeds: SimpleCellAddress[]): ChangedCell[] {
    const plan = this.graph.getRecalculationPlan(seeds);
    const changes: ChangedCell[] = [];

    // Cycle members first, so their dependents (later in plan.order) read
    // #CIRCULAR! as a regular error value and propagate it.
    for (const address of plan.cyclic) {
      const cell = this.cells.get(cellAddressKey(address));
      if (cell?.kind !== 'formula') {
        continue;
      }
      const error = new CellError(CellErrorType.CIRCULAR, 'Circular reference');
      if (!valuesEqual(cell.value, error)) {
        cell.value = error;
        changes.push({ address, value: error });
      }
    }

    for (const address of plan.order) {
      const cell = this.cells.get(cellAddressKey(address));
      if (cell?.kind !== 'formula') {
        continue;
      }
      const value = materialize(evaluateAst(cell.ast, this.contextFor(address)));
      if (!valuesEqual(cell.value, value)) {
        cell.value = value;
        changes.push({ address, value });
      }
    }
    return changes;
  }

  private contextFor(address: SimpleCellAddress): EvaluationContext {
    return {
      formulaAddress: address,
      config: this.config,
      functions: this.functions,
      getCellValue: (addr) => this.rawCellValue(addr),
      getRangeValues: (range) => this.rawRangeValues(range),
    };
  }

  private rawCellValue(address: SimpleCellAddress): RawScalarValue {
    if (this.sheets[address.sheet] === undefined) {
      return new CellError(CellErrorType.REF, 'Reference to a removed sheet');
    }
    const cell = this.cells.get(cellAddressKey(address));
    if (!cell) {
      return EmptyValue;
    }
    // A formula's cached value is always fresh here: the recalculation plan
    // evaluates precedents first and assigns cycles before anything else.
    return cell.value ?? EmptyValue;
  }

  private rawRangeValues(range: SimpleCellRange): RawScalarValue[][] {
    const rows: RawScalarValue[][] = [];
    for (let row = range.start.row; row <= range.end.row; row++) {
      const cells: RawScalarValue[] = [];
      for (let col = range.start.col; col <= range.end.col; col++) {
        cells.push(this.rawCellValue({ sheet: range.start.sheet, col, row }));
      }
      rows.push(cells);
    }
    return rows;
  }
}

/** Excel-style parsing of typed content: "42" -> 42, "TRUE" -> true. */
function parseContent(content: string | number | boolean | CellError, config: EngineConfig): ScalarValue {
  if (typeof content !== 'string') {
    return content;
  }
  void config; // locale-aware content parsing (decimal comma) comes with i18n
  const numeric = parseNumericString(content);
  if (numeric !== undefined) {
    return numeric;
  }
  const upper = content.trim().toUpperCase();
  if (upper === 'TRUE') {
    return true;
  }
  if (upper === 'FALSE') {
    return false;
  }
  return content;
}

/** Materializes an evaluation result into a cell value (top-level empty -> 0). */
function materialize(value: RawInterpreterValue): ScalarValue {
  if (value === EmptyValue) {
    // =A1 with A1 empty shows 0 in Excel.
    return 0;
  }
  if (Array.isArray(value)) {
    return new CellError(CellErrorType.VALUE, 'Array results require dynamic arrays (phase 3)');
  }
  if (typeof value === 'number' && value === 0) {
    // Excel has no negative zero: =-5*0 is plain 0.
    return 0;
  }
  return value;
}

function valuesEqual(a: ScalarValue | null, b: ScalarValue | null): boolean {
  if (a instanceof CellError || b instanceof CellError) {
    return a instanceof CellError && b instanceof CellError && a.type === b.type;
  }
  return a === b;
}

/** Deduplicates by address, keeping the later value. */
function mergeChanges(first: ChangedCell[], second: ChangedCell[]): ChangedCell[] {
  const byKey = new Map<string, ChangedCell>();
  for (const change of [...first, ...second]) {
    byKey.set(cellAddressKey(change.address), change);
  }
  return [...byKey.values()];
}
