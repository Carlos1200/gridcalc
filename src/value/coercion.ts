/**
 * Excel-compatible type coercions.
 *
 * Excel's rules are deliberately inconsistent; this module is the single
 * source of truth for them. Key rules:
 * - Empty cell: 0 in arithmetic, "" in concatenation, FALSE in logical context.
 * - Booleans in arithmetic: TRUE -> 1, FALSE -> 0.
 * - Numeric text ("5", "1.5e3") coerces to number in arithmetic context;
 *   non-numeric text (including "") -> #VALUE!.
 * - Errors always pass through untouched.
 */

import { CellError, CellErrorType, EmptyValue, type RawScalarValue } from './types';

/**
 * Matches what Excel accepts as numeric text: optional sign, decimal,
 * scientific notation, optional trailing %. Deliberately excludes hex
 * ("0x10") and Infinity, which Number() would accept.
 */
const NUMERIC_STRING = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?%?$/;

/** Parses numeric text. Returns undefined when the text is not numeric. */
export function parseNumericString(raw: string): number | undefined {
  const text = raw.trim();
  if (!NUMERIC_STRING.test(text)) {
    return undefined;
  }
  if (text.endsWith('%')) {
    return Number(text.slice(0, -1)) / 100;
  }
  return Number(text);
}

/** Coercion for arithmetic context (e.g. operands of +, -, *, /, ^). */
export function coerceToNumber(value: RawScalarValue): number | CellError {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return 0;
  }
  switch (typeof value) {
    case 'number':
      return value;
    case 'boolean':
      return value ? 1 : 0;
    case 'string': {
      const parsed = parseNumericString(value);
      return parsed === undefined
        ? new CellError(CellErrorType.VALUE, `Cannot coerce "${value}" to a number`)
        : parsed;
    }
  }
}

/** Coercion for text context (e.g. operands of &). */
export function coerceToString(value: RawScalarValue): string | CellError {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return '';
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return numberToText(value);
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
  }
}

/** Coercion for logical context (e.g. the condition of IF). */
export function coerceToBoolean(value: RawScalarValue): boolean | CellError {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return false;
  }
  switch (typeof value) {
    case 'boolean':
      return value;
    case 'number':
      return value !== 0;
    case 'string': {
      const upper = value.trim().toUpperCase();
      if (upper === 'TRUE') return true;
      if (upper === 'FALSE') return false;
      return new CellError(CellErrorType.VALUE, `Cannot coerce "${value}" to a boolean`);
    }
  }
}

/**
 * Renders a number the way Excel displays it in General format
 * (no trailing ".0", scientific only for extremes). Good enough for v1;
 * full General-format fidelity is a golden-test target.
 */
export function numberToText(value: number): string {
  return String(value);
}
