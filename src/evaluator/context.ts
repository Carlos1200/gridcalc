import type { EngineConfig } from '../config/types';
import type { FunctionRegistry } from '../functions/registry';
import type { SimpleCellAddress, SimpleCellRange } from '../reference/types';
import type { RawScalarValue } from '../value/types';

/** Everything a formula needs from the outside world while evaluating. */
export interface EvaluationContext {
  /** Where the formula being evaluated lives. */
  formulaAddress: SimpleCellAddress;
  config: EngineConfig;
  functions: FunctionRegistry;
  /** Current value of a cell; EmptyValue for blank cells. */
  getCellValue(address: SimpleCellAddress): RawScalarValue;
  /** Values of a rectangular range, row-major. */
  getRangeValues(range: SimpleCellRange): RawScalarValue[][];
  /** Current value of a named expression; undefined -> #NAME?. */
  getNamedExpressionValue(name: string): RawScalarValue | undefined;
  /** Stored formula text of a cell ("=SUM(A1:A3)"); undefined when it holds none. */
  getCellFormula(address: SimpleCellAddress): string | undefined;
  /** 1-based position of a sheet id among the live sheets; undefined if removed. */
  sheetPosition(sheetId: number): number | undefined;
  /** Same, looked up by name (case-insensitive); undefined if unknown. */
  sheetPositionByName(name: string): number | undefined;
  /** Stable sheet id for a name (case-insensitive); undefined if unknown. INDIRECT needs it. */
  sheetIdByName(name: string): number | undefined;
  /** How many sheets currently exist. */
  countSheets(): number;
}
