/**
 * Information functions: ISBLANK, ISNUMBER, ISTEXT, ISERROR.
 * They inspect their argument's type without coercing, and they do NOT
 * propagate errors: =ISERROR(1/0) is TRUE, not #DIV/0!.
 */

import { CellError, EmptyValue, type RawInterpreterValue } from '../value/types';
import type { RegisteredFunction } from './types';

function inspector(name: string, test: (value: RawInterpreterValue) => boolean): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => test(args[0]!),
  };
}

export const informationFunctions: RegisteredFunction[] = [
  inspector('ISBLANK', (value) => value === EmptyValue),
  inspector('ISNUMBER', (value) => typeof value === 'number'),
  inspector('ISTEXT', (value) => typeof value === 'string'),
  inspector('ISERROR', (value) => value instanceof CellError),
];
