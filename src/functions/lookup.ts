/** Lookup functions: VLOOKUP, HLOOKUP, INDEX, MATCH. */

import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../value/types';
import { asBoolean, asMatrix, asNumber, asScalar } from './helpers';
import type { RegisteredFunction } from './types';

/** Exact lookup equality: type-strict, text case-insensitive. */
function lookupEquals(cell: RawScalarValue, needle: RawScalarValue): boolean {
  if (typeof cell === 'string' && typeof needle === 'string') {
    return cell.toLowerCase() === needle.toLowerCase();
  }
  return cell === needle;
}

/** Same-type ordering for approximate lookups; undefined = not comparable. */
function lookupCompare(cell: RawScalarValue, needle: RawScalarValue): number | undefined {
  if (typeof cell === 'number' && typeof needle === 'number') {
    return cell - needle;
  }
  if (typeof cell === 'string' && typeof needle === 'string') {
    const a = cell.toLowerCase();
    const b = needle.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof cell === 'boolean' && typeof needle === 'boolean') {
    return Number(cell) - Number(needle);
  }
  return undefined;
}

/** Index (0-based) of the match in the lookup vector, or undefined. */
function findInVector(
  vector: RawScalarValue[],
  needle: RawScalarValue,
  approximate: boolean,
): number | undefined {
  if (!approximate) {
    for (let i = 0; i < vector.length; i++) {
      if (lookupEquals(vector[i]!, needle)) {
        return i;
      }
    }
    return undefined;
  }
  // Assumes ascending order, like Excel: last entry <= needle.
  let best: number | undefined;
  for (let i = 0; i < vector.length; i++) {
    const cmp = lookupCompare(vector[i]!, needle);
    if (cmp !== undefined && cmp <= 0) {
      best = i;
    }
  }
  return best;
}

/** A looked-up empty cell surfaces as 0, like in Excel. */
function materializeCell(value: RawInterpreterValue | undefined): RawInterpreterValue {
  const scalar = asScalar(value ?? EmptyValue);
  return scalar === EmptyValue ? 0 : scalar;
}

/** VLOOKUP and HLOOKUP differ only in orientation. */
function vhLookup(name: 'VLOOKUP' | 'HLOOKUP'): RegisteredFunction {
  const vertical = name === 'VLOOKUP';
  return {
    metadata: { name, minArgs: 3, maxArgs: 4, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const needle = asScalar(args[0]!);
      if (needle instanceof CellError) {
        return needle;
      }
      const table = asMatrix(args[1]!);
      const indexNum = asNumber(args[2]!);
      if (indexNum instanceof CellError) {
        return indexNum;
      }
      const index = Math.trunc(indexNum);
      if (index < 1) {
        return new CellError(CellErrorType.VALUE, `${name} index must be >= 1`);
      }
      const depth = vertical ? (table[0]?.length ?? 0) : table.length;
      if (index > depth) {
        return new CellError(CellErrorType.REF, `${name} index ${index} is outside the table`);
      }
      let approximate = true;
      if (args.length > 3) {
        const flag = asBoolean(args[3]!);
        if (flag instanceof CellError) {
          return flag;
        }
        approximate = flag;
      }
      const vector = vertical
        ? table.map((row) => asScalar(row[0] ?? EmptyValue))
        : (table[0] ?? []).map((cell) => asScalar(cell));
      const found = findInVector(vector, needle, approximate);
      if (found === undefined) {
        return new CellError(CellErrorType.NA, `${name} found no match`);
      }
      return materializeCell(vertical ? table[found]![index - 1] : table[index - 1]?.[found]);
    },
  };
}

export const lookupFunctions: RegisteredFunction[] = [
  vhLookup('VLOOKUP'),
  vhLookup('HLOOKUP'),
  {
    metadata: { name: 'INDEX', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const matrix = asMatrix(args[0]!);
      const rowNum = asNumber(args[1]!);
      if (rowNum instanceof CellError) {
        return rowNum;
      }
      let row = Math.trunc(rowNum);
      let col: number;
      if (args.length > 2) {
        const colNum = asNumber(args[2]!);
        if (colNum instanceof CellError) {
          return colNum;
        }
        col = Math.trunc(colNum);
      } else if (matrix.length === 1) {
        // Vector form over a single row: the position walks the columns.
        col = row;
        row = 1;
      } else {
        col = 1;
      }
      if (row < 1 || col < 1) {
        return new CellError(CellErrorType.VALUE, 'INDEX position must be >= 1');
      }
      if (row > matrix.length || col > (matrix[0]?.length ?? 0)) {
        return new CellError(CellErrorType.REF, 'INDEX position is outside the range');
      }
      return materializeCell(matrix[row - 1]![col - 1]);
    },
  },
  {
    metadata: { name: 'MATCH', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const needle = asScalar(args[0]!);
      if (needle instanceof CellError) {
        return needle;
      }
      const matrix = asMatrix(args[1]!);
      let matchType = 1;
      if (args.length > 2) {
        const typeNum = asNumber(args[2]!);
        if (typeNum instanceof CellError) {
          return typeNum;
        }
        matchType = Math.sign(Math.trunc(typeNum));
      }
      let vector: RawScalarValue[];
      if (matrix.length === 1) {
        vector = matrix[0]!.map((cell) => asScalar(cell));
      } else if ((matrix[0]?.length ?? 0) === 1) {
        vector = matrix.map((row) => asScalar(row[0] ?? EmptyValue));
      } else {
        return new CellError(CellErrorType.NA, 'MATCH needs a one-dimensional range');
      }
      let found: number | undefined;
      if (matchType === 0) {
        found = findInVector(vector, needle, false);
      } else if (matchType > 0) {
        found = findInVector(vector, needle, true);
      } else {
        // Descending order: last entry >= needle.
        for (let i = 0; i < vector.length; i++) {
          const cmp = lookupCompare(vector[i]!, needle);
          if (cmp !== undefined && cmp >= 0) {
            found = i;
          } else if (cmp !== undefined) {
            break;
          }
        }
      }
      return found === undefined
        ? new CellError(CellErrorType.NA, 'MATCH found no match')
        : found + 1;
    },
  },
];
