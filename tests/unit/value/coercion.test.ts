import { describe, expect, it } from 'vitest';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  coerceToBoolean,
  coerceToNumber,
  coerceToString,
  parseNumericString,
} from '../../../src/index';

describe('coerceToNumber', () => {
  it('passes numbers through', () => {
    expect(coerceToNumber(5)).toBe(5);
    expect(coerceToNumber(-1.5)).toBe(-1.5);
  });

  it('coerces booleans: TRUE -> 1, FALSE -> 0', () => {
    expect(coerceToNumber(true)).toBe(1);
    expect(coerceToNumber(false)).toBe(0);
  });

  it('coerces an empty cell to 0', () => {
    expect(coerceToNumber(EmptyValue)).toBe(0);
  });

  it('coerces numeric text', () => {
    expect(coerceToNumber('5')).toBe(5);
    expect(coerceToNumber(' -3.25 ')).toBe(-3.25);
    expect(coerceToNumber('1.5E-3')).toBe(0.0015);
    expect(coerceToNumber('50%')).toBe(0.5);
  });

  it('returns #VALUE! for non-numeric text', () => {
    const result = coerceToNumber('hello');
    expect(result).toBeInstanceOf(CellError);
    expect((result as CellError).type).toBe(CellErrorType.VALUE);
  });

  it('returns #VALUE! for empty string (unlike empty cell)', () => {
    expect(coerceToNumber('')).toBeInstanceOf(CellError);
  });

  it('rejects hex notation that Number() would accept', () => {
    expect(coerceToNumber('0x10')).toBeInstanceOf(CellError);
  });

  it('propagates errors untouched', () => {
    const error = new CellError(CellErrorType.NA);
    expect(coerceToNumber(error)).toBe(error);
  });
});

describe('coerceToString', () => {
  it('coerces an empty cell to ""', () => {
    expect(coerceToString(EmptyValue)).toBe('');
  });

  it('coerces numbers and booleans', () => {
    expect(coerceToString(42)).toBe('42');
    expect(coerceToString(true)).toBe('TRUE');
    expect(coerceToString(false)).toBe('FALSE');
  });

  it('propagates errors untouched', () => {
    const error = new CellError(CellErrorType.DIV_BY_ZERO);
    expect(coerceToString(error)).toBe(error);
  });
});

describe('coerceToBoolean', () => {
  it('coerces numbers: nonzero is TRUE', () => {
    expect(coerceToBoolean(0)).toBe(false);
    expect(coerceToBoolean(2)).toBe(true);
    expect(coerceToBoolean(-1)).toBe(true);
  });

  it('coerces TRUE/FALSE text case-insensitively', () => {
    expect(coerceToBoolean('true')).toBe(true);
    expect(coerceToBoolean('FALSE')).toBe(false);
  });

  it('returns #VALUE! for other text', () => {
    expect(coerceToBoolean('yes')).toBeInstanceOf(CellError);
  });

  it('coerces an empty cell to FALSE', () => {
    expect(coerceToBoolean(EmptyValue)).toBe(false);
  });
});

describe('parseNumericString', () => {
  it('accepts integer, decimal, scientific and percent forms', () => {
    expect(parseNumericString('7')).toBe(7);
    expect(parseNumericString('.5')).toBe(0.5);
    expect(parseNumericString('3.')).toBe(3);
    expect(parseNumericString('+2e2')).toBe(200);
    expect(parseNumericString('25%')).toBe(0.25);
  });

  it('rejects non-numeric forms', () => {
    expect(parseNumericString('')).toBeUndefined();
    expect(parseNumericString('abc')).toBeUndefined();
    expect(parseNumericString('1,5')).toBeUndefined();
    expect(parseNumericString('Infinity')).toBeUndefined();
    expect(parseNumericString('1 2')).toBeUndefined();
  });
});
