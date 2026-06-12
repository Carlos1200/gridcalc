import { describe, expect, it } from 'vitest';
import {
  buildConfig,
  CellError,
  CellErrorType,
  parseFormula,
  type Ast,
  type BinaryOperator,
  type CellReference,
} from '../../../src/index';

// AST builders to keep expectations readable.
const num = (value: number): Ast => ({ type: 'NUMBER', value });
const str = (value: string): Ast => ({ type: 'STRING', value });
const bool = (value: boolean): Ast => ({ type: 'BOOLEAN', value });
const bin = (op: BinaryOperator, left: Ast, right: Ast): Ast => ({ type: 'BINARY_OP', op, left, right });
const neg = (operand: Ast): Ast => ({ type: 'UNARY_OP', op: '-', operand });
const pct = (operand: Ast): Ast => ({ type: 'UNARY_OP', op: '%', operand });
const call = (name: string, ...args: Ast[]): Ast => ({ type: 'FUNCTION_CALL', name, args });
const ref = (col: number, row: number, colAbs = false, rowAbs = false): CellReference => ({
  col,
  row,
  colAbsolute: colAbs,
  rowAbsolute: rowAbs,
});
const cell = (col: number, row: number, colAbs = false, rowAbs = false): Ast => ({
  type: 'CELL_REFERENCE',
  reference: ref(col, row, colAbs, rowAbs),
});
const range = (start: CellReference, end: CellReference): Ast => ({
  type: 'RANGE_REFERENCE',
  start,
  end,
});

describe('literals', () => {
  it('parses number, string, boolean and error literals', () => {
    expect(parseFormula('=42')).toEqual(num(42));
    expect(parseFormula('=1.5E-3')).toEqual(num(0.0015));
    expect(parseFormula('="say ""hi"""')).toEqual(str('say "hi"'));
    expect(parseFormula('=TRUE')).toEqual(bool(true));
    expect(parseFormula('=#N/A')).toEqual({
      type: 'ERROR',
      error: new CellError(CellErrorType.NA),
    });
  });

  it('accepts formulas without the leading =', () => {
    expect(parseFormula('1+1')).toEqual(bin('+', num(1), num(1)));
  });
});

describe('operator precedence (Excel semantics)', () => {
  it('* binds tighter than +', () => {
    expect(parseFormula('=1+2*3')).toEqual(bin('+', num(1), bin('*', num(2), num(3))));
  });

  it('parentheses override precedence', () => {
    expect(parseFormula('=(1+2)*3')).toEqual(bin('*', bin('+', num(1), num(2)), num(3)));
  });

  it('^ is left-associative: 2^3^2 = (2^3)^2', () => {
    expect(parseFormula('=2^3^2')).toEqual(bin('^', bin('^', num(2), num(3)), num(2)));
  });

  it('unary minus binds tighter than ^: -2^2 = (-2)^2', () => {
    expect(parseFormula('=-2^2')).toEqual(bin('^', neg(num(2)), num(2)));
  });

  it('% binds tighter than ^', () => {
    expect(parseFormula('=2^50%')).toEqual(bin('^', num(2), pct(num(50))));
  });

  it('& binds tighter than comparison', () => {
    expect(parseFormula('=1<2&"x"')).toEqual(bin('<', num(1), bin('&', num(2), str('x'))));
  });

  it('binary ops are left-associative', () => {
    expect(parseFormula('=1-2-3')).toEqual(bin('-', bin('-', num(1), num(2)), num(3)));
  });
});

describe('references', () => {
  it('parses cell references with absolute flags', () => {
    expect(parseFormula('=$A$1')).toEqual(cell(0, 0, true, true));
    expect(parseFormula('=B$2')).toEqual(cell(1, 1, false, true));
  });

  it('parses ranges, binding tighter than arithmetic', () => {
    expect(parseFormula('=A1:B2*2')).toEqual(bin('*', range(ref(0, 0), ref(1, 1)), num(2)));
  });

  it('bare LOG10 is a cell reference (column LOG, row 10)', () => {
    const parsed = parseFormula('=LOG10');
    expect(parsed.type).toBe('CELL_REFERENCE');
  });

  it('rejects ranges over non-references', () => {
    expect(parseFormula('=1:B2').type).toBe('PARSE_ERROR');
  });
});

describe('function calls', () => {
  it('parses calls with ranges and scalars', () => {
    expect(parseFormula('=SUM(A1:B2,3)')).toEqual(
      call('SUM', range(ref(0, 0), ref(1, 1)), num(3)),
    );
  });

  it('normalizes names to uppercase', () => {
    expect(parseFormula('=sum(1)')).toEqual(call('SUM', num(1)));
  });

  it('parses nested calls and comparisons in arguments', () => {
    expect(parseFormula('=IF(A1>0,"pos","neg")')).toEqual(
      call('IF', bin('>', cell(0, 0), num(0)), str('pos'), str('neg')),
    );
  });

  it('parses zero-argument and omitted-argument calls', () => {
    expect(parseFormula('=PI()')).toEqual(call('PI'));
    expect(parseFormula('=IF(1,,2)')).toEqual(call('IF', num(1), { type: 'EMPTY_ARG' }, num(2)));
  });
});

describe('named expressions', () => {
  it('parses named expressions in arithmetic', () => {
    expect(parseFormula('=IVA*2')).toEqual(
      bin('*', { type: 'NAMED_EXPRESSION', name: 'IVA' }, num(2)),
    );
  });
});

describe('localization', () => {
  it('parses es-locale separators', () => {
    const es = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    expect(parseFormula('=SUM(1,5;2)', es)).toEqual(call('SUM', num(1.5), num(2)));
  });
});

describe('error tolerance', () => {
  it('returns PARSE_ERROR nodes instead of throwing', () => {
    // ({1,2} stopped being an error in phase 3: array literals parse now.)
    for (const bad of ['=SUM(1', '=1+', '=', '=1 2', '={1,2;3}', '=)', '="abc']) {
      const parsed = parseFormula(bad);
      expect(parsed.type, `for formula ${JSON.stringify(bad)}`).toBe('PARSE_ERROR');
      if (parsed.type === 'PARSE_ERROR') {
        expect(parsed.error.type).toBe(CellErrorType.ERROR);
        expect(parsed.error.toString()).toBe('#ERROR!');
      }
    }
  });
});
