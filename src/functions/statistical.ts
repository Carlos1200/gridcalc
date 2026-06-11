/** Statistical functions: AVERAGE, COUNT/COUNTA/COUNTBLANK, MIN/MAX, MEDIAN/MODE/STDEV/VAR, LARGE/SMALL/RANK and the *IF(S) family. */

import { coerceToNumber } from '../value/coercion';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../value/types';
import { asMatrix, asNumber, asScalar, buildCriteriaPredicate, forEachNumber, forEachScalar } from './helpers';
import type { RegisteredFunction } from './types';

/** Numbers found in the arguments, Excel aggregation rules (see forEachNumber). */
function collectNumbers(args: RawInterpreterValue[]): number[] | CellError {
  const numbers: number[] = [];
  const error = forEachNumber(args, (n) => {
    numbers.push(n);
  });
  return error ?? numbers;
}

/** Sample variance (n-1 denominator); fewer than 2 numbers -> #DIV/0!. */
function sampleVariance(args: RawInterpreterValue[]): number | CellError {
  const numbers = collectNumbers(args);
  if (numbers instanceof CellError) {
    return numbers;
  }
  if (numbers.length < 2) {
    return new CellError(CellErrorType.DIV_BY_ZERO, 'Needs at least two numbers');
  }
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const squares = numbers.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return squares / (numbers.length - 1);
}

/** LARGE and SMALL differ only in sort direction. */
function kth(name: 'LARGE' | 'SMALL'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 2, maxArgs: 2, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const numbers = collectNumbers([args[0]!]);
      if (numbers instanceof CellError) {
        return numbers;
      }
      const kNum = asNumber(args[1]!);
      if (kNum instanceof CellError) {
        return kNum;
      }
      const k = Math.trunc(kNum);
      if (k < 1 || k > numbers.length) {
        return new CellError(CellErrorType.NUM, `${name} position is out of range`);
      }
      numbers.sort(name === 'LARGE' ? (a, b) => b - a : (a, b) => a - b);
      return numbers[k - 1]!;
    },
  };
}

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

/**
 * COUNTIFS/SUMIFS/AVERAGEIFS: visits the positions where every
 * (range, criteria) pair starting at args[firstPair] matches. All ranges must
 * share the shape of `rows` x `cols` (#VALUE! otherwise, like Excel).
 */
function forEachMultiMatch(
  args: RawInterpreterValue[],
  firstPair: number,
  rows: number,
  cols: number,
  visit: (row: number, col: number) => CellError | undefined,
): CellError | undefined {
  const predicates: {
    range: RawInterpreterValue[][];
    matches: (cell: RawScalarValue) => boolean;
  }[] = [];
  for (let i = firstPair; i + 1 < args.length; i += 2) {
    const range = asMatrix(args[i]!);
    if (range.length !== rows || (range[0]?.length ?? 0) !== cols) {
      return new CellError(CellErrorType.VALUE, 'Criteria ranges must have the same shape');
    }
    const criteria = asScalar(args[i + 1]!);
    if (criteria instanceof CellError) {
      return criteria;
    }
    predicates.push({ range, matches: buildCriteriaPredicate(criteria) });
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (predicates.every((p) => p.matches(asScalar(p.range[row]![col]!)))) {
        const error = visit(row, col);
        if (error) {
          return error;
        }
      }
    }
  }
  return undefined;
}

