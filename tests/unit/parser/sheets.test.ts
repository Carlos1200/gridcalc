import { describe, expect, it } from 'vitest';
import { CellError, DEFAULT_CONFIG, parseFormula, tokenize, TokenType } from '../../../src/index';

const SHEETS: Record<string, number> = { sheet1: 0, datos: 1, 'mi hoja': 2 };
const lookup = (name: string): number | undefined => SHEETS[name.toLowerCase()];

function parse(formula: string) {
  return parseFormula(formula, DEFAULT_CONFIG, lookup);
}

describe('lexer sheet names', () => {
  it('tokenizes unquoted and quoted sheet prefixes', () => {
    expect(tokenize('Datos!A1').map((t) => t.type)).toEqual([
      TokenType.SHEET_NAME,
      TokenType.CELL_REF,
      TokenType.END,
    ]);
    expect(tokenize("'Mi Hoja'!A1")[0]).toMatchObject({
      type: TokenType.SHEET_NAME,
      text: "'Mi Hoja'",
    });
  });

  it('keeps plain identifiers as cell refs / names', () => {
    expect(tokenize('Datos').map((t) => t.type)).toEqual([TokenType.NAMED_EXPR, TokenType.END]);
    expect(tokenize('A1').map((t) => t.type)).toEqual([TokenType.CELL_REF, TokenType.END]);
  });

  it('rejects malformed sheet names', () => {
    expect(parseFormula("='Sin cerrar!A1").type).toBe('PARSE_ERROR');
    expect(parseFormula("='Hoja' A1").type).toBe('PARSE_ERROR'); // missing "!"
  });
});

describe('parser sheet references', () => {
  it('resolves the sheet name to its index', () => {
    expect(parse('=Datos!B2')).toEqual({
      type: 'CELL_REFERENCE',
      reference: { sheet: 1, col: 1, row: 1, colAbsolute: false, rowAbsolute: false },
    });
    expect(parse("='Mi Hoja'!$A$1")).toMatchObject({
      reference: { sheet: 2, colAbsolute: true, rowAbsolute: true },
    });
  });

  it('applies the sheet to the whole range', () => {
    expect(parse('=Datos!A1:B2')).toMatchObject({
      type: 'RANGE_REFERENCE',
      start: { sheet: 1, col: 0, row: 0 },
      end: { sheet: 1, col: 1, row: 1 },
    });
    expect(parse('=Datos!A1:Datos!B2')).toMatchObject({
      type: 'RANGE_REFERENCE',
      start: { sheet: 1 },
      end: { sheet: 1 },
    });
  });

  it('rejects 3D ranges across different sheets', () => {
    expect(parse('=Datos!A1:Sheet1!B2').type).toBe('PARSE_ERROR');
  });

  it('unknown sheets resolve to a #REF! literal, even inside ranges', () => {
    const single = parse('=Nada!A1');
    expect(single.type).toBe('ERROR');
    expect(String((single as { error: CellError }).error)).toBe('#REF!');

    const range = parse('=SUM(Nada!A1:B2)');
    expect(range).toMatchObject({
      type: 'FUNCTION_CALL',
      args: [{ type: 'ERROR' }],
    });
  });
});
