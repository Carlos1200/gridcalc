/** Math functions: SUM, PRODUCT, rounding (ROUND/CEILING/TRUNC/EVEN...), logs, SUMPRODUCT... */

import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import { asMatrix, asNumber, asScalar, forEachNumber, roundScaled } from './helpers';
import type { RegisteredFunction } from './types';

/** Snap the quotient to 15 significant digits to undo binary noise before rounding. */
function cleanQuotient(n: number, significance: number): number {
  return Number((n / significance).toPrecision(15));
}

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
  {
    metadata: { name: 'PRODUCT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let product = 1;
      let sawNumber = false;
      const error = forEachNumber(args, (n) => {
        product *= n;
        sawNumber = true;
      });
      // No numbers at all -> 0, like Excel (=PRODUCT(A1:A2) over text cells).
      return error ?? (sawNumber ? product : 0);
    },
  },
  numeric2('CEILING', (n, significance) => {
    if (significance === 0) {
      return 0; // Excel quirk: CEILING(x,0) is 0, while FLOOR(x,0) is #DIV/0!
    }
    if (n > 0 && significance < 0) {
      return new CellError(CellErrorType.NUM, 'CEILING significance must match the sign of the number');
    }
    const result = Math.ceil(cleanQuotient(n, significance)) * significance;
    return result === 0 ? 0 : result;
  }),
  numeric2('FLOOR', (n, significance) => {
    if (significance === 0) {
      return n === 0 ? 0 : new CellError(CellErrorType.DIV_BY_ZERO, 'FLOOR significance cannot be 0');
    }
    if (n > 0 && significance < 0) {
      return new CellError(CellErrorType.NUM, 'FLOOR significance must match the sign of the number');
    }
    const result = Math.floor(cleanQuotient(n, significance)) * significance;
    return result === 0 ? 0 : result;
  }),
  {
    // TRUNC is ROUNDDOWN with an optional digit count (default 0).
    metadata: { name: 'TRUNC', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      let digits = 0;
      if (args.length > 1) {
        const digitsNum = asNumber(args[1]!);
        if (digitsNum instanceof CellError) {
          return digitsNum;
        }
        digits = digitsNum;
      }
      return roundScaled(n, digits, 'down');
    },
  },
  numeric1('SIGN', (n) => (n === 0 ? 0 : Math.sign(n))),
  numeric1('EXP', (n) => {
    const result = Math.exp(n);
    return Number.isFinite(result) ? result : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric1('LN', (n) =>
    n <= 0 ? new CellError(CellErrorType.NUM, 'LN needs a positive number') : Math.log(n),
  ),
  numeric1('LOG10', (n) =>
    n <= 0 ? new CellError(CellErrorType.NUM, 'LOG10 needs a positive number') : Math.log10(n),
  ),
  {
    metadata: { name: 'LOG', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      let base = 10;
      if (args.length > 1) {
        const baseNum = asNumber(args[1]!);
        if (baseNum instanceof CellError) {
          return baseNum;
        }
        base = baseNum;
      }
      if (n <= 0 || base <= 0) {
        return new CellError(CellErrorType.NUM, 'LOG needs positive arguments');
      }
      if (base === 1) {
        return new CellError(CellErrorType.DIV_BY_ZERO, 'LOG base cannot be 1');
      }
      return Math.log(n) / Math.log(base);
    },
  },
  {
    metadata: { name: 'PI', minArgs: 0, maxArgs: 0 },
    fn: () => Math.PI,
  },
  // EVEN/ODD round away from zero to the next even/odd integer.
  numeric1('EVEN', (n) => {
    const result = (n < 0 ? -1 : 1) * 2 * Math.ceil(Math.abs(n) / 2);
    return result === 0 ? 0 : result;
  }),
  numeric1('ODD', (n) => (n < 0 ? -1 : 1) * (2 * Math.ceil((Math.abs(n) - 1) / 2) + 1)),
  {
    metadata: { name: 'SUMPRODUCT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const matrices = args.map(asMatrix);
      const rows = matrices[0]!.length;
      const cols = matrices[0]![0]?.length ?? 0;
      for (const matrix of matrices) {
        if (matrix.length !== rows || (matrix[0]?.length ?? 0) !== cols) {
          return new CellError(CellErrorType.VALUE, 'SUMPRODUCT ranges must have the same shape');
        }
      }
      let total = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          let term = 1;
          for (const matrix of matrices) {
            const value = asScalar(matrix[row]![col]!);
            if (value instanceof CellError) {
              return value;
            }
            // Non-numeric entries (text, booleans, empties) count as 0.
            term *= typeof value === 'number' ? value : 0;
          }
          total += term;
        }
      }
      return total;
    },
  },
];
