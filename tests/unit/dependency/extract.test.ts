import { describe, expect, it } from 'vitest';
import { extractDependencies, parseFormula, type SimpleCellAddress } from '../../../src/index';

const B5: SimpleCellAddress = { sheet: 0, col: 1, row: 4 };

function depsOf(formula: string, at: SimpleCellAddress = B5) {
  return extractDependencies(parseFormula(formula), at);
}

describe('extractDependencies', () => {
  it('collects cell references from operators and function args', () => {
    const deps = depsOf('=A1+SUM(C3,-D4)*IF(E5>0,1,2)');
    expect(deps.cells).toEqual([
      { sheet: 0, col: 0, row: 0 }, // A1
      { sheet: 0, col: 2, row: 2 }, // C3
      { sheet: 0, col: 3, row: 3 }, // D4
      { sheet: 0, col: 4, row: 4 }, // E5
    ]);
    expect(deps.ranges).toEqual([]);
    expect(deps.names).toEqual([]);
    expect(deps.volatile).toBe(false);
  });

  it('resolves the sheet from the formula address', () => {
    const deps = depsOf('=A1', { sheet: 3, col: 0, row: 9 });
    expect(deps.cells).toEqual([{ sheet: 3, col: 0, row: 0 }]);
  });

  it('deduplicates repeated references', () => {
    const deps = depsOf('=A1+A1+$A$1');
    expect(deps.cells).toEqual([{ sheet: 0, col: 0, row: 0 }]);
  });

  it('collects and normalizes ranges', () => {
    const deps = depsOf('=SUM(B2:A1)');
    expect(deps.ranges).toEqual([
      {
        start: { sheet: 0, col: 0, row: 0 },
        end: { sheet: 0, col: 1, row: 1 },
      },
    ]);
    expect(deps.cells).toEqual([]);
  });

  it('collects named expressions', () => {
    const deps = depsOf('=IVA*A1');
    expect(deps.names).toEqual(['IVA']);
    expect(deps.cells).toEqual([{ sheet: 0, col: 0, row: 0 }]);
  });

  it('flags volatile functions, including nested calls', () => {
    expect(depsOf('=NOW()').volatile).toBe(true);
    expect(depsOf('=A1+IF(B1,RAND(),0)').volatile).toBe(true);
    expect(depsOf('=SUM(A1:A3)').volatile).toBe(false);
  });

  it('returns no dependencies for literals and parse errors', () => {
    expect(depsOf('=1+2')).toEqual({ cells: [], ranges: [], names: [], volatile: false });
    expect(depsOf('=SUM(')).toEqual({ cells: [], ranges: [], names: [], volatile: false });
  });
});
