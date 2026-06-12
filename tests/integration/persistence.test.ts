import { describe, expect, it } from 'vitest';
import { CellError, CellErrorType, Engine, parseCellReference, type SimpleCellAddress } from '../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

describe('toJSON / fromJSON', () => {
  it('round-trips values, formulas, names, sheets and config', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    const datos = engine.addSheet('Datos');
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 10);
      engine.setCellContents(addr('A2'), 'texto');
      engine.setCellContents(addr('A3'), true);
      engine.setCellContents(addr('A4'), new CellError(CellErrorType.NA));
      engine.setCellContents(addr('B1'), '=SUMA(A1;5)*IVA');
      engine.setCellContents(addr('A1', datos), '=Sheet1!A1*2');
    });
    engine.addNamedExpression('IVA', 1.21);

    const restored = Engine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    expect(restored.getCellValue(addr('A1'))).toBe(10);
    expect(restored.getCellValue(addr('A2'))).toBe('texto');
    expect(restored.getCellValue(addr('A3'))).toBe(true);
    expect(restored.getCellValue(addr('A4'))).toMatchObject({ type: CellErrorType.NA });
    expect(restored.getCellValue(addr('B1'))).toBeCloseTo(18.15, 12);
    expect(restored.getCellFormula(addr('B1'))).toBe('=SUMA(A1;5)*IVA');
    expect(restored.getCellValue(addr('A1', datos))).toBe(20);
    expect(restored.getSheetNames()).toEqual(['Sheet1', 'Datos']);
    expect(restored.listNamedExpressions()).toEqual(['IVA']);
    expect(restored.config.locale).toBe('es');
  });

  it('preserves stable sheet ids across removed-sheet holes', () => {
    const engine = Engine.buildEmpty();
    const second = engine.addSheet('Temp');
    const third = engine.addSheet('Keep');
    engine.setCellContents(addr('A1', third), 42);
    engine.removeSheet(second);

    const restored = Engine.fromJSON(engine.toJSON());
    expect(restored.getSheetNames()).toEqual(['Sheet1', 'Keep']);
    expect(restored.getSheetId('Keep')).toBe(third); // hole keeps ids stable
    expect(restored.getCellValue(addr('A1', third))).toBe(42);
  });

  it('recomputes spills instead of serializing shadows', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=SEQUENCE(3)');
    const state = engine.toJSON();
    expect(state.cells).toHaveLength(1); // only the anchor travels
    const restored = Engine.fromJSON(state);
    expect(restored.getCellValue(addr('A3'))).toBe(3);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes a cell edit, recalculating dependents', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 1);
    engine.setCellContents(addr('B1'), '=A1*10');
    engine.setCellContents(addr('A1'), 2);
    expect(engine.getCellValue(addr('B1'))).toBe(20);

    const undone = engine.undo();
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    expect(engine.getCellValue(addr('B1'))).toBe(10);
    expect(undone.some((c) => c.value === 10)).toBe(true);

    engine.redo();
    expect(engine.getCellValue(addr('A1'))).toBe(2);
    expect(engine.getCellValue(addr('B1'))).toBe(20);
  });

  it('treats a batch as a single undo step', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('A2'), 2);
    });
    engine.undo();
    expect(engine.getCellValue(addr('A1'))).toBeNull();
    expect(engine.getCellValue(addr('A2'))).toBeNull();
    engine.redo();
    expect(engine.getCellValue(addr('A2'))).toBe(2);
  });

  it('restores formulas (not stale values) and spills on undo', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2,3}');
    engine.setCellContents(addr('A1'), 'plain');
    expect(engine.getCellValue(addr('B1'))).toBeNull();

    engine.undo();
    expect(engine.getCellFormula(addr('A1'))).toBe('={1,2,3}');
    expect(engine.getCellValue(addr('C1'))).toBe(3); // re-spilled
  });

  it('undoes removeSheet, restoring cells and external readers', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A1', datos), 7);
    engine.setCellContents(addr('A1'), '=Datos!A1+1');
    engine.removeSheet(datos);
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.REF });

    engine.undo();
    expect(engine.getSheetNames()).toEqual(['Sheet1', 'Datos']);
    expect(engine.getCellValue(addr('A1'))).toBe(8);

    engine.redo();
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.REF });
  });

  it('undoes addSheet and named expression changes', () => {
    const engine = Engine.buildEmpty();
    engine.addSheet('Extra');
    engine.undo();
    expect(engine.getSheetNames()).toEqual(['Sheet1']);

    engine.setCellContents(addr('A1'), '=IVA*100');
    engine.addNamedExpression('IVA', 0.21);
    expect(engine.getCellValue(addr('A1'))).toBe(21);
    engine.undo();
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.NAME });
    engine.redo();
    expect(engine.getCellValue(addr('A1'))).toBe(21);
  });

  it('a new edit clears the redo stack', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 1);
    engine.setCellContents(addr('A1'), 2);
    engine.undo();
    expect(engine.canRedo()).toBe(true);
    engine.setCellContents(addr('A1'), 99);
    expect(engine.canRedo()).toBe(false);
    expect(engine.canUndo()).toBe(true);
  });

  it('reading APIs do not pollute the history', () => {
    const engine = Engine.buildEmpty();
    expect(engine.canUndo()).toBe(false);
    engine.getCellValue(addr('A1'));
    engine.toJSON();
    expect(engine.canUndo()).toBe(false);
  });
});
