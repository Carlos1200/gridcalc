/** Shared utilities for implementing spreadsheet functions. */

import { coerceToBoolean, coerceToNumber, coerceToString, parseNumericString } from '../value/coercion';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../value/types';

/** A range where a single value is required -> #VALUE! (phase 1: no implicit intersection). */
export function asScalar(value: RawInterpreterValue): RawScalarValue {
  return Array.isArray(value)
    ? new CellError(CellErrorType.VALUE, 'Expected a single value, got a range')
    : value;
}

export function asNumber(value: RawInterpreterValue): number | CellError {
  return coerceToNumber(asScalar(value));
}

export function asString(value: RawInterpreterValue): string | CellError {
  return coerceToString(asScalar(value));
}

export function asBoolean(value: RawInterpreterValue): boolean | CellError {
  return coerceToBoolean(asScalar(value));
}

/** A scalar argument becomes a 1x1 matrix (=SUMIF(A1,...) passes a scalar). */
export function asMatrix(value: RawInterpreterValue): RawInterpreterValue[][] {
  return Array.isArray(value) ? value : [[value]];
}

/**
 * Iterates the numbers in aggregation arguments the way Excel does:
 * - direct scalar arguments are coerced ("5" -> 5, TRUE -> 1, junk -> #VALUE!);
 * - inside ranges only real numbers count (text/booleans/empties skipped);
 * - errors anywhere stop the iteration and are returned.
 */
export function forEachNumber(
  args: RawInterpreterValue[],
  visit: (value: number) => void,
): CellError | undefined {
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const row of arg) {
        for (const cell of row) {
          if (cell instanceof CellError) {
            return cell;
          }
          if (typeof cell === 'number') {
            visit(cell);
          }
        }
      }
    } else if (arg !== EmptyValue) {
      const n = coerceToNumber(arg);
      if (n instanceof CellError) {
        return n;
      }
      visit(n);
    }
  }
  return undefined;
}

/**
 * Iterates every scalar in the arguments (ranges row-major). The visitor may
 * return a CellError to abort; errors in cells are NOT propagated here, each
 * function decides (CONCAT propagates, COUNTA counts them).
 */
export function forEachScalar(
  args: RawInterpreterValue[],
  visit: (value: RawScalarValue, fromRange: boolean) => CellError | undefined,
): CellError | undefined {
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const row of arg) {
        for (const cell of row) {
          const error = visit(asScalar(cell), true);
          if (error) {
            return error;
          }
        }
      }
    } else {
      const error = visit(arg, false);
      if (error) {
        return error;
      }
    }
  }
  return undefined;
}

/** Case-insensitive Excel wildcard match: * = any run, ? = any char, ~ escapes. */
export function wildcardMatch(pattern: string, text: string): boolean {
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === '~' && i + 1 < pattern.length) {
      regex += escapeRegExp(pattern[++i]!);
    } else if (char === '*') {
      regex += '.*';
    } else if (char === '?') {
      regex += '.';
    } else {
      regex += escapeRegExp(char);
    }
  }
  return new RegExp(`^${regex}$`, 'is').test(text);
}

function escapeRegExp(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type CriteriaOp = '=' | '<>' | '<' | '>' | '<=' | '>=';

/**
 * Builds the cell predicate for SUMIF/COUNTIF criteria. Matching is
 * type-strict: ">2" only matches numbers, "b*" only text, TRUE only booleans.
 */
export function buildCriteriaPredicate(
  criteria: RawScalarValue,
): (cell: RawScalarValue) => boolean {
  if (typeof criteria === 'string') {
    const match = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criteria)!;
    const op = (match[1] ?? '=') as CriteriaOp;
    const operand = match[2]!;
    const numeric = parseNumericString(operand);
    if (numeric !== undefined) {
      return numberPredicate(op, numeric);
    }
    return textPredicate(op, operand);
  }
  if (typeof criteria === 'number') {
    return numberPredicate('=', criteria);
  }
  if (typeof criteria === 'boolean') {
    return (cell) => cell === criteria;
  }
  // Empty criteria matches empty cells; error criteria is handled by callers.
  return (cell) => cell === EmptyValue;
}

function numberPredicate(op: CriteriaOp, target: number): (cell: RawScalarValue) => boolean {
  return (cell) => typeof cell === 'number' && applyOp(op, cell - target);
}

function textPredicate(op: CriteriaOp, target: string): (cell: RawScalarValue) => boolean {
  if (op === '=' || op === '<>') {
    return (cell) =>
      typeof cell === 'string' && wildcardMatch(target, cell) === (op === '=');
  }
  const lowered = target.toLowerCase();
  return (cell) => {
    if (typeof cell !== 'string') {
      return false;
    }
    const a = cell.toLowerCase();
    return applyOp(op, a < lowered ? -1 : a > lowered ? 1 : 0);
  };
}

function applyOp(op: CriteriaOp, cmp: number): boolean {
  switch (op) {
    case '=':
      return cmp === 0;
    case '<>':
      return cmp !== 0;
    case '<':
      return cmp < 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '>=':
      return cmp >= 0;
  }
}

/**
 * Excel's ROUND family rounds the decimal value, so snap the scaled number to
 * 15 significant digits first to undo binary noise (2.675*100 -> 267.5, not
 * 267.49999...). Used by ROUND/ROUNDUP/ROUNDDOWN and TEXT.
 */
export function roundScaled(
  n: number,
  digits: number,
  mode: 'half-away' | 'up' | 'down',
): number {
  const factor = Math.pow(10, Math.trunc(digits));
  const scaled = Number((Math.abs(n) * factor).toPrecision(15));
  const rounded =
    mode === 'half-away' ? Math.round(scaled) : mode === 'up' ? Math.ceil(scaled) : Math.floor(scaled);
  const result = (n < 0 ? -rounded : rounded) / factor;
  return result === 0 ? 0 : result; // no negative zero
}
