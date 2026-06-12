import { describe, expect, it } from 'vitest';
import { CellErrorType, Engine, parseCellReference, type SimpleCellAddress } from '../../../src/index';

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

function build(): Engine {
  const engine = Engine.buildEmpty();
  engine.batch(() => {
    for (const [ref, value] of [['A1', 1], ['A2', 2], ['A3', 3], ['B1', 10], ['B2', 20], ['B3', 30]] as const) {
      engine.setCellContents(addr(ref), value);
    }
  });
  return engine;
}

describe('OFFSET', () => {
  it('re-evaluates when its dynamic target changes (volatile)', () => {
    const engine = build();
    engine.setCellContents(addr('D1'), '=OFFSET(A1,2,0)');
    expect(engine.getCellValue(addr('D1'))).toBe(3);
    engine.setCellContents(addr('A3'), 300); // no graph edge D1 -> A3
    expect(engine.getCellValue(addr('D1'))).toBe(300);
  });

  it('spills when the offset window is larger than one cell', () => {
    const engine = build();
    engine.setCellContents(addr('D1'), '=OFFSET(A1,0,0,3,1)');
    expect(engine.getCellValue(addr('D1'))).toBe(1);
    expect(engine.getCellValue(addr('D3'))).toBe(3);
  });

  it('rejects non-references and zero-sized windows', () => {
    const engine = build();
    engine.setCellContents(addr('D1'), '=OFFSET(5,1,1)');
    engine.setCellContents(addr('D2'), '=OFFSET(A1,1,0,0,1)');
    expect(engine.getCellValue(addr('D1'))).toMatchObject({ type: CellErrorType.VALUE });
    expect(engine.getCellValue(addr('D2'))).toMatchObject({ type: CellErrorType.REF });
  });
});

describe('INDIRECT', () => {
  it('follows the text at runtime and re-evaluates on edits (volatile)', () => {
    const engine = build();
    engine.setCellContents(addr('C1'), 'A2');
    engine.setCellContents(addr('D1'), '=INDIRECT(C1)');
    expect(engine.getCellValue(addr('D1'))).toBe(2);

    engine.setCellContents(addr('A2'), 200); // target edited
    expect(engine.getCellValue(addr('D1'))).toBe(200);

    engine.setCellContents(addr('C1'), 'B3'); // the text itself changes
    expect(engine.getCellValue(addr('D1'))).toBe(30);
  });

  it('resolves sheet-qualified and quoted references', () => {
    const engine = build();
    const otra = engine.addSheet('Mi Hoja');
    engine.setCellContents(addr('A1', otra), 'hola');
    engine.setCellContents(addr('D1'), "=INDIRECT(\"'Mi Hoja'!A1\")");
    expect(engine.getCellValue(addr('D1'))).toBe('hola');
  });

  it('supports relative R1C1 references', () => {
    const engine = build();
    engine.setCellContents(addr('D2'), '=INDIRECT("R[-1]C[-3]",FALSE)'); // D2 -> A1
    expect(engine.getCellValue(addr('D2'))).toBe(1);
  });

  it('rejects text that is not a reference', () => {
    const engine = build();
    engine.setCellContents(addr('D1'), '=INDIRECT("1+1")');
    engine.setCellContents(addr('D2'), '=INDIRECT("nosheet!A1")');
    expect(engine.getCellValue(addr('D1'))).toMatchObject({ type: CellErrorType.REF });
    expect(engine.getCellValue(addr('D2'))).toMatchObject({ type: CellErrorType.REF });
  });
});

describe('TEXTSPLIT', () => {
  it('spills the grid and pads ragged rows with #N/A', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=TEXTSPLIT("a,b;c",",",";")');
    expect(engine.getCellValue(addr('A1'))).toBe('a');
    expect(engine.getCellValue(addr('B1'))).toBe('b');
    expect(engine.getCellValue(addr('A2'))).toBe('c');
    expect(engine.getCellValue(addr('B2'))).toMatchObject({ type: CellErrorType.NA });
  });

  it('uses pad_with when given and rejects empty delimiters', () => {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr('A1'), '=TEXTSPLIT("a,b;c",",",";",,,"-")');
    engine.setCellContents(addr('D1'), '=TEXTSPLIT("abc","")');
    expect(engine.getCellValue(addr('B2'))).toBe('-');
    expect(engine.getCellValue(addr('D1'))).toMatchObject({ type: CellErrorType.VALUE });
  });
});
