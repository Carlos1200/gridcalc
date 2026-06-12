import { describe, expect, it } from 'vitest';
import { CellErrorType, Engine, parseCellReference, type SimpleCellAddress } from '../../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

describe('ISFORMULA', () => {
  it('distinguishes formula cells from value and empty cells', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '=1+1');
      engine.setCellContents(addr('A2'), 42);
      engine.setCellContents(addr('B1'), '=ISFORMULA(A1)');
      engine.setCellContents(addr('B2'), '=ISFORMULA(A2)');
      engine.setCellContents(addr('B3'), '=ISFORMULA(A3)');
    });
    expect(engine.getCellValue(addr('B1'))).toBe(true);
    expect(engine.getCellValue(addr('B2'))).toBe(false);
    expect(engine.getCellValue(addr('B3'))).toBe(false);
  });

  it('answers for the top-left cell of a range and rejects non-references', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '=1+1');
      engine.setCellContents(addr('B1'), '=ISFORMULA(A1:A5)');
      engine.setCellContents(addr('B2'), '=ISFORMULA("A1")');
    });
    expect(engine.getCellValue(addr('B1'))).toBe(true);
    expect(engine.getCellValue(addr('B2'))).toMatchObject({ type: CellErrorType.VALUE });
  });

  it('updates when the referenced cell stops being a formula', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=1+1');
    engine.setCellContents(addr('B1'), '=ISFORMULA(A1)');
    expect(engine.getCellValue(addr('B1'))).toBe(true);
    engine.setCellContents(addr('A1'), 2); // same value, no longer a formula
    expect(engine.getCellValue(addr('B1'))).toBe(false);
  });

  it('works across sheets', () => {
    const engine = Engine.buildEmpty();
    const sheet2 = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', sheet2), '=2*2');
    engine.setCellContents(addr('A1'), '=ISFORMULA(Datos!A1)');
    expect(engine.getCellValue(addr('A1'))).toBe(true);
  });
});

describe('FORMULATEXT', () => {
  it('returns the stored formula text and #N/A for non-formulas', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '=SUM(1,2)+A2');
      engine.setCellContents(addr('A2'), 42);
      engine.setCellContents(addr('B1'), '=FORMULATEXT(A1)');
      engine.setCellContents(addr('B2'), '=FORMULATEXT(A2)');
      engine.setCellContents(addr('B3'), '=FORMULATEXT(A3)');
      engine.setCellContents(addr('B4'), '=FORMULATEXT(123)');
      engine.setCellContents(addr('B5'), '=FORMULATEXT(A1:A2)');
    });
    expect(engine.getCellValue(addr('B1'))).toBe('=SUM(1,2)+A2');
    expect(engine.getCellValue(addr('B2'))).toMatchObject({ type: CellErrorType.NA });
    expect(engine.getCellValue(addr('B3'))).toMatchObject({ type: CellErrorType.NA });
    expect(engine.getCellValue(addr('B4'))).toMatchObject({ type: CellErrorType.VALUE });
    expect(engine.getCellValue(addr('B5'))).toBe('=SUM(1,2)+A2'); // top-left
  });

  it('reports the localized spelling under es', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.setCellContents(addr('A1'), '=SUMA(1;2)');
    engine.setCellContents(addr('B1'), '=FORMULATEXTO(A1)');
    expect(engine.getCellValue(addr('B1'))).toBe('=SUMA(1;2)');
  });
});

describe('SHEET', () => {
  it('answers for the formula cell, references, and names', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), '=SHEET()');
    engine.setCellContents(addr('A2', datos), '=SHEET(A1)');
    engine.setCellContents(addr('A3', datos), '=SHEET("datos")');
    engine.setCellContents(addr('A4', datos), '=SHEET(Sheet1!B2:C3)');
    engine.setCellContents(addr('A5', datos), '=SHEET("nope")');
    engine.setCellContents(addr('A6', datos), '=SHEET(5)');
    expect(engine.getCellValue(addr('A1', datos))).toBe(2);
    expect(engine.getCellValue(addr('A2', datos))).toBe(2);
    expect(engine.getCellValue(addr('A3', datos))).toBe(2); // case-insensitive
    expect(engine.getCellValue(addr('A4', datos))).toBe(1);
    expect(engine.getCellValue(addr('A5', datos))).toMatchObject({ type: CellErrorType.NA });
    expect(engine.getCellValue(addr('A6', datos))).toMatchObject({ type: CellErrorType.VALUE });
  });

  it('reports positions among live sheets after a removal', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), '=SHEET()');
    expect(engine.getCellValue(addr('A1', datos))).toBe(2);
    engine.removeSheet(0); // Sheet1 gone; Datos keeps id 1 but becomes position 1
    expect(engine.getCellValue(addr('A1', datos))).toBe(1);
  });
});

describe('SHEETS', () => {
  it('counts sheets and sees additions/removals immediately', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=SHEETS()');
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    const extra = engine.addSheet();
    expect(engine.getCellValue(addr('A1'))).toBe(2);
    engine.removeSheet(extra);
    expect(engine.getCellValue(addr('A1'))).toBe(1);
  });

  it('a reference spans one sheet; non-references are #REF!', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=SHEETS(B1:C5)');
    engine.setCellContents(addr('A2'), '=SHEETS(7)');
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    expect(engine.getCellValue(addr('A2'))).toMatchObject({ type: CellErrorType.REF });
  });
});
