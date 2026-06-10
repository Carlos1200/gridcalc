import { describe, expect, it } from 'vitest';
import { CellError, Engine, parseCellReference, type SimpleCellAddress } from '../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

function display(value: unknown): unknown {
  return value instanceof CellError ? value.toString() : value;
}

describe('named expressions', () => {
  it('defines scalar names usable in formulas, case-insensitively', () => {
    const engine = Engine.buildEmpty();
    engine.addNamedExpression('IVA', 0.21);
    engine.setCellContents(addr('A1'), '=100*(1+iva)');
    expect(engine.getCellValue(addr('A1'))).toBe(121);
    expect(engine.listNamedExpressions()).toEqual(['IVA']);
  });

  it('defines formula names with sheet-qualified references', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 50);
    engine.addNamedExpression('DOBLE', '=Sheet1!$A$1*2');
    engine.setCellContents(addr('B1'), '=DOBLE+1');
    expect(engine.getCellValue(addr('B1'))).toBe(101);
  });

  it('recalculates users when the precedents of a name change', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 50);
    engine.addNamedExpression('DOBLE', '=Sheet1!$A$1*2');
    engine.setCellContents(addr('B1'), '=DOBLE');

    const changes = engine.setCellContents(addr('A1'), 10);
    expect(engine.getCellValue(addr('B1'))).toBe(20);
    expect(changes).toContainEqual({ address: addr('B1'), value: 20 });
  });

  it('redefining a name recalculates its users and reports the changes', () => {
    const engine = Engine.buildEmpty();
    engine.addNamedExpression('IVA', 0.21);
    engine.setCellContents(addr('A1'), '=100*IVA');
    const changes = engine.addNamedExpression('IVA', 0.16);
    expect(engine.getCellValue(addr('A1'))).toBe(16);
    expect(changes).toEqual([{ address: addr('A1'), value: 16 }]);
  });

  it('defining a name repairs earlier #NAME? users', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=IVA*100');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#NAME?');
    engine.addNamedExpression('IVA', 0.5);
    expect(engine.getCellValue(addr('A1'))).toBe(50);
  });

  it('removing a name turns its users back into #NAME?', () => {
    const engine = Engine.buildEmpty();
    engine.addNamedExpression('IVA', 0.21);
    engine.setCellContents(addr('A1'), '=IVA');
    engine.removeNamedExpression('iva');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#NAME?');
    expect(engine.listNamedExpressions()).toEqual([]);
    expect(() => engine.removeNamedExpression('IVA')).toThrow(/does not exist/);
  });

  it('names can reference other names, and cycles become #CIRCULAR!', () => {
    const engine = Engine.buildEmpty();
    engine.addNamedExpression('BASE', 100);
    engine.addNamedExpression('TOTAL', '=BASE*2');
    engine.setCellContents(addr('A1'), '=TOTAL');
    expect(engine.getCellValue(addr('A1'))).toBe(200);

    engine.addNamedExpression('PING', '=PONG');
    engine.addNamedExpression('PONG', '=PING');
    engine.setCellContents(addr('B1'), '=PING');
    expect(display(engine.getCellValue(addr('B1')))).toBe('#CIRCULAR!');
  });

  it('rejects invalid names and unqualified references', () => {
    const engine = Engine.buildEmpty();
    expect(() => engine.addNamedExpression('A1', 1)).toThrow(/Invalid/);
    expect(() => engine.addNamedExpression('TRUE', 1)).toThrow(/Invalid/);
    expect(() => engine.addNamedExpression('2x', 1)).toThrow(/Invalid/);
    expect(() => engine.addNamedExpression('IVA', '=A1*2')).toThrow(/sheet-qualified/);
  });

  it('a name evaluating to an error propagates it to users', () => {
    const engine = Engine.buildEmpty();
    engine.addNamedExpression('ROTO', '=1/0');
    engine.setCellContents(addr('A1'), '=ROTO+1');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#DIV/0!');
  });
});
