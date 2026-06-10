/** Math functions: SUM, ROUND family, ABS, SQRT, POWER, MOD, INT. */

import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import { asNumber, forEachNumber, roundScaled } from './helpers';
import type { RegisteredFunction } from './types';

/** One coerced numeric argument. */
function numeric1(name: string, fn: (x: number) => number | CellError): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const x = asNumber(args[0]!);
      return x instanceof CellError ? x : fn(x);
    },
  };
}

/** Two coerced numeric arguments. */
function numeric2(name: string, fn: (x: number, y: number) => number | CellError): RegisteredFunction {
  return {
    metadata: { name, minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const x = asNumber(args[0]!);
      if (x instanceof CellError) {
        return x;
      }
      const y = asNumber(args[1]!);
      return y instanceof CellError ? y : fn(x, y);
    },
  };
}

export const mathFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'SUM', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let total = 0;
      const error = forEachNumber(args, (n) => {
        total += n;
      });
      return error ?? total;
    },
  },
  numeric2('ROUND', (n, digits) => roundScaled(n, digits, 'half-away')),
  numeric2('ROUNDUP', (n, digits) => roundScaled(n, digits, 'up')),
  numeric2('ROUNDDOWN', (n, digits) => roundScaled(n, digits, 'down')),
  numeric1('ABS', Math.abs),
  numeric1('SQRT', (n) =>
    n < 0 ? new CellError(CellErrorType.NUM, 'SQRT of a negative number') : Math.sqrt(n),
  ),
  numeric2('POWER', (base, exponent) => {
    if (base === 0 && exponent === 0) {
      return new CellError(CellErrorType.NUM, '0^0 is undefined');
    }
    const result = Math.pow(base, exponent);
    return Number.isFinite(result)
      ? result
      : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric2('MOD', (n, divisor) => {
    if (divisor === 0) {
      return new CellError(CellErrorType.DIV_BY_ZERO);
    }
    // Excel: result takes the divisor's sign (MOD(-10,3)=2, MOD(10,-3)=-2).
    const result = n - divisor * Math.floor(n / divisor);
    return result === 0 ? 0 : result;
  }),
  numeric1('INT', Math.floor),
];
