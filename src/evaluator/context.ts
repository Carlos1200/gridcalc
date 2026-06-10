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
}
