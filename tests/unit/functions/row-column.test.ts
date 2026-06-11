import { describe, expect, it } from 'vitest';
import { Engine, parseCellReference, type SimpleCellAddress } from '../../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

/**
 * ROW()/COLUMN() with no argument answer for the formula's own cell, so they
 * cannot be golden-tested (the LibreOffice generator places formulas at a
 * different address than the test harness does).
 */
describe('ROW/COLUMN without an argument', () => {
  it('reports the position of the cell holding the formula', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('C7'), '=ROW()');
    engine.setCellContents(addr('C8'), '=COLUMN()');
    expect(engine.getCellValue(addr('C7'))).toBe(7);
    expect(engine.getCellValue(addr('C8'))).toBe(3);
  });

  it('keeps answering for the new cell after copyCell', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=ROW()+COLUMN()');
    engine.copyCell(addr('A1'), addr('B5'));
    expect(engine.getCellValue(addr('A1'))).toBe(2);
    expect(engine.getCellValue(addr('B5'))).toBe(7);
  });
});
