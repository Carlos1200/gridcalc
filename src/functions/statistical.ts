/** Statistical functions: AVERAGE, COUNT, COUNTA, MIN, MAX, SUMIF, COUNTIF. */

import { coerceToNumber } from '../value/coercion';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
} from '../value/types';
import { asMatrix, asScalar, buildCriteriaPredicate, forEachNumber, forEachScalar } from './helpers';
import type { RegisteredFunction } from './types';

function minMax(name: 'MIN' | 'MAX'): RegisteredFunction {
  const better = name === 'MIN' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  return {
    metadata: { name, minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let best: number | undefined;
      const error = forEachNumber(args, (n) => {
        if (best === undefined || better(n, best)) {
          best = n;
        }
      });
      return error ?? best ?? 0; // no numbers at all -> 0, like Excel
    },
  };
}

/** SUMIF/COUNTIF share the matching loop over the criteria range. */
function forEachMatch(
  args: RawInterpreterValue[],
  visit: (row: number, col: number) => CellError | undefined,
): CellError | undefined {
  const range = asMatrix(args[0]!);
  const criteria = asScalar(args[1]!);
  if (criteria instanceof CellError) {
    return criteria;
  }
  const matches = buildCriteriaPredicate(criteria);
  for (let row = 0; row < range.length; row++) {
    const cells = range[row]!;
    for (let col = 0; col < cells.length; col++) {
      if (matches(asScalar(cells[col]!))) {
        const error = visit(row, col);
        if (error) {
          return error;
        }
      }
    }
  }
  return undefined;
}

export const statisticalFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'AVERAGE', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let total = 0;
      let count = 0;
      const error = forEachNumber(args, (n) => {
        total += n;
        count++;
      });
      if (error) {
        return error;
      }
      return count === 0 ? new CellError(CellErrorType.DIV_BY_ZERO) : total / count;
    },
  },
  {
    metadata: { name: 'COUNT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let count = 0;
      forEachScalar(args, (value, fromRange) => {
        if (fromRange) {
          // Inside ranges only real numbers count.
          if (typeof value === 'number') {
            count++;
          }
        } else if (
          value !== EmptyValue &&
          !(value instanceof CellError) &&
          !(coerceToNumber(value) instanceof CellError)
        ) {
          // Direct arguments also count coercible text and booleans;
          // non-numeric values and errors are ignored, never propagated.
          count++;
        }
        return undefined;
      });
      return count;
    },
  },
  {
    metadata: { name: 'COUNTA', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let count = 0;
      forEachScalar(args, (value) => {
        if (value !== EmptyValue) {
          count++; // text, booleans, "" and even errors all count
        }
        return undefined;
      });
      return count;
    },
  },
  minMax('MIN'),
  minMax('MAX'),
  {
    metadata: { name: 'SUMIF', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const sumRange = args[2] !== undefined ? asMatrix(args[2]) : asMatrix(args[0]!);
      let total = 0;
      const error = forEachMatch(args, (row, col) => {
        const value = asScalar(sumRange[row]?.[col] ?? EmptyValue);
        if (value instanceof CellError) {
          return value;
        }
        if (typeof value === 'number') {
          total += value;
        }
        return undefined;
      });
      return error ?? total;
    },
  },
  {
    metadata: { name: 'COUNTIF', minArgs: 2, maxArgs: 2, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let count = 0;
      const error = forEachMatch(args, () => {
        count++;
        return undefined;
      });
      return error ?? count;
    },
  },
];
