import { describe, expect, it } from 'vitest';
import { CellErrorType, Engine, parseCellReference, type SimpleCellAddress } from '../../src/index';

function addr(text: string): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet: 0, col: parsed.col, row: parsed.row };
}

describe('spilling', () => {
  it('spills an array result into the neighbouring cells', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2;3,4}');
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    expect(engine.getCellValue(addr('B1'))).toBe(2);
    expect(engine.getCellValue(addr('A2'))).toBe(3);
    expect(engine.getCellValue(addr('B2'))).toBe(4);
    // Spilled cells are values, not formulas.
    expect(engine.getCellFormula(addr('B1'))).toBeUndefined();
    expect(engine.getCellFormula(addr('A1'))).toBe('={1,2;3,4}');
  });

  it('reports spilled cells in the returned changes', () => {
    const engine = Engine.buildEmpty();
    const changes = engine.setCellContents(addr('A1'), '={1,2}');
    const byRef = new Map(changes.map((c) => [`${c.address.col},${c.address.row}`, c.value]));
    expect(byRef.get('0,0')).toBe(1);
    expect(byRef.get('1,0')).toBe(2);
  });

  it('a 1x1 array result behaves like a scalar', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={5}');
    expect(engine.getCellValue(addr('A1'))).toBe(5);
    expect(engine.getCellValue(addr('B1'))).toBeNull();
  });

  it('marks #SPILL! on collision and recovers when the blocker is cleared', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('B1'), 'busy');
    engine.setCellContents(addr('A1'), '={1,2}');
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.SPILL });
    expect(engine.getCellValue(addr('B1'))).toBe('busy');

    const changes = engine.setCellContents(addr('B1'), null);
    expect(engine.getCellValue(addr('A1'))).toBe(1);
    expect(engine.getCellValue(addr('B1'))).toBe(2);
    expect(changes.some((c) => c.address.col === 1 && c.value === 2)).toBe(true);
  });

  it('typing into a spilled cell blocks the anchor and keeps the user content', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2,3}');
    expect(engine.getCellValue(addr('C1'))).toBe(3);

    engine.setCellContents(addr('B1'), 99);
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.SPILL });
    expect(engine.getCellValue(addr('B1'))).toBe(99);
    expect(engine.getCellValue(addr('C1'))).toBeNull(); // other shadows retracted
  });

  it('clears stale cells when the footprint shrinks', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1;2;3}');
    expect(engine.getCellValue(addr('A3'))).toBe(3);

    const changes = engine.setCellContents(addr('A1'), '={9;8}');
    expect(engine.getCellValue(addr('A1'))).toBe(9);
    expect(engine.getCellValue(addr('A2'))).toBe(8);
    expect(engine.getCellValue(addr('A3'))).toBeNull();
    expect(changes.some((c) => c.address.row === 2 && c.value === null)).toBe(true);
  });

  it('removes the shadows when the anchor is deleted', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2}');
    engine.setCellContents(addr('A1'), null);
    expect(engine.getCellValue(addr('A1'))).toBeNull();
    expect(engine.getCellValue(addr('B1'))).toBeNull();
  });

  it('formulas can read spilled cells and recalculate through them', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 10);
      engine.setCellContents(addr('B1'), '=A1*{1,2}');
      engine.setCellContents(addr('D1'), '=C1+1'); // C1 is spilled by B1
    });
    expect(engine.getCellValue(addr('C1'))).toBe(20);
    expect(engine.getCellValue(addr('D1'))).toBe(21);

    engine.setCellContents(addr('A1'), 100);
    expect(engine.getCellValue(addr('C1'))).toBe(200);
    expect(engine.getCellValue(addr('D1'))).toBe(201);
  });

  it('aggregates can consume a spill through a range reference', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '={1;2;3}');
      engine.setCellContents(addr('C1'), '=SUM(A1:A3)');
    });
    expect(engine.getCellValue(addr('C1'))).toBe(6);
    engine.setCellContents(addr('A1'), '={10;20;30}');
    expect(engine.getCellValue(addr('C1'))).toBe(60);
  });

  it('an anchor reading its own footprint is a circular reference', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2}+B1');
    expect(engine.getCellValue(addr('A1'))).toMatchObject({ type: CellErrorType.CIRCULAR });
  });

  it('copyCell pastes the value of a spilled cell', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2}');
    engine.copyCell(addr('B1'), addr('D5'));
    expect(engine.getCellValue(addr('D5'))).toBe(2);
    expect(engine.getCellFormula(addr('D5'))).toBeUndefined();
  });

  it('two spills can block each other and recover independently', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '={1,2,3}');
    engine.setCellContents(addr('C5'), '={1;2}');
    expect(engine.getCellValue(addr('C6'))).toBe(2); // disjoint: both fine

    // A new spill wanting B1:C1 collides with A1's footprint.
    engine.setCellContents(addr('B3'), '={7;8}');
    expect(engine.getCellValue(addr('B3'))).toBe(7);
    engine.setCellContents(addr('B2'), '={5;6}'); // wants B3 -> blocked
    expect(engine.getCellValue(addr('B2'))).toMatchObject({ type: CellErrorType.SPILL });

    engine.setCellContents(addr('B3'), null); // unblock
    expect(engine.getCellValue(addr('B2'))).toBe(5);
    expect(engine.getCellValue(addr('B3'))).toBe(6);
  });
});

