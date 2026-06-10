/** Absolute location of a cell inside the engine. */
export interface SimpleCellAddress {
  /** Sheet index. */
  sheet: number;
  /** 0-based column (A = 0). */
  col: number;
  /** 0-based row (row "1" = 0). */
  row: number;
}

/**
 * A cell reference as written in a formula (`A1`, `$A$1`, `B$2`).
 *
 * `sheet` is omitted for same-sheet references (cross-sheet refs are phase 2).
 * The absolute flags do not affect evaluation — they matter when references
 * are adjusted on copy/move (phase 2).
 */
export interface CellReference {
  sheet?: number;
  col: number;
  row: number;
  colAbsolute: boolean;
  rowAbsolute: boolean;
}

export interface RangeReference {
  start: CellReference;
  end: CellReference;
}
