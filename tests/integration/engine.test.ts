import { describe, expect, it } from 'vitest';
import {
  CellError,
  Engine,
  parseCellReference,
  type RawInterpreterValue,
  type SimpleCellAddress,
} from '../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

function display(value: unknown): unknown {
  return value instanceof CellError ? value.toString() : value;
}

describe('Engine basics', () => {
  it('stores values, parsing typed text like Excel', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '42');
    engine.setCellContents(addr('A2'), 'hello');
    engine.setCellContents(addr('A3'), 'TRUE');

    expect(engine.getCellValue(addr('A1'))).toBe(42);
    expect(engine.getCellValue(addr('A2'))).toBe('hello');
    expect(engine.getCellValue(addr('A3'))).toBe(true);
    expect(engine.getCellValue(addr('B1'))).toBeNull(); // never set
  });

  it('evaluates formulas against current cell values', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 20);
    engine.setCellContents(addr('A2'), 22);
    engine.setCellContents(addr('B1'), '=A1+A2');

    expect(engine.getCellValue(addr('B1'))).toBe(42);
    expect(engine.getCellFormula(addr('B1'))).toBe('=A1+A2');
    expect(engine.getCellFormula(addr('A1'))).toBeUndefined();
  });

  it('clears cells with null and with ""', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 5);
    engine.setCellContents(addr('B1'), '=A1+1');
    const changes = engine.setCellContents(addr('A1'), null);

    expect(engine.getCellValue(addr('A1'))).toBeNull();
    expect(engine.getCellValue(addr('B1'))).toBe(1); // empty coerces to 0
    expect(changes).toContainEqual({ address: addr('A1'), value: null });
  });

  it('a formula over an empty cell materializes to 0', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('B1'), '=A1');
    expect(engine.getCellValue(addr('B1'))).toBe(0);
  });

  it('stores broken formulas as #ERROR! without throwing', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=1+');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#ERROR!');
    expect(engine.getCellFormula(addr('A1'))).toBe('=1+');
  });
});

describe('Engine recalculation', () => {
  it('recalculates dependents transitively and reports changes in order', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 1);
    engine.setCellContents(addr('B1'), '=A1*2');
    engine.setCellContents(addr('C1'), '=B1*2');

    const changes = engine.setCellContents(addr('A1'), 10);
    expect(changes).toEqual([
      { address: addr('A1'), value: 10 },
      { address: addr('B1'), value: 20 },
      { address: addr('C1'), value: 40 },
    ]);
  });

  it('does not report dependents whose value did not change', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), -5);
    engine.setCellContents(addr('B1'), '=A1*0');

    const changes = engine.setCellContents(addr('A1'), 7);
    expect(changes).toEqual([{ address: addr('A1'), value: 7 }]);
    expect(engine.getCellValue(addr('B1'))).toBe(0);
  });

  it('only re-evaluates the dirty subtree', () => {
    const engine = Engine.buildEmpty();
    let evaluations = 0;
    engine.functions.register({
      metadata: { name: 'SPY', minArgs: 1, maxArgs: 1 },
      fn: (args: RawInterpreterValue[]) => {
        evaluations++;
        return args[0] ?? 0;
      },
    });
    engine.setCellContents(addr('A1'), 1);
    engine.setCellContents(addr('B1'), '=SPY(A1)');
    engine.setCellContents(addr('D1'), '=SPY(C1)'); // unrelated island
    evaluations = 0;

    engine.setCellContents(addr('A1'), 2);
    expect(evaluations).toBe(1); // only B1, not D1
  });

  it('reaches dependents through ranges', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('B1'), '=A1:A3=0');
    // B1 is a scalar formula over a range -> #VALUE! for now, but the edge exists:
    const changes = engine.setCellContents(addr('A2'), 1);
    expect(changes.map((c) => c.address)).toContainEqual(addr('A2'));
  });

  it('updates edges when a formula is rewritten', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 1);
    engine.setCellContents(addr('A2'), 100);
    engine.setCellContents(addr('B1'), '=A1');
    engine.setCellContents(addr('B1'), '=A2');

    expect(engine.getCellValue(addr('B1'))).toBe(100);
    const changes = engine.setCellContents(addr('A1'), 5);
    expect(changes).toEqual([{ address: addr('A1'), value: 5 }]); // B1 no longer cares
  });
});

