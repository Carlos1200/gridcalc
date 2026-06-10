import { describe, expect, it } from 'vitest';
import {
  buildConfig,
  Engine,
  parseCellReference,
  parseFormula,
  serializeAst,
  type SimpleCellAddress,
} from '../../../src/index';

const ES = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });

function addr(text: string, sheet = 0): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet, col: parsed.col, row: parsed.row };
}

describe('localized function names', () => {
  it('parses Spanish names to canonical AST names', () => {
    expect(parseFormula('=SUMA(1;2)', ES)).toMatchObject({ type: 'FUNCTION_CALL', name: 'SUM' });
    expect(parseFormula('=SI(VERDADERO;1;2)', ES)).toMatchObject({ name: 'IF' });
    expect(parseFormula('=REDONDEAR.MAS(2,5;0)', ES)).toMatchObject({ name: 'ROUNDUP' });
    expect(parseFormula('=BUSCARV(1;A1:B2;2)', ES)).toMatchObject({ name: 'VLOOKUP' });
  });

  it('still accepts canonical English names under es', () => {
    expect(parseFormula('=SUM(1;2)', ES)).toMatchObject({ name: 'SUM' });
  });

  it('serializes back to the localized spelling', () => {
    const ast = parseFormula('=SUMA(A1:A3)+SI.ERROR(1/0;0)', ES);
    expect(serializeAst(ast, ES)).toBe('SUMA(A1:A3)+SI.ERROR(1/0;0)');
  });

  it('evaluates Spanish formulas end to end in the Engine', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.batch(() => {
      engine.setCellContents(addr('A1'), 1.5);
      engine.setCellContents(addr('A2'), 2.5);
      engine.setCellContents(addr('B1'), '=SUMA(A1:A2)');
      engine.setCellContents(addr('B2'), '=SI(B1>3;"alto";"bajo")');
      engine.setCellContents(addr('B3'), '=REDONDEAR(2,675;2)');
    });
    expect(engine.getCellValue(addr('B1'))).toBe(4);
    expect(engine.getCellValue(addr('B2'))).toBe('alto');
    expect(engine.getCellValue(addr('B3'))).toBe(2.68);
  });

  it('copyCell keeps the localized spelling', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.setCellContents(addr('A1'), 10);
    engine.setCellContents(addr('B1'), '=SUMA(A1;1)');
    engine.copyCell(addr('B1'), addr('B2'));
    expect(engine.getCellFormula(addr('B2'))).toBe('=SUMA(A2;1)');
  });
});
