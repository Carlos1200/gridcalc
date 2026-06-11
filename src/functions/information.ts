/**
 * Information functions: the IS* family.
 * The type inspectors (ISBLANK, ISNUMBER...) examine their argument's type
 * without coercing, and they do NOT propagate errors: =ISERROR(1/0) is TRUE,
 * not #DIV/0!. ISEVEN/ISODD are different: they coerce to number and DO
 * propagate errors, like Excel (=ISEVEN("abc") is #VALUE!).
 */

import { CellError, CellErrorType, EmptyValue, type RawInterpreterValue } from '../value/types';
import { asNumber } from './helpers';
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
];
