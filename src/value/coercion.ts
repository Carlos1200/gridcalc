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
 * Renders a number the way Excel's General format coerces it to text:
 * at most 15 significant digits, plain decimal within [1e-4, 1e21) and
 * scientific notation outside ("1E-05", "1.5E+21", exponent >= 2 digits).
 */
export function numberToText(value: number): string {
  if (value === 0) {
    return '0'; // also normalizes -0
  }
  // Excel's General format keeps at most 15 significant digits.
  const rounded = Number(value.toPrecision(15));
  if (rounded === 0) {
    return '0';
  }
  const abs = Math.abs(rounded);
  if (abs >= 1e21 || abs < 1e-4) {
    const [mantissa, exponent] = rounded.toExponential().split('e') as [string, string];
    const expNum = Number(exponent);
    const mantissaText = String(Number(Number(mantissa).toPrecision(15)));
    return `${mantissaText}E${expNum < 0 ? '-' : '+'}${String(Math.abs(expNum)).padStart(2, '0')}`;
  }
  // JS only switches String() to exponential below 1e-6 and at 1e21, both
  // already covered by the scientific branch above.
  return String(rounded);
}