/** Sums and counts the numeric matched cells; shared by SUMIFS-style outputs. */
function sumMatchedCell(
  valueRange: RawInterpreterValue[][],
  row: number,
  col: number,
  acc: { total: number; count: number },
): CellError | undefined {
  const value = asScalar(valueRange[row]?.[col] ?? EmptyValue);
  if (value instanceof CellError) {
    return value;
  }
  if (typeof value === 'number') {
    acc.total += value;
    acc.count++;
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
  {
    metadata: { name: 'AVERAGEIF', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const averageRange = args[2] !== undefined ? asMatrix(args[2]) : asMatrix(args[0]!);
      const acc = { total: 0, count: 0 };
      const error = forEachMatch(args, (row, col) => sumMatchedCell(averageRange, row, col, acc));
      if (error) {
        return error;
      }
      return acc.count === 0 ? new CellError(CellErrorType.DIV_BY_ZERO) : acc.total / acc.count;
    },
  },
  {
    metadata: { name: 'COUNTIFS', minArgs: 2, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const first = asMatrix(args[0]!);
      let count = 0;
      const error = forEachMultiMatch(args, 0, first.length, first[0]?.length ?? 0, () => {
        count++;
        return undefined;
      });
      return error ?? count;
    },
  },
  {
    metadata: { name: 'SUMIFS', minArgs: 3, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const sumRange = asMatrix(args[0]!);
      const acc = { total: 0, count: 0 };
      const error = forEachMultiMatch(
        args,
        1,
        sumRange.length,
        sumRange[0]?.length ?? 0,
        (row, col) => sumMatchedCell(sumRange, row, col, acc),
      );
      return error ?? acc.total;
    },
  },
  {
    metadata: { name: 'MEDIAN', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const numbers = collectNumbers(args);
      if (numbers instanceof CellError) {
        return numbers;
      }
      if (numbers.length === 0) {
        return new CellError(CellErrorType.NUM, 'MEDIAN needs at least one number');
      }
      numbers.sort((a, b) => a - b);
      const mid = numbers.length >> 1;
      return numbers.length % 2 === 1 ? numbers[mid]! : (numbers[mid - 1]! + numbers[mid]!) / 2;
    },
  },
  {
    metadata: { name: 'MODE', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const numbers = collectNumbers(args);
      if (numbers instanceof CellError) {
        return numbers;
      }
      const counts = new Map<number, number>();
      let best: number | undefined;
      let bestCount = 1; // a value seen once is not a mode
      for (const n of numbers) {
        const count = (counts.get(n) ?? 0) + 1;
        counts.set(n, count);
        // Ties keep the earlier value, like Excel.
        if (count > bestCount) {
          best = n;
          bestCount = count;
        }
      }
      return best ?? new CellError(CellErrorType.NA, 'MODE found no repeated value');
    },
  },
  {
    metadata: { name: 'VAR', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => sampleVariance(args),
  },
  {
    metadata: { name: 'STDEV', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const variance = sampleVariance(args);
      return variance instanceof CellError ? variance : Math.sqrt(variance);
    },
  },
  kth('LARGE'),
  kth('SMALL'),
  {
    metadata: { name: 'RANK', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const value = asNumber(args[0]!);
      if (value instanceof CellError) {
        return value;
      }
      const numbers = collectNumbers([args[1]!]);
      if (numbers instanceof CellError) {
        return numbers;
      }
      let ascending = false;
      if (args.length > 2) {
        const orderNum = asNumber(args[2]!);
        if (orderNum instanceof CellError) {
          return orderNum;
        }
        ascending = orderNum !== 0;
      }
      if (!numbers.includes(value)) {
        return new CellError(CellErrorType.NA, 'RANK value is not in the list');
      }
      const beaten = numbers.filter((n) => (ascending ? n < value : n > value)).length;
      return beaten + 1;
    },
  },
  {
    metadata: { name: 'COUNTBLANK', minArgs: 1, maxArgs: 1, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let count = 0;
      forEachScalar(args, (value) => {
        // Empty cells and empty-string results both count, like Excel.
        if (value === EmptyValue || value === '') {
          count++;
        }
        return undefined;
      });
      return count;
    },
  },
  {
    metadata: { name: 'AVERAGEIFS', minArgs: 3, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const averageRange = asMatrix(args[0]!);
      const acc = { total: 0, count: 0 };
      const error = forEachMultiMatch(
        args,
        1,
        averageRange.length,
        averageRange[0]?.length ?? 0,
        (row, col) => sumMatchedCell(averageRange, row, col, acc),
      );
      if (error) {
        return error;
      }
      return acc.count === 0 ? new CellError(CellErrorType.DIV_BY_ZERO) : acc.total / acc.count;
    },
  },
];