describe('dynamic array functions end to end', () => {
  it('SEQUENCE spills a 2D block', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=SEQUENCE(2,3,10,5)');
    expect(engine.getCellValue(addr('C1'))).toBe(20);
    expect(engine.getCellValue(addr('A2'))).toBe(25);
    expect(engine.getCellValue(addr('C2'))).toBe(35);
  });

  it('FILTER reshapes its spill when the data changes', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 1);
      engine.setCellContents(addr('A2'), 5);
      engine.setCellContents(addr('A3'), 2);
      engine.setCellContents(addr('C1'), '=FILTER(A1:A3,A1:A3>1)');
      engine.setCellContents(addr('E1'), '=COUNT(C1:C3)');
    });
    expect(engine.getCellValue(addr('C1'))).toBe(5);
    expect(engine.getCellValue(addr('C2'))).toBe(2);
    expect(engine.getCellValue(addr('E1'))).toBe(2);

    engine.setCellContents(addr('A1'), 9); // now three matches: grows
    expect(engine.getCellValue(addr('C3'))).toBe(2);
    expect(engine.getCellValue(addr('E1'))).toBe(3);

    engine.batch(() => {
      engine.setCellContents(addr('A1'), 0);
      engine.setCellContents(addr('A2'), 0);
      engine.setCellContents(addr('A3'), 0);
    });
    expect(engine.getCellValue(addr('C1'))).toMatchObject({ type: CellErrorType.CALC });
    expect(engine.getCellValue(addr('C2'))).toBeNull(); // shrank: shadows cleared
    expect(engine.getCellValue(addr('E1'))).toBe(0);
  });

  it('XLOOKUP with a multi-column return spills the matched row', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 'ana');
      engine.setCellContents(addr('B1'), 30);
      engine.setCellContents(addr('C1'), 'madrid');
      engine.setCellContents(addr('A2'), 'luis');
      engine.setCellContents(addr('B2'), 41);
      engine.setCellContents(addr('C2'), 'sevilla');
      engine.setCellContents(addr('E1'), '=XLOOKUP("luis",A1:A2,B1:C2)');
    });
    expect(engine.getCellValue(addr('E1'))).toBe(41);
    expect(engine.getCellValue(addr('F1'))).toBe('sevilla');
  });

  it('SORT over a live range re-sorts on edit', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 3);
      engine.setCellContents(addr('A2'), 1);
      engine.setCellContents(addr('C1'), '=SORT(A1:A2)');
    });
    expect(engine.getCellValue(addr('C1'))).toBe(1);
    expect(engine.getCellValue(addr('C2'))).toBe(3);
    engine.setCellContents(addr('A2'), 7);
    expect(engine.getCellValue(addr('C1'))).toBe(3);
    expect(engine.getCellValue(addr('C2'))).toBe(7);
  });
});
