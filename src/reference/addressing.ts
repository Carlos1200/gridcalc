/** A1-notation addressing: column letters <-> 0-based indices. */

import type { CellReference, SimpleCellAddress } from './types';

/** Canonical map key for an absolute cell address: "sheet:col:row". */
export function cellAddressKey(address: SimpleCellAddress): string {
  return `${address.sheet}:${address.col}:${address.row}`;
}

/** `A` -> 0, `Z` -> 25, `AA` -> 26 (bijective base 26). */
export function colLetterToIndex(letters: string): number {
  let result = 0;
  for (const char of letters.toUpperCase()) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

/** 0 -> `A`, 25 -> `Z`, 26 -> `AA`. */
export function indexToColLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Up to 3 column letters, 1-based row without leading zeros: `$A$1`, `B12`. */
const CELL_REF_PATTERN = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)$/;

/** Parses A1-notation text into a reference. Returns undefined if not one. */
export function parseCellReference(text: string): CellReference | undefined {
  const match = CELL_REF_PATTERN.exec(text);
  if (!match) {
    return undefined;
  }
  return {
    col: colLetterToIndex(match[2]!),
    row: Number(match[4]!) - 1,
    colAbsolute: match[1] === '$',
    rowAbsolute: match[3] === '$',
  };
}

export function formatCellReference(ref: CellReference): string {
  const col = (ref.colAbsolute ? '$' : '') + indexToColLetter(ref.col);
  const row = (ref.rowAbsolute ? '$' : '') + String(ref.row + 1);
  return col + row;
}
