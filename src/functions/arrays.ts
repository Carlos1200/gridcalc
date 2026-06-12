/** Dynamic-array functions: SEQUENCE, UNIQUE, SORT, SORTBY, FILTER (phase 3). */

import { compareScalars } from '../evaluator/interpreter';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../value/types';
import { asBoolean, asMatrix, optionalFlag, optionalNumber } from './helpers';
import type { RegisteredFunction } from './types';

type Matrix = RawInterpreterValue[][];

/** First error found anywhere in the matrix, if any. */
function firstError(matrix: Matrix): CellError | undefined {
  for (const row of matrix) {
    for (const cell of row) {
      if (cell instanceof CellError) {
        return cell;
      }
    }
  }
  return undefined;
}

/** Case-insensitive, type-strict row equality (Excel lookup semantics). */
function rowsEqual(a: RawInterpreterValue[], b: RawInterpreterValue[]): boolean {
  return a.every((cell, i) => {
    const other = b[i]!;
    if (cell instanceof CellError || other instanceof CellError) {
      return cell instanceof CellError && other instanceof CellError && cell.type === other.type;
    }
    if (typeof cell === 'string' && typeof other === 'string') {
      return cell.toLowerCase() === other.toLowerCase();
    }
    return cell === other;
  });
}

function transpose(matrix: Matrix): Matrix {
  const cols = matrix[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, c) => matrix.map((row) => row[c]!));
}

const EMPTY_RESULT = (): CellError => new CellError(CellErrorType.CALC, 'Empty array result');

