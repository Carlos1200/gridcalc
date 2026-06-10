import { describe, expect, it } from 'vitest';
import {
  colLetterToIndex,
  formatCellReference,
  indexToColLetter,
  parseCellReference,
} from '../../../src/index';

describe('colLetterToIndex / indexToColLetter', () => {
  it('converts known columns', () => {
    expect(colLetterToIndex('A')).toBe(0);
    expect(colLetterToIndex('Z')).toBe(25);
    expect(colLetterToIndex('AA')).toBe(26);
    expect(colLetterToIndex('AZ')).toBe(51);
    expect(colLetterToIndex('BA')).toBe(52);
    expect(colLetterToIndex('XFD')).toBe(16383); // Excel's last column
    expect(colLetterToIndex('a')).toBe(0); // case-insensitive
  });

  it('round-trips every column up to ZZZ', () => {
    for (let index = 0; index < 26 + 26 * 26 + 26 * 26 * 26; index++) {
      expect(colLetterToIndex(indexToColLetter(index))).toBe(index);
    }
  });
});

describe('parseCellReference', () => {
  it('parses relative and absolute references', () => {
    expect(parseCellReference('A1')).toEqual({ col: 0, row: 0, colAbsolute: false, rowAbsolute: false });
    expect(parseCellReference('$A$1')).toEqual({ col: 0, row: 0, colAbsolute: true, rowAbsolute: true });
    expect(parseCellReference('B$2')).toEqual({ col: 1, row: 1, colAbsolute: false, rowAbsolute: true });
    expect(parseCellReference('$AA10')).toEqual({ col: 26, row: 9, colAbsolute: true, rowAbsolute: false });
  });

  it('rejects non-references', () => {
    expect(parseCellReference('A0')).toBeUndefined(); // rows are 1-based
    expect(parseCellReference('A01')).toBeUndefined();
    expect(parseCellReference('AAAA1')).toBeUndefined(); // > 3 letters
    expect(parseCellReference('1A')).toBeUndefined();
    expect(parseCellReference('A1B')).toBeUndefined();
    expect(parseCellReference('SUM')).toBeUndefined();
  });
});

describe('formatCellReference', () => {
  it('round-trips parsed references', () => {
    for (const text of ['A1', '$A$1', 'B$2', '$AA10', 'XFD1048576']) {
      expect(formatCellReference(parseCellReference(text)!)).toBe(text);
    }
  });
});