describe('Engine cycles', () => {
  it('marks every cell in a cycle with #CIRCULAR!', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=B1');
    engine.setCellContents(addr('B1'), '=A1');

    expect(display(engine.getCellValue(addr('A1')))).toBe('#CIRCULAR!');
    expect(display(engine.getCellValue(addr('B1')))).toBe('#CIRCULAR!');
  });

  it('propagates #CIRCULAR! to dependents outside the cycle', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=B1');
    engine.setCellContents(addr('B1'), '=A1');
    engine.setCellContents(addr('C1'), '=B1+1');

    expect(display(engine.getCellValue(addr('C1')))).toBe('#CIRCULAR!');
  });

  it('recovers when the cycle is broken', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=B1');
    engine.setCellContents(addr('B1'), '=A1');
    engine.setCellContents(addr('B1'), 7);

    expect(engine.getCellValue(addr('A1'))).toBe(7);
    expect(engine.getCellValue(addr('B1'))).toBe(7);
  });

  it('detects self-references', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=A1+1');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#CIRCULAR!');
  });
});

describe('Engine batch', () => {
  it('recalculates once and returns combined changes', () => {
    const engine = Engine.buildEmpty();
    let evaluations = 0;
    engine.functions.register({
      metadata: { name: 'SPY2', minArgs: 2, maxArgs: 2 },
      fn: (args: RawInterpreterValue[]) => {
        evaluations++;
        const num = (value: RawInterpreterValue | undefined): number =>
          typeof value === 'number' ? value : 0;
        return num(args[0]) + num(args[1]);
      },
    });
    engine.setCellContents(addr('C1'), '=SPY2(A1,B1)');
    evaluations = 0;

    const changes = engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('B1'), 2);
    });

    expect(evaluations).toBe(1);
    expect(changes).toContainEqual({ address: addr('A1'), value: 1 });
    expect(changes).toContainEqual({ address: addr('B1'), value: 2 });
    expect(changes).toContainEqual({ address: addr('C1'), value: 3 });
  });

  it('reports the final value when a cell is edited twice in one batch', () => {
    const engine = Engine.buildEmpty();
    const changes = engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('A1'), 2);
    });
    expect(changes).toEqual([{ address: addr('A1'), value: 2 }]);
  });

  it('rejects nested batches', () => {
    const engine = Engine.buildEmpty();
    expect(() =>
      engine.batch(() => {
        engine.batch(() => undefined);
      }),
    ).toThrow(/nested/);
  });
});

describe('Engine copyCell', () => {
  it('fills down adjusting relative references, keeping absolute ones', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('A2'), 2);
      engine.setCellContents(addr('B1'), 10);
      engine.setCellContents(addr('C1'), '=A1+$B$1');
    });
    engine.copyCell(addr('C1'), addr('C2'));
    expect(engine.getCellFormula(addr('C2'))).toBe('=A2+$B$1');
    expect(engine.getCellValue(addr('C2'))).toBe(12);
  });

  it('copies values as-is and clears the target when copying an empty cell', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), 'hello');
    engine.setCellContents(addr('B1'), 99);
    engine.copyCell(addr('A1'), addr('B1'));
    expect(engine.getCellValue(addr('B1'))).toBe('hello');
    engine.copyCell(addr('Z9'), addr('B1')); // Z9 is empty
    expect(engine.getCellValue(addr('B1'))).toBeNull();
  });

  it('turns references shifted off the grid into #REF!', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('B2'), '=A1');
    engine.copyCell(addr('B2'), addr('B1'));
    expect(engine.getCellFormula(addr('B1'))).toBe('=#REF!');
    expect(display(engine.getCellValue(addr('B1')))).toBe('#REF!');
  });

  it('keeps explicit sheet qualifiers when copying', () => {
    const engine = Engine.buildEmpty();
    const datos = engine.addSheet('Datos');
    engine.setCellContents(addr('A2', datos), 7);
    engine.setCellContents(addr('B1'), '=Datos!A1+1');
    engine.copyCell(addr('B1'), addr('B2'));
    expect(engine.getCellFormula(addr('B2'))).toBe('=Datos!A2+1');
    expect(engine.getCellValue(addr('B2'))).toBe(8);
  });
});

describe('Engine functions', () => {
  it('returns #NAME? for functions that are not registered yet', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=NOSUCHFN(1)');
    expect(display(engine.getCellValue(addr('A1')))).toBe('#NAME?');
  });

  it('runs registered range-aware functions over engine ranges', () => {
    const engine = Engine.buildEmpty();
    engine.functions.register({
      metadata: { name: 'MYSUM', minArgs: 1, maxArgs: 1, argHandling: 'range-aware' },
      fn: (args: RawInterpreterValue[]) => {
        let total = 0;
        const range = args[0];
        if (Array.isArray(range)) {
          for (const row of range) {
            for (const value of row) {
              total += typeof value === 'number' ? value : 0;
            }
          }
        }
        return total;
      },
    });
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('A2'), 2);
      engine.setCellContents(addr('A3'), 39);
      engine.setCellContents(addr('B1'), '=MYSUM(A1:A3)');
    });
    expect(engine.getCellValue(addr('B1'))).toBe(42);

    engine.setCellContents(addr('A2'), 100);
    expect(engine.getCellValue(addr('B1'))).toBe(140);
  });
});
