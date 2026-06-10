import { describe, expect, it } from 'vitest';
import {
  adjustReferences,
  buildConfig,
  DEFAULT_CONFIG,
  parseFormula,
  serializeAst,
} from '../../../src/index';

const SHEETS: Record<string, number> = { sheet1: 0, datos: 1, 'mi hoja': 2 };
const lookup = (name: string): number | undefined => SHEETS[name.toLowerCase()];
const names = (sheet: number): string | undefined =>
  ['Sheet1', 'Datos', 'Mi Hoja'][sheet];

describe('serializeAst', () => {
  it('round-trips formulas through parse -> serialize -> parse', () => {
    const formulas = [
      '=1+2*3',
      '=(1+2)*3',
      '=2-(3-1)',
      '=2^3^2',
      '=-2^2',
      '=50%+1',
      '=(1+2)%',
      '=-(1+2)',
      '=A1+$B$2*C$3',
      '=SUM(A1:B2,3)',
      '=IF(A1>0,,"neg")',
      '="quote "" inside"&A1',
      '=1<=2',
      '=IVA*2',
      '=Datos!A1+1',
      "='Mi Hoja'!A1:B2",
    ];
    for (const formula of formulas) {
      const ast = parseFormula(formula, DEFAULT_CONFIG, lookup);
      const text = serializeAst(ast, DEFAULT_CONFIG, names);
      expect(parseFormula(`=${text}`, DEFAULT_CONFIG, lookup), formula).toEqual(ast);
    }
  });

  it('quotes sheet names only when needed', () => {
    const ast = parseFormula("='Mi Hoja'!A1+Datos!B2", DEFAULT_CONFIG, lookup);
    expect(serializeAst(ast, DEFAULT_CONFIG, names)).toBe("'Mi Hoja'!A1+Datos!B2");
  });

  it('uses locale separators and localized function names', () => {
    const es = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    const ast = parseFormula('=SUM(1,5;2)', es);
    expect(serializeAst(ast, es)).toBe('SUMA(1,5;2)');
  });

  it('serializes references to removed sheets as #REF!', () => {
    const ast = parseFormula('=Datos!A1', DEFAULT_CONFIG, lookup);
    expect(serializeAst(ast, DEFAULT_CONFIG, () => undefined)).toBe('#REF!');
  });
});

describe('adjustReferences', () => {
  it('shifts relative parts and keeps absolute parts', () => {
    const ast = parseFormula('=A1+$B$2+C$3+$D4');
    const adjusted = adjustReferences(ast, 2, 1);
    expect(serializeAst(adjusted)).toBe('B3+$B$2+D$3+$D6');
  });

  it('adjusts ranges and function args', () => {
    const ast = parseFormula('=SUM(A1:B2)+IF(C1,D1,1)');
    expect(serializeAst(adjustReferences(ast, 1, 0))).toBe('SUM(A2:B3)+IF(C2,D2,1)');
  });

  it('references shifted off the grid become #REF!', () => {
    expect(serializeAst(adjustReferences(parseFormula('=A1'), -1, 0))).toBe('#REF!');
    expect(serializeAst(adjustReferences(parseFormula('=SUM(A1:B2)'), 0, -1))).toBe('SUM(#REF!)');
    // Absolute references survive a negative shift.
    expect(serializeAst(adjustReferences(parseFormula('=$A$1'), -5, -5))).toBe('$A$1');
  });
});
