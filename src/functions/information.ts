/**
 * Information functions: the IS* family.
 * The type inspectors (ISBLANK, ISNUMBER...) examine their argument's type
 * without coercing, and they do NOT propagate errors: =ISERROR(1/0) is TRUE,
 * not #DIV/0!. ISEVEN/ISODD are different: they coerce to number and DO
 * propagate errors, like Excel (=ISEVEN("abc") is #VALUE!).
 */

import type { Ast } from '../ast/nodes';
import type { EvaluationContext } from '../evaluator/context';
import { evaluateAst } from '../evaluator/interpreter';
import { CellError, CellErrorType, EmptyValue, type RawInterpreterValue } from '../value/types';
import { asNumber, asScalar, referencedAddress } from './helpers';
import type { RegisteredFunction } from './types';

function inspector(name: string, test: (value: RawInterpreterValue) => boolean): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => test(args[0]!),
  };
}

function parityCheck(name: 'ISEVEN' | 'ISODD'): RegisteredFunction {
  const wantedRemainder = name === 'ISEVEN' ? 0 : 1;
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      // Excel truncates: ISEVEN(2.5) is TRUE, ISODD(-3) is TRUE.
      return n instanceof CellError ? n : Math.abs(Math.trunc(n)) % 2 === wantedRemainder;
    },
  };
}

/** Excel's ERROR.TYPE numbering; unmapped engine-specific errors -> #N/A. */
const ERROR_TYPE_CODES: Partial<Record<CellErrorType, number>> = {
  [CellErrorType.NULL]: 1,
  [CellErrorType.DIV_BY_ZERO]: 2,
  [CellErrorType.VALUE]: 3,
  [CellErrorType.REF]: 4,
  [CellErrorType.NAME]: 5,
  [CellErrorType.NUM]: 6,
  [CellErrorType.NA]: 7,
  [CellErrorType.SPILL]: 9,
  [CellErrorType.CALC]: 14,
};

export const informationFunctions: RegisteredFunction[] = [
  inspector('ISBLANK', (value) => value === EmptyValue),
  inspector('ISNUMBER', (value) => typeof value === 'number'),
  inspector('ISTEXT', (value) => typeof value === 'string'),
  inspector('ISNONTEXT', (value) => typeof value !== 'string'),
  inspector('ISLOGICAL', (value) => typeof value === 'boolean'),
  inspector('ISERROR', (value) => value instanceof CellError),
  inspector('ISERR', (value) => value instanceof CellError && value.type !== CellErrorType.NA),
  inspector('ISNA', (value) => value instanceof CellError && value.type === CellErrorType.NA),
  parityCheck('ISEVEN'),
  parityCheck('ISODD'),
  {
    metadata: { name: 'NA', minArgs: 0, maxArgs: 0 },
    fn: () => new CellError(CellErrorType.NA),
  },
  {
    // N: numbers pass through, booleans become 1/0, text and empties 0.
    metadata: { name: 'N', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const value = args[0]!;
      if (value instanceof CellError) {
        return value;
      }
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      return 0;
    },
  },
  {
    // T: text passes through, everything else (but errors) becomes "".
    metadata: { name: 'T', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const value = args[0]!;
      if (value instanceof CellError) {
        return value;
      }
      return typeof value === 'string' ? value : '';
    },
  },
  {
    // Lazy: ISREF asks whether the argument IS a reference, not what it holds.
    metadata: { name: 'ISREF', minArgs: 1, maxArgs: 1, argHandling: 'lazy' },
    fn: (args: Ast[]) => {
      const target = args[0]!;
      return target.type === 'CELL_REFERENCE' || target.type === 'RANGE_REFERENCE';
    },
  },
  {
    // TYPE codes: 1 number (and blank), 2 text, 4 logical, 16 error, 64 array.
    metadata: { name: 'TYPE', minArgs: 1, maxArgs: 1, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const value = args[0]!;
      if (Array.isArray(value)) {
        return 64;
      }
      if (typeof value === 'string') {
        return 2;
      }
      if (typeof value === 'boolean') {
        return 4;
      }
      if (value instanceof CellError) {
        return 16;
      }
      return 1; // numbers and empty cells
    },
  },
  {
    metadata: { name: 'ERROR.TYPE', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const value = args[0]!;
      if (!(value instanceof CellError)) {
        return new CellError(CellErrorType.NA, 'ERROR.TYPE needs an error value');
      }
      return (
        ERROR_TYPE_CODES[value.type] ??
        new CellError(CellErrorType.NA, `No ERROR.TYPE code for ${value.type}`)
      );
    },
  },
  {
    // Lazy: asks whether the referenced cell HOLDS a formula, not its value.
    metadata: { name: 'ISFORMULA', minArgs: 1, maxArgs: 1, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      const address = referencedAddress(args[0]!, context.formulaAddress);
      if (!address) {
        return new CellError(CellErrorType.VALUE, 'ISFORMULA needs a reference');
      }
      return context.getCellFormula(address) !== undefined;
    },
  },
  {
    // Volatile: SHEET()/SHEET("name") have no graph edge to sheet changes.
    metadata: { name: 'SHEET', minArgs: 0, maxArgs: 1, argHandling: 'lazy', volatile: true },
    fn: (args: Ast[], context: EvaluationContext) => {
      const target = args[0];
      if (target === undefined) {
        return context.sheetPosition(context.formulaAddress.sheet)!;
      }
      const address = referencedAddress(target, context.formulaAddress);
      if (address) {
        return (
          context.sheetPosition(address.sheet) ??
          new CellError(CellErrorType.NA, 'Reference to a removed sheet')
        );
      }
      const value = asScalar(evaluateAst(target, context));
      if (value instanceof CellError) {
        return value;
      }
      if (typeof value === 'string') {
        return (
          context.sheetPositionByName(value) ??
          new CellError(CellErrorType.NA, `Unknown sheet "${value}"`)
        );
      }
      return new CellError(CellErrorType.VALUE, 'SHEET needs a reference or a sheet name');
    },
  },
  {
    // Volatile for the same reason; a reference always spans 1 sheet here (no 3D ranges).
    metadata: { name: 'SHEETS', minArgs: 0, maxArgs: 1, argHandling: 'lazy', volatile: true },
    fn: (args: Ast[], context: EvaluationContext) => {
      const target = args[0];
      if (target === undefined) {
        return context.countSheets();
      }
      return referencedAddress(target, context.formulaAddress)
        ? 1
        : new CellError(CellErrorType.REF, 'SHEETS needs a reference');
    },
  },
];
