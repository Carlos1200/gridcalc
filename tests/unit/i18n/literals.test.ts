import { describe, expect, it } from 'vitest';
import {
  buildConfig,
  CellError,
  CellErrorType,
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

describe('localized boolean literals', () => {
  it('parses VERDADERO/FALSO under es', () => {
    expect(parseFormula('=VERDADERO', ES)).toEqual({ type: 'BOOLEAN', value: true });
    expect(parseFormula('=falso', ES)).toEqual({ type: 'BOOLEAN', value: false });
  });

  it('still accepts canonical TRUE/FALSE under es', () => {
    expect(parseFormula('=TRUE', ES)).toEqual({ type: 'BOOLEAN', value: true });
    expect(parseFormula('=FALSE', ES)).toEqual({ type: 'BOOLEAN', value: false });
  });

  it('treats VERDADERO as a named expression under the default locale', () => {
    expect(parseFormula('=VERDADERO')).toMatchObject({ type: 'NAMED_EXPRESSION' });
  });

  it('serializes to the localized spelling, canonical elsewhere', () => {
    const ast = parseFormula('=SI(VERDADERO;1;FALSO)', ES);
    expect(serializeAst(ast, ES)).toBe('SI(VERDADERO;1;FALSO)');
    expect(serializeAst(parseFormula('=TRUE'))).toBe('TRUE');
  });

  it('evaluates Spanish booleans end to end', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.setCellContents(addr('A1'), '=SI(VERDADERO;1;2)');
    expect(engine.getCellValue(addr('A1'))).toBe(1);
  });

  it('copyCell keeps the localized boolean spelling', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.setCellContents(addr('A1'), '=Y(VERDADERO;FALSO)');
    engine.copyCell(addr('A1'), addr('A2'));
    expect(engine.getCellFormula(addr('A2'))).toBe('=Y(VERDADERO;FALSO)');
  });
});

describe('localized error literals', () => {
  it('parses es spellings to the canonical error types', () => {
    expect(parseFormula('=#¡DIV/0!', ES)).toMatchObject({
      type: 'ERROR',
      error: { type: CellErrorType.DIV_BY_ZERO },
    });
    expect(parseFormula('=#¿NOMBRE?', ES)).toMatchObject({ error: { type: CellErrorType.NAME } });
    expect(parseFormula('=#¡VALOR!', ES)).toMatchObject({ error: { type: CellErrorType.VALUE } });
    expect(parseFormula('=#N/D', ES)).toMatchObject({ error: { type: CellErrorType.NA } });
    expect(parseFormula('=#¡REF!', ES)).toMatchObject({ error: { type: CellErrorType.REF } });
    expect(parseFormula('=#¡NUM!', ES)).toMatchObject({ error: { type: CellErrorType.NUM } });
    expect(parseFormula('=#¡NULO!', ES)).toMatchObject({ error: { type: CellErrorType.NULL } });
  });

  it('still accepts canonical spellings under es', () => {
    expect(parseFormula('=#DIV/0!', ES)).toMatchObject({
      error: { type: CellErrorType.DIV_BY_ZERO },
    });
    expect(parseFormula('=#N/A', ES)).toMatchObject({ error: { type: CellErrorType.NA } });
  });

  it('rejects es spellings under the default locale', () => {
    expect(parseFormula('=#¡DIV/0!')).toMatchObject({ type: 'PARSE_ERROR' });
  });

  it('serializes to the localized spelling, canonical for engine-only errors', () => {
    expect(serializeAst(parseFormula('=#¡VALOR!', ES), ES)).toBe('#¡VALOR!');
    expect(serializeAst(parseFormula('=#DIV/0!', ES), ES)).toBe('#¡DIV/0!');
    expect(serializeAst(parseFormula('=#VALUE!'))).toBe('#VALUE!');
    // #CIRCULAR! / #ERROR! have no es spelling and keep the canonical one.
    const circular = { type: 'ERROR', error: new CellError(CellErrorType.CIRCULAR) } as const;
    expect(serializeAst(circular, ES)).toBe('#CIRCULAR!');
    expect(serializeAst(parseFormula('=#¡(', ES), ES)).toBe('#ERROR!');
  });

  it('evaluates localized error literals end to end', () => {
    const engine = Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '=#N/D');
      engine.setCellContents(addr('A2'), '=ESNOD(A1)');
      engine.setCellContents(addr('A3'), '=SI.ERROR(#¡DIV/0!;"saneado")');
    });
    expect(engine.getCellValue(addr('A2'))).toBe(true);
    expect(engine.getCellValue(addr('A3'))).toBe('saneado');
  });
});
