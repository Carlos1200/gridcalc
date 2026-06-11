/** Text functions: CONCAT, slicing, casing, FIND/SEARCH, SUBSTITUTE/REPLACE, REPT, TEXTJOIN... */

import { coerceToString, numberToText, parseNumericString } from '../value/coercion';
import { CellError, CellErrorType, EmptyValue, type RawInterpreterValue } from '../value/types';
import { asBoolean, asNumber, asString, forEachScalar, roundScaled, wildcardToRegExpSource } from './helpers';
import type { RegisteredFunction } from './types';

/** Excel's hard cap on the length of a text value. */
const MAX_TEXT_LENGTH = 32767;

/** FIND (case-sensitive, literal) and SEARCH (case-insensitive, wildcards). */
function finder(name: 'FIND' | 'SEARCH'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 2, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const needle = asString(args[0]!);
      if (needle instanceof CellError) {
        return needle;
      }
      const haystack = asString(args[1]!);
      if (haystack instanceof CellError) {
        return haystack;
      }
      let start = 1;
      if (args.length > 2) {
        const startNum = asNumber(args[2]!);
        if (startNum instanceof CellError) {
          return startNum;
        }
        start = Math.trunc(startNum);
      }
      if (start < 1 || start > haystack.length + 1) {
        return new CellError(CellErrorType.VALUE, `${name} start is out of range`);
      }
      let index: number;
      if (name === 'FIND') {
        index = haystack.indexOf(needle, start - 1);
      } else {
        const match = new RegExp(wildcardToRegExpSource(needle), 'is').exec(
          haystack.slice(start - 1),
        );
        index = match ? start - 1 + match.index : -1;
      }
      return index === -1
        ? new CellError(CellErrorType.VALUE, `${name} did not find "${needle}"`)
        : index + 1;
    },
  };
}

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
  finder('FIND'),
  finder('SEARCH'),
  // Capitalizes the first letter of every letter run: PROPER("2-cent's") = "2-Cent'S".
  text1('PROPER', (text) =>
    text.replace(/\p{L}+/gu, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()),
  ),
  // Removes non-printable characters (codes 0-31).
  text1('CLEAN', (text) => text.replace(/[\u0000-\u001F]/g, '')),
  text1('CODE', (text) =>
    text === ''
      ? new CellError(CellErrorType.VALUE, 'CODE needs a non-empty string')
      : text.charCodeAt(0),
  ),
  {
    metadata: { name: 'CHAR', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      const code = Math.trunc(n);
      if (code < 1 || code > 255) {
        return new CellError(CellErrorType.VALUE, 'CHAR code must be between 1 and 255');
      }
      return String.fromCharCode(code);
    },
  },
  {
    metadata: { name: 'EXACT', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const a = asString(args[0]!);
      if (a instanceof CellError) {
        return a;
      }
      const b = asString(args[1]!);
      return b instanceof CellError ? b : a === b; // case-sensitive
    },
  },
  {
    // Legacy CONCATENATE takes scalars only; CONCAT is the range-aware one.
    metadata: { name: 'CONCATENATE', minArgs: 1, maxArgs: Infinity },
    fn: (args: RawInterpreterValue[]) => {
      let out = '';
      for (const arg of args) {
        const text = asString(arg);
        if (text instanceof CellError) {
          return text;
        }
        out += text;
      }
      return out;
    },
  },
  {
    metadata: { name: 'SUBSTITUTE', minArgs: 3, maxArgs: 4 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      const oldText = asString(args[1]!);
      if (oldText instanceof CellError) {
        return oldText;
      }
      const newText = asString(args[2]!);
      if (newText instanceof CellError) {
        return newText;
      }
      let instance: number | undefined;
      if (args.length > 3) {
        const instanceNum = asNumber(args[3]!);
        if (instanceNum instanceof CellError) {
          return instanceNum;
        }
        instance = Math.trunc(instanceNum);
        if (instance < 1) {
          return new CellError(CellErrorType.VALUE, 'SUBSTITUTE instance must be >= 1');
        }
      }
      if (oldText === '') {
        return text;
      }
      if (instance === undefined) {
        return text.split(oldText).join(newText);
      }
      // Replace only the nth occurrence (case-sensitive, left to right).
      let index = -1;
      for (let found = 0; found < instance; found++) {
        index = text.indexOf(oldText, index + 1);
        if (index === -1) {
          return text;
        }
      }
      return text.slice(0, index) + newText + text.slice(index + oldText.length);
    },
  },
  {
    metadata: { name: 'REPLACE', minArgs: 4, maxArgs: 4 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      const startNum = asNumber(args[1]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const countNum = asNumber(args[2]!);
      if (countNum instanceof CellError) {
        return countNum;
      }
      const newText = asString(args[3]!);
      if (newText instanceof CellError) {
        return newText;
      }
      const start = Math.trunc(startNum);
      const count = Math.trunc(countNum);
      if (start < 1 || count < 0) {
        return new CellError(CellErrorType.VALUE, 'REPLACE start must be >= 1 and count >= 0');
      }
      return text.slice(0, start - 1) + newText + text.slice(start - 1 + count);
    },
  },
  {
    metadata: { name: 'REPT', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      const countNum = asNumber(args[1]!);
      if (countNum instanceof CellError) {
        return countNum;
      }
      const count = Math.trunc(countNum);
      if (count < 0 || text.length * count > MAX_TEXT_LENGTH) {
        return new CellError(CellErrorType.VALUE, 'REPT count is out of range');
      }
      return text.repeat(count);
    },
  },
  {
    metadata: { name: 'TEXTJOIN', minArgs: 3, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const delimiter = asString(args[0]!);
      if (delimiter instanceof CellError) {
        return delimiter;
      }
      const ignoreEmpty = asBoolean(args[1]!);
      if (ignoreEmpty instanceof CellError) {
        return ignoreEmpty;
      }
      const parts: string[] = [];
      const error = forEachScalar(args.slice(2), (value) => {
        if (value instanceof CellError) {
          return value;
        }
        const text = value === EmptyValue ? '' : coerceToString(value);
        if (text instanceof CellError) {
          return text;
        }
        if (!(ignoreEmpty && text === '')) {
          parts.push(text);
        }
        return undefined;
      });
      if (error) {
        return error;
      }
      const joined = parts.join(delimiter);
      return joined.length > MAX_TEXT_LENGTH
        ? new CellError(CellErrorType.VALUE, 'TEXTJOIN result is too long')
        : joined;
    },
  },
];
