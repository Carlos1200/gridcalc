import { describe, expect, it } from 'vitest';
import { buildConfig, FormulaSyntaxError, tokenize, TokenType } from '../../../src/index';

function types(input: string, config?: Parameters<typeof tokenize>[1]): TokenType[] {
  return tokenize(input, config).map((token) => token.type);
}

function texts(input: string): string[] {
  return tokenize(input)
    .filter((token) => token.type !== TokenType.END)
    .map((token) => token.text);
}

describe('tokenize', () => {
  it('lexes numbers including decimals and scientific notation', () => {
    expect(texts('1 2.5 .5 1.5E-3 2e10')).toEqual(['1', '2.5', '.5', '1.5E-3', '2e10']);
    expect(types('1.5E-3')).toEqual([TokenType.NUMBER, TokenType.END]);
  });

  it('does not absorb a non-exponent after a number', () => {
    // "1E" alone: E is not an exponent without digits.
    expect(types('1E')).toEqual([TokenType.NUMBER, TokenType.NAMED_EXPR, TokenType.END]);
  });

  it('lexes strings with escaped quotes', () => {
    const [token] = tokenize('"say ""hi"""');
    expect(token!.type).toBe(TokenType.STRING);
    expect(token!.text).toBe('"say ""hi"""');
  });

  it('throws on unterminated strings', () => {
    expect(() => tokenize('"abc')).toThrow(FormulaSyntaxError);
  });

  it('lexes error literals', () => {
    expect(types('#DIV/0!')).toEqual([TokenType.ERROR_LITERAL, TokenType.END]);
    expect(types('#N/A')).toEqual([TokenType.ERROR_LITERAL, TokenType.END]);
    expect(types('#name?')).toEqual([TokenType.ERROR_LITERAL, TokenType.END]);
    expect(() => tokenize('#WAT!')).toThrow(FormulaSyntaxError);
  });

  it('distinguishes cell refs, functions, booleans and named expressions', () => {
    expect(types('A1')).toEqual([TokenType.CELL_REF, TokenType.END]);
    expect(types('$A$1')).toEqual([TokenType.CELL_REF, TokenType.END]);
    expect(types('SUM(A1)')).toEqual([
      TokenType.FUNCTION_NAME,
      TokenType.LPAREN,
      TokenType.CELL_REF,
      TokenType.RPAREN,
      TokenType.END,
    ]);
    expect(types('TRUE')).toEqual([TokenType.BOOLEAN, TokenType.END]);
    expect(types('TRUE()')).toEqual([
      TokenType.FUNCTION_NAME,
      TokenType.LPAREN,
      TokenType.RPAREN,
      TokenType.END,
    ]);
    expect(types('ventas_q1')).toEqual([TokenType.NAMED_EXPR, TokenType.END]);
  });

  it('treats LOG10 as a cell ref unless called', () => {
    // Column LOG, row 10 — same disambiguation as Excel.
    expect(types('LOG10')).toEqual([TokenType.CELL_REF, TokenType.END]);
    expect(types('LOG10(100)')).toEqual([
      TokenType.FUNCTION_NAME,
      TokenType.LPAREN,
      TokenType.NUMBER,
      TokenType.RPAREN,
      TokenType.END,
    ]);
  });

  it('lexes one- and two-char operators', () => {
    expect(types('1<>2')).toEqual([TokenType.NUMBER, TokenType.OP_NEQ, TokenType.NUMBER, TokenType.END]);
    expect(types('1<=2')).toEqual([TokenType.NUMBER, TokenType.OP_LTE, TokenType.NUMBER, TokenType.END]);
    expect(types('1>=2')).toEqual([TokenType.NUMBER, TokenType.OP_GTE, TokenType.NUMBER, TokenType.END]);
    expect(types('A1:B2')).toEqual([
      TokenType.CELL_REF,
      TokenType.RANGE_OP,
      TokenType.CELL_REF,
      TokenType.END,
    ]);
    expect(types('50%&"x"')).toEqual([
      TokenType.NUMBER,
      TokenType.OP_PERCENT,
      TokenType.OP_CONCAT,
      TokenType.STRING,
      TokenType.END,
    ]);
  });

  it('honors es-locale separators', () => {
    const es = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });
    const tokens = tokenize('SUM(1,5;2)', es);
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.FUNCTION_NAME,
      TokenType.LPAREN,
      TokenType.NUMBER,
      TokenType.ARG_SEP,
      TokenType.NUMBER,
      TokenType.RPAREN,
      TokenType.END,
    ]);
    expect(tokens[2]!.text).toBe('1,5');
  });

  it('throws on unexpected characters', () => {
    expect(() => tokenize('1 ! 2')).toThrow(FormulaSyntaxError);
  });
});
