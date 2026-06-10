import { describe, expect, it } from 'vitest';
import { CellError, Engine, parseCellReference, type SimpleCellAddress } from '../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

function display(value: unknown): unknown {
  return value instanceof CellError ? value.toString() : value;
}

describe('sheet management', () => {
  it('starts with Sheet1 and adds sheets with stable ids', () => {
    const engine = Engine.buildEmpty();
    expect(engine.getSheetNames()).toEqual(['Sheet1']);
    expect(engine.addSheet()).toBe(1);
    expect(engine.addSheet('Datos')).toBe(2);
    expect(engine.getSheetNames()).toEqual(['Sheet1', 'Sheet2', 'Datos']);
    expect(engine.getSheetId('datos')).toBe(2); // case-insensitive
  });

  it('rejects duplicate names, case-insensitively', () => {
    const engine = Engine.buildEmpty();
    expect(() => engine.addSheet('sheet1')).toThrow(/already exists/);
  });

  it('auto-names skip taken names', () => {
    const engine = Engine.buildEmpty();
    engine.addSheet('Sheet2');
    expect(engine.getSheetNames()).toContain('Sheet2');
    engine.addSheet(); // must not collide
    expect(new Set(engine.getSheetNames()).size).toBe(3);
  });

  it('rejects writes to nonexistent sheets', () => {
    const engine = Engine.buildEmpty();
    expect(() => engine.setCellContents(addr('A1', 7), 1)).toThrow(/does not exist/);
  });
});

describe('cross-sheet references', () => {
  it('evaluates references and ranges on other sheets', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.batch(() => {
      engine.setCellContents(addr('A1', datos), 10);
      engine.setCellContents(addr('A2', datos), 20);
      engine.setCellContents(addr('A3', datos), 12);
      engine.setCellContents(addr('B1'), '=Datos!A1+1');
      engine.setCellContents(addr('B2'), '=SUM(Datos!A1:A3)');
    });
    expect(engine.getCellValue(addr('B1'))).toBe(11);
    expect(engine.getCellValue(addr('B2'))).toBe(42);
  });

  it('supports quoted sheet names with spaces and escaped quotes', () => {
    const engine = Engine.buildEmpty();
    const hoja = engine.addSheet('Mi Hoja');
    const rara = engine.addSheet("It's");
    engine.setCellContents(addr('A1', hoja), 5);
    engine.setCellContents(addr('A1', rara), 7);
    engine.setCellContents(addr('B1'), "='Mi Hoja'!A1*2");
    engine.setCellContents(addr('B2'), "='It''s'!A1*2");
    expect(engine.getCellValue(addr('B1'))).toBe(10);
    expect(engine.getCellValue(addr('B2'))).toBe(14);
  });

  it('recalculates across sheets incrementally', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), 1);
    engine.setCellContents(addr('B1'), '=Datos!A1*10');

    const changes = engine.setCellContents(addr('A1', datos), 5);
    expect(changes).toContainEqual({ address: addr('B1'), value: 50 });
  });

  it('detects cycles that span sheets', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1'), '=Datos!A1');
    engine.setCellContents(addr('A1', datos), '=Sheet1!A1');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#CIRCULAR!');
    expect(display(engine.getCellValue(addr('A1', datos)))).toBe('#CIRCULAR!');
  });

  it('an unknown sheet name resolves to #REF! and stays #REF!', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=Nada!B2+1');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#REF!');
    engine.addSheet('Nada'); // too late, like Excel: the formula must be re-entered
    expect(display(engine.getCellValue(addr('A1')))).toBe('#REF!');
  });
});

describe('removeSheet', () => {
  it('turns references into #REF! and reports the changes', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), 10);
    engine.setCellContents(addr('B1'), '=Datos!A1+1');
    expect(engine.getCellValue(addr('B1'))).toBe(11);

    const changes = engine.removeSheet(datos);
    expect(display(engine.getCellValue(addr('B1')))).toBe('#REF!');
    expect(changes.map((c) => display(c.value))).toContain('#REF!');
    expect(engine.getSheetNames()).toEqual(['Sheet1']);
  });

  it('does not shift the ids of other sheets', () => {
    const engine = Engine.buildEmpty();
    const a = engine.addSheet('A');
    const b = engine.addSheet('B');
    engine.setCellContents(addr('A1', b), 42);
    engine.setCellContents(addr('B1'), '=B!A1');
    engine.removeSheet(a);
    expect(engine.getCellValue(addr('B1'))).toBe(42);
    expect(engine.getSheetId('B')).toBe(b);
  });

  it('adding a sheet with the removed name does not resurrect old references', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), 10);
    engine.setCellContents(addr('B1'), '=Datos!A1');
    engine.removeSheet(datos);
    const again = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', again), 99);
    // The old formula still points at the dead sheet id.
    expect(display(engine.getCellValue(addr('B1')))).toBe('#REF!');
    // A re-entered formula resolves to the new sheet.
    engine.setCellContents(addr('B2'), '=Datos!A1');
    expect(engine.getCellValue(addr('B2'))).toBe(99);
  });
});
