/** Text functions: CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TEXT, VALUE. */

import { coerceToString, numberToText, parseNumericString } from '../value/coercion';
import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import { asNumber, asString, forEachScalar, roundScaled } from './helpers';
import type { RegisteredFunction } from './types';

/** One coerced text argument. */
function text1(name: string, fn: (text: string) => string | number | CellError): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      return text instanceof CellError ? text : fn(text);
    },
  };
}

/** LEFT and RIGHT differ only in which end they slice. */
function leftRight(name: 'LEFT' | 'RIGHT'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      let count = 1;
      if (args.length > 1) {
        const n = asNumber(args[1]!);
        if (n instanceof CellError) {
          return n;
        }
        count = Math.trunc(n);
      }
      if (count < 0) {
        return new CellError(CellErrorType.VALUE, `${name} count cannot be negative`);
      }
      if (count === 0) {
        return '';
      }
      return name === 'LEFT' ? text.slice(0, count) : text.slice(-count);
    },
  };
}

/**
 * TEXT format support (phase 1 subset): General, "0"-style fixed decimals,
 * "#,##0"-style thousands separators, and trailing percents. Full Excel
 * format codes (dates, colors, sections) are a later phase.
 */
function formatNumber(value: number, format: string): string | CellError {
  if (format === 'General') {
    return numberToText(value);
  }
  let n = value;
  let suffix = '';
  let fmt = format;
  while (fmt.endsWith('%')) {
    n *= 100;
    suffix += '%';
    fmt = fmt.slice(0, -1);
  }
  const thousands = fmt.startsWith('#,##');
  if (thousands) {
    fmt = fmt.slice('#,##'.length);
  }
  const match = /^0(?:\.(0+))?$/.exec(fmt);
  if (!match) {
    return new CellError(
      CellErrorType.VALUE,
      `Unsupported TEXT format "${format}" (phase 1 supports a numeric subset)`,
    );
  }
  const decimals = match[1]?.length ?? 0;
  const rounded = roundScaled(n, decimals, 'half-away');
  let out = Math.abs(rounded).toFixed(decimals);
  if (thousands) {
    const [integer, fraction] = out.split('.');
    out = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
  }
  return (rounded < 0 ? '-' : '') + out + suffix;
}

export const textFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'CONCAT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let out = '';
      const error = forEachScalar(args, (value) => {
        if (value instanceof CellError) {
          return value;
        }
        const text = coerceToString(value);
        if (text instanceof CellError) {
          return text;
        }
        out += text;
        return undefined;
      });
      return error ?? out;
    },
  },
  leftRight('LEFT'),
  leftRight('RIGHT'),
  {
    metadata: { name: 'MID', minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      const startNum = asNumber(args[1]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const lengthNum = asNumber(args[2]!);
      if (lengthNum instanceof CellError) {
        return lengthNum;
      }
      const start = Math.trunc(startNum);
      const length = Math.trunc(lengthNum);
      if (start < 1 || length < 0) {
        return new CellError(CellErrorType.VALUE, 'MID start must be >= 1 and length >= 0');
      }
      return text.slice(start - 1, start - 1 + length);
    },
  },
  text1('LEN', (text) => text.length),
  text1('UPPER', (text) => text.toUpperCase()),
  text1('LOWER', (text) => text.toLowerCase()),
  // Excel TRIM also collapses internal runs of spaces (only U+0020).
  text1('TRIM', (text) => text.split(' ').filter(Boolean).join(' ')),
  text1('VALUE', (text) => {
    const parsed = parseNumericString(text);
    return parsed === undefined
      ? new CellError(CellErrorType.VALUE, `Cannot convert "${text}" to a number`)
      : parsed;
  }),
  {
    metadata: { name: 'TEXT', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const value = asNumber(args[0]!);
      if (value instanceof CellError) {
        return value;
      }
      const format = asString(args[1]!);
      if (format instanceof CellError) {
        return format;
      }
      return formatNumber(value, format);
    },
  },
];
