import { describe, expect, it } from 'vitest';
import { buildConfig, Engine, parseCellReference, parseFormula, serializeAst, type SimpleCellAddress } from '../../../src/index';

const ES = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });

function addr(text: string): SimpleCellAddress {
  const parsed = parseCellReference(text)!;
  return { sheet: 0, col: parsed.col, row: parsed.row };
}

describe('array literals', () => {
  it('parses rows and columns of scalar literals', () => {
    expect(parseFormula('={1,2;-3,"x;y"}')).toEqual({
      type: 'ARRAY_LITERAL',
      values: [
        [
          { type: 'NUMBER', value: 1 },
          { type: 'NUMBER', value: 2 },
        ],
        [
          { type: 'NUMBER', value: -3 },
          { type: 'STRING', value: 'x;y' },
        ],
      ],
    });
    expect(parseFormula('={TRUE,FALSE}')).toMatchObject({
      values: [[{ value: true }, { value: false }]],
    });
  });

  it('parses the es spelling: backslash columns, semicolon rows, decimal comma', () => {
    expect(parseFormula('={1\\2,5;3\\4}', ES)).toMatchObject({
      type: 'ARRAY_LITERAL',
      values: [
        [{ value: 1 }, { value: 2.5 }],
        [{ value: 3 }, { value: 4 }],
      ],
    });
  });

  it('round-trips through the serializer in both locales', () => {
    for (const [formula, config] of [
      ['{1,2;-3,4}', undefined],
      ['{1,"a""b";TRUE,#N/A}', undefined],
      ['{1\\2,5;3\\4}', ES],
    ] as const) {
      const ast = parseFormula(`=${formula}`, config);
      expect(serializeAst(ast, config)).toBe(formula);
    }
  });

  it('rejects ragged rows, references, expressions and empty constants', () => {
    expect(parseFormula('={1,2;3}')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('={A1}')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('={1+2}')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('={}')).toMatchObject({ type: 'PARSE_ERROR' });
    expect(parseFormula('={1,}')).toMatchObject({ type: 'PARSE_ERROR' });
  });

  it('evaluates through range-aware functions', () => {
    const engine = Engine.buildEmpty();
    engine.batch(() => {
      engine.setCellContents(addr('A1'), '=SUM({1,2;3,4})');
      engine.setCellContents(addr('A2'), '=VLOOKUP(2,{1,"a";2,"b"},2)');
      engine.setCellContents(addr('A3'), '=SUM({1,"2",TRUE})'); // text/booleans skipped, range rules
    });
    expect(engine.getCellValue(addr('A1'))).toBe(10);
    expect(engine.getCellValue(addr('A2'))).toBe('b');
    expect(engine.getCellValue(addr('A3'))).toBe(1);
  });
});
