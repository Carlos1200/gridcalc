import { describe, expect, it } from 'vitest';
import { CellErrorType, Engine, parseCellReference, parseFormula, serializeAst, type SimpleCellAddress } from '../../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

function build(): Engine {
  const engine = Engine.buildEmpty();
  engine.batch(() => {
    for (const [ref, value] of [['A1', 1], ['B1', 2], ['A2', 3], ['B2', 4], ['B3', 5], ['C3', 6]] as const) {
      engine.setCellContents(addr(ref), value);
    }
  });
  return engine;
}

describe('intersection operator (space)', () => {
  it('parses and round-trips', () => {
    expect(parseFormula('=A1:B3 B2:C4')).toMatchObject({ type: 'BINARY_OP', op: ' ' });
    expect(serializeAst(parseFormula('=SUM(A1:B3 B2:C4)'))).toBe('SUM(A1:B3 B2:C4)');
  });

  it('only joins two references; anything else stays a parse error', () => {
    expect(parseFormula('=1 2')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('=5 A1')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('=A1 2')).toMatchObject({ type: 'PARSE_ERROR' });
  });

  it('evaluates the overlapping rectangle', () => {
    const engine = build();
    engine.setCellContents(addr('E1'), '=SUM(A1:B3 B2:C4)'); // overlap B2:B3
    expect(engine.getCellValue(addr('E1'))).toBe(9);
  });

  it('a 1x1 intersection is the cell value', () => {
    const engine = build();
    engine.setCellContents(addr('E1'), '=A1:B2 B2:C3');
    expect(engine.getCellValue(addr('E1'))).toBe(4);
  });

  it('chains left-associatively', () => {
    const engine = build();
    engine.setCellContents(addr('E1'), '=A1:C3 B1:B9 B2:B2');
    expect(engine.getCellValue(addr('E1'))).toBe(4);
  });

  it('disjoint or cross-sheet ranges are #NULL!', () => {
    const engine = build();
    engine.addSheet('Otra');
    engine.setCellContents(addr('E1'), '=A1:A2 B1:B2');
    engine.setCellContents(addr('E2'), '=SUM(A1:B2 Otra!A1:B2)');
    expect(engine.getCellValue(addr('E1'))).toMatchObject({ type: CellErrorType.NULL });
    expect(engine.getCellValue(addr('E2'))).toMatchObject({ type: CellErrorType.NULL });
  });

  it('recalculates when a cell inside the intersection changes', () => {
    const engine = build();
    engine.setCellContents(addr('E1'), '=SUM(A1:B3 B2:C4)');
    engine.setCellContents(addr('B2'), 40);
    expect(engine.getCellValue(addr('E1'))).toBe(45);
  });
});

describe('registry-driven volatility', () => {
  it('re-evaluates functions registered with the volatile flag on every edit', () => {
    const engine = Engine.buildEmpty();
    let calls = 0;
    engine.functions.register({
      metadata: { name: 'TICK', minArgs: 0, maxArgs: 0, volatile: true },
      fn: () => ++calls,
    });
    engine.setCellContents(addr('A1'), '=TICK()');
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    engine.setCellContents(addr('Z9'), 'unrelated');
    expect(engine.getCellValue(addr('A1'))).toBe(2);
  });
});
