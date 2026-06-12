import { describe, expect, it } from 'vitest';
import { CellErrorType, Engine, parseCellReference, type SimpleCellAddress } from '../../../src/index';

function addr(text: string): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet: 0, col: parsed.col, row: parsed.row };
}

/** Evaluates one formula in a fresh engine (inputs as plain values). */
function run(formula: string, inputs: Record<string, number | string> = {}): unknown {
  const engine = Engine.buildEmpty();
  engine.batch(() => {
    for (const [ref, value] of Object.entries(inputs)) {
      engine.setCellContents(addr(ref), value);
    }
    engine.setCellContents(addr('Z100'), formula);
  });
  return engine.getCellValue(addr('Z100'));
}

describe('dynamic-array broadcasting', () => {
  it('applies operators elementwise', () => {
    expect(run('=SUM({1,2}*{3,4})')).toBe(11);
    expect(run('=SUM({1,2}/{1,0})')).toMatchObject({ type: CellErrorType.DIV_BY_ZERO });
    expect(run('=CONCAT({"a","b"}&"-")')).toBe('a-b-');
    expect(run('=SUM(({1,2,3}>1)*1)')).toBe(2);
  });

  it('stretches single rows, columns and scalars', () => {
    expect(run('=SUM({1;2}+{10,20})')).toBe(66); // 2x1 + 1x2 -> 2x2
    expect(run('=SUM({5}+{1;2;3})')).toBe(21);
    expect(run('=SUM(A1:A2+1)', { A1: 5 })).toBe(7); // empty cell counts as 0
  });

  it('marks missing positions of mismatched shapes as #N/A', () => {
    expect(run('=SUM({1;2}+{1;2;3})')).toMatchObject({ type: CellErrorType.NA });
  });

  it('lifts scalar functions over array arguments', () => {
    expect(run('=SUM(ABS({-1,2,-3}))')).toBe(6);
    expect(run('=SUM(LEN({"a","bb"}))')).toBe(3);
    expect(run('=CONCAT(LEFT({"ab","cd"},1))')).toBe('ac');
    expect(run('=SUM(ROUND({1.25,2.35},1)*10)')).toBe(37); // 1.3, 2.4 -> 13+24
  });

  it('propagates unary operators elementwise', () => {
    expect(run('=SUM(-{1,2})')).toBe(-3);
    expect(run('=SUM({10,20}%)')).toBeCloseTo(0.3, 12); // SUM does not precision-round
  });

  it('still propagates top-level scalar errors before lifting', () => {
    expect(run('=SUM((1/0)+{1,2})')).toMatchObject({ type: CellErrorType.DIV_BY_ZERO });
  });
});