export const arrayFunctions: RegisteredFunction[] = [
  {
    // SEQUENCE(rows, [cols=1], [start=1], [step=1]) fills row-major.
    metadata: { name: 'SEQUENCE', minArgs: 1, maxArgs: 4, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const rows = optionalNumber(args, 0, 1);
      if (rows instanceof CellError) {
        return rows;
      }
      const cols = optionalNumber(args, 1, 1);
      if (cols instanceof CellError) {
        return cols;
      }
      const start = optionalNumber(args, 2, 1);
      if (start instanceof CellError) {
        return start;
      }
      const step = optionalNumber(args, 3, 1);
      if (step instanceof CellError) {
        return step;
      }
      if (rows < 0 || cols < 0) {
        return new CellError(CellErrorType.VALUE, 'SEQUENCE dimensions cannot be negative');
      }
      if (rows === 0 || cols === 0) {
        return EMPTY_RESULT();
      }
      let next = start;
      const result: Matrix = [];
      for (let r = 0; r < rows; r++) {
        const row: RawInterpreterValue[] = [];
        for (let c = 0; c < cols; c++) {
          row.push(next);
          next += step;
        }
        result.push(row);
      }
      return result;
    },
  },
  {
    // UNIQUE(array, [by_col=FALSE], [exactly_once=FALSE]) keeps first-seen order.
    metadata: { name: 'UNIQUE', minArgs: 1, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const byCol = optionalFlag(args, 1);
      if (byCol instanceof CellError) {
        return byCol;
      }
      const exactlyOnce = optionalFlag(args, 2);
      if (exactlyOnce instanceof CellError) {
        return exactlyOnce;
      }
      const matrix = byCol ? transpose(asMatrix(args[0]!)) : asMatrix(args[0]!);
      const kept: { row: RawInterpreterValue[]; count: number }[] = [];
      for (const row of matrix) {
        const seen = kept.find((entry) => rowsEqual(entry.row, row));
        if (seen) {
          seen.count++;
        } else {
          kept.push({ row, count: 1 });
        }
      }
      const result = kept
        .filter((entry) => !exactlyOnce || entry.count === 1)
        .map((entry) => entry.row);
      if (result.length === 0) {
        return EMPTY_RESULT();
      }
      return byCol ? transpose(result) : result;
    },
  },
  {
    // SORT(array, [sort_index=1], [sort_order=1], [by_col=FALSE]), stable.
    metadata: { name: 'SORT', minArgs: 1, maxArgs: 4, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const sortIndex = optionalNumber(args, 1, 1);
      if (sortIndex instanceof CellError) {
        return sortIndex;
      }
      const sortOrder = optionalNumber(args, 2, 1);
      if (sortOrder instanceof CellError) {
        return sortOrder;
      }
      const byCol = optionalFlag(args, 3);
      if (byCol instanceof CellError) {
        return byCol;
      }
      if (sortOrder !== 1 && sortOrder !== -1) {
        return new CellError(CellErrorType.VALUE, 'SORT order must be 1 or -1');
      }
      const matrix = byCol ? transpose(asMatrix(args[0]!)) : asMatrix(args[0]!);
      const error = firstError(matrix);
      if (error) {
        return error;
      }
      if (sortIndex < 1 || sortIndex > (matrix[0]?.length ?? 0)) {
        return new CellError(CellErrorType.VALUE, 'SORT index is out of range');
      }
      const sorted = matrix
        .map((row, position) => ({ row, position }))
        .sort((a, b) => {
          const cmp = compareScalars(
            a.row[sortIndex - 1] as RawScalarValue,
            b.row[sortIndex - 1] as RawScalarValue,
          );
          return (sortOrder === 1 ? cmp : -cmp) || a.position - b.position;
        })
        .map((entry) => entry.row);
      return byCol ? transpose(sorted) : sorted;
    },
  },
  {
    // SORTBY(array, by_array1, [order1], [by_array2, order2]...), stable.
    metadata: { name: 'SORTBY', minArgs: 2, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const matrix = asMatrix(args[0]!);
      const keys: { values: RawScalarValue[]; order: number }[] = [];
      for (let i = 1; i < args.length; i += 2) {
        const byMatrix = asMatrix(args[i]!);
        const error = firstError(byMatrix);
        if (error) {
          return error;
        }
        const vertical = byMatrix[0]?.length === 1 && byMatrix.length === matrix.length;
        const horizontal = byMatrix.length === 1 && (byMatrix[0]?.length ?? 0) === matrix.length;
        if (!vertical && !horizontal) {
          return new CellError(CellErrorType.VALUE, 'SORTBY arrays must match the data length');
        }
        const values = vertical
          ? byMatrix.map((row) => row[0] as RawScalarValue)
          : (byMatrix[0]! as RawScalarValue[]);
        const order = optionalNumber(args, i + 1, 1);
        if (order instanceof CellError) {
          return order;
        }
        if (order !== 1 && order !== -1) {
          return new CellError(CellErrorType.VALUE, 'SORTBY order must be 1 or -1');
        }
        keys.push({ values, order });
      }
      return matrix
        .map((row, position) => ({ row, position }))
        .sort((a, b) => {
          for (const { values, order } of keys) {
            const cmp = compareScalars(values[a.position]!, values[b.position]!);
            if (cmp !== 0) {
              return order === 1 ? cmp : -cmp;
            }
          }
          return a.position - b.position;
        })
        .map((entry) => entry.row);
    },
  },
  {
    // FILTER(array, include, [if_empty]): include is a parallel vector.
    metadata: { name: 'FILTER', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const matrix = asMatrix(args[0]!);
      const include = asMatrix(args[1]!);
      const error = firstError(include);
      if (error) {
        return error;
      }
      const byRows = include[0]?.length === 1 && include.length === matrix.length;
      const byCols = include.length === 1 && (include[0]?.length ?? 0) === (matrix[0]?.length ?? 0);
      if (!byRows && !byCols) {
        return new CellError(CellErrorType.VALUE, 'FILTER include must match a dimension of the data');
      }
      const flags: (boolean | CellError)[] = byRows
        ? include.map((row) => asBoolean(row[0]!))
        : include[0]!.map((cell) => asBoolean(cell));
      for (const flag of flags) {
        if (flag instanceof CellError) {
          return flag;
        }
      }
      const result = byRows
        ? matrix.filter((_, r) => flags[r] === true)
        : matrix.map((row) => row.filter((_, c) => flags[c] === true));
      const empty = byRows ? result.length === 0 : (result[0]?.length ?? 0) === 0;
      if (empty) {
        const ifEmpty = args[2];
        return ifEmpty === undefined || ifEmpty === EmptyValue ? EMPTY_RESULT() : ifEmpty;
      }
      return result;
    },
  },
];
