import { describe, expect, it } from 'vitest';
import { numberToText } from '../../../src/index';

describe('numberToText (Excel General format)', () => {
  it('keeps at most 15 significant digits', () => {
    expect(numberToText(1 / 3)).toBe('0.333333333333333');
    expect(numberToText(0.1 + 0.2)).toBe('0.3');
    expect(numberToText(12345678901234567890)).toBe('12345678901234600000');
  });

  it('switches to scientific below 1e-4 and at 1e21', () => {
    expect(numberToText(0.0001)).toBe('0.0001');
    expect(numberToText(0.00009999)).toBe('9.999E-05');
    expect(numberToText(0.00001)).toBe('1E-05');
    expect(numberToText(-0.000025)).toBe('-2.5E-05');
    expect(numberToText(1e20)).toBe('100000000000000000000');
    expect(numberToText(1e21)).toBe('1E+21');
    expect(numberToText(1.5e21)).toBe('1.5E+21');
    expect(numberToText(-1e-21)).toBe('-1E-21');
  });

  it('pads the exponent to two digits', () => {
    expect(numberToText(1e-5)).toBe('1E-05');
    expect(numberToText(1e-123)).toBe('1E-123');
  });

  it('normalizes zero and negative zero', () => {
    expect(numberToText(0)).toBe('0');
    expect(numberToText(-0)).toBe('0');
  });

  it('a value that rounds across the 1e-4 boundary stays decimal', () => {
    expect(numberToText(0.00009999999999999999)).toBe('0.0001');
  });
});
