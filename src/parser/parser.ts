/**
 * Pratt parser: tokens -> AST, with Excel's operator precedence
 * (tightest to loosest):
 *
 *   : (range) > unary -/+ > % (postfix) > ^ > * / > + - > & > comparisons
 *
 * Notable Excel semantics encoded here: `-2^2` is `(-2)^2 = 4` (unary minus
 * binds tighter than `^`), and `^` is left-associative (`2^3^2 = 64`).
 *
 * Parsing is error-tolerant: invalid formulas yield a PARSE_ERROR node that
 * evaluates to #ERROR! instead of throwing (like a spreadsheet storing a
 * broken formula).
 */

import { CellError, CellErrorType } from '../value/types';
import { DEFAULT_CONFIG, type EngineConfig } from '../config/types';
import { FormulaSyntaxError, errorLiteralToType, tokenize } from '../lexer/lexer';
import { TokenType, type Token } from '../lexer/tokens';
import { booleanLiteralValue, toCanonicalName } from '../i18n/index';
import { parseCellReference } from '../reference/addressing';
import type { Ast, BinaryOperator } from '../ast/nodes';

const BINARY_BINDING_POWER: Partial<Record<TokenType, number>> = {
  [TokenType.OP_EQ]: 2,
  [TokenType.OP_NEQ]: 2,
  [TokenType.OP_LT]: 2,
  [TokenType.OP_GT]: 2,
  [TokenType.OP_LTE]: 2,
  [TokenType.OP_GTE]: 2,
  [TokenType.OP_CONCAT]: 3,
  [TokenType.OP_PLUS]: 4,
  [TokenType.OP_MINUS]: 4,
  [TokenType.OP_MULT]: 5,
  [TokenType.OP_DIV]: 5,
  [TokenType.OP_POW]: 6,
};
const PERCENT_BINDING_POWER = 7;
const UNARY_BINDING_POWER = 8;
/** Excel's space (intersection) binds tighter than unary minus, looser than `:`. */
const INTERSECT_BINDING_POWER = 8.5;
const RANGE_BINDING_POWER = 9;

/** Resolves a sheet name (case-insensitive) to its index; undefined = unknown. */
export type SheetLookup = (name: string) => number | undefined;

const NO_SHEETS: SheetLookup = () => undefined;

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly config: EngineConfig,
    private readonly sheetLookup: SheetLookup,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    return this.tokens[this.pos++]!;
  }

  expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new FormulaSyntaxError(
        token.type === TokenType.END
          ? 'Unexpected end of formula'
          : `Unexpected "${token.text}" at position ${token.start}`,
      );
    }
    return this.advance();
  }

  parseExpression(minBindingPower: number): Ast {
    let left = this.parsePrefix();

    for (;;) {
      const token = this.peek();

      const binaryPower = BINARY_BINDING_POWER[token.type];
      if (binaryPower !== undefined && binaryPower > minBindingPower) {
        this.advance();
        // Left-associative: the right side stops at operators of equal power.
        const right = this.parseExpression(binaryPower);
        left = { type: 'BINARY_OP', op: token.text as BinaryOperator, left, right };
        continue;
      }

      if (token.type === TokenType.OP_PERCENT && PERCENT_BINDING_POWER > minBindingPower) {
        this.advance();
        left = { type: 'UNARY_OP', op: '%', operand: left };
        continue;
      }

      if (
        token.spaceBefore === true &&
        (token.type === TokenType.CELL_REF || token.type === TokenType.SHEET_NAME) &&
        INTERSECT_BINDING_POWER > minBindingPower &&
        (left.type === 'CELL_REFERENCE' || left.type === 'RANGE_REFERENCE' ||
          (left.type === 'BINARY_OP' && left.op === ' '))
      ) {
        // Intersection operator: a space between two references.
        const right = this.parseExpression(INTERSECT_BINDING_POWER);
        left = { type: 'BINARY_OP', op: ' ', left, right };
        continue;
      }

      if (token.type === TokenType.RANGE_OP && RANGE_BINDING_POWER > minBindingPower) {
        this.advance();
        const right = this.parseExpression(RANGE_BINDING_POWER);
        // A side that resolved to #REF! (unknown sheet) poisons the range.
        if (left.type === 'ERROR' && left.error.type === CellErrorType.REF) {
          continue;
        }
        if (right.type === 'ERROR' && right.error.type === CellErrorType.REF) {
          left = right;
          continue;
        }
        if (left.type !== 'CELL_REFERENCE' || right.type !== 'CELL_REFERENCE') {
          throw new FormulaSyntaxError('Range operator ":" requires cell references on both sides');
        }
        const start = left.reference;
        let end = right.reference;
        if (start.sheet !== undefined && end.sheet === undefined) {
          end = { ...end, sheet: start.sheet }; // Sheet2!A1:B2 lives entirely on Sheet2
        }
        if (start.sheet !== end.sheet) {
          throw new FormulaSyntaxError('3D ranges across sheets are not supported');
        }
        left = { type: 'RANGE_REFERENCE', start, end };
        continue;
      }

      return left;
    }
  }

  private parsePrefix(): Ast {
    const token = this.advance();
    switch (token.type) {
      case TokenType.NUMBER:
        return { type: 'NUMBER', value: this.parseNumber(token.text) };
      case TokenType.STRING:
        return { type: 'STRING', value: token.text.slice(1, -1).replace(/""/g, '"') };
      case TokenType.BOOLEAN:
        return {
          type: 'BOOLEAN',
          value: booleanLiteralValue(token.text.toUpperCase(), this.config.locale) === true,
        };
      case TokenType.ERROR_LITERAL:
        return {
          type: 'ERROR',
          error: new CellError(errorLiteralToType(token.text, this.config.locale)),
        };
      case TokenType.CELL_REF: {
        const reference = parseCellReference(token.text);
        if (!reference) {
          throw new FormulaSyntaxError(`Invalid cell reference "${token.text}"`);
        }
        return { type: 'CELL_REFERENCE', reference };
      }
      case TokenType.SHEET_NAME: {
        const name = token.text.startsWith("'")
          ? token.text.slice(1, -1).replace(/''/g, "'")
          : token.text;
        const refToken = this.expect(TokenType.CELL_REF);
        const reference = parseCellReference(refToken.text);
        if (!reference) {
          throw new FormulaSyntaxError(`Invalid cell reference "${refToken.text}"`);
        }
        const sheet = this.sheetLookup(name);
        if (sheet === undefined) {
          // Like Excel after a sheet disappears: the reference is #REF! and
          // stays that way even if a sheet with that name is created later.
          return { type: 'ERROR', error: new CellError(CellErrorType.REF, `Unknown sheet "${name}"`) };
        }
        return { type: 'CELL_REFERENCE', reference: { ...reference, sheet } };
      }
      case TokenType.NAMED_EXPR:
        return { type: 'NAMED_EXPRESSION', name: token.text };
      case TokenType.FUNCTION_NAME:
        // The AST always carries the canonical English name (=SUMA -> SUM).
        return this.parseFunctionCall(toCanonicalName(token.text.toUpperCase(), this.config.locale));
      case TokenType.LPAREN: {
        const inner = this.parseExpression(0);
        this.expect(TokenType.RPAREN);
        return inner;
      }
      case TokenType.OP_MINUS:
        return { type: 'UNARY_OP', op: '-', operand: this.parseExpression(UNARY_BINDING_POWER) };
      case TokenType.OP_PLUS:
        return { type: 'UNARY_OP', op: '+', operand: this.parseExpression(UNARY_BINDING_POWER) };
      case TokenType.ARRAY_OPEN:
        return this.parseArrayLiteral();
      case TokenType.END:
        throw new FormulaSyntaxError('Unexpected end of formula');
      default:
        throw new FormulaSyntaxError(`Unexpected "${token.text}" at position ${token.start}`);
    }
  }

  /**
   * Array constant after its `{`: rows of scalar literals. The column
   * separator is `,` when that is the argument separator and `\` otherwise
   * (Excel es writes `{1\2;3\4}`); the row separator is always `;`, which in
   * `;`-argument locales arrives as an ARG_SEP token.
   */
  private parseArrayLiteral(): Ast {
    const commaColumns = this.config.argumentSeparator === ',';
    const isColSep = (type: TokenType): boolean =>
      type === (commaColumns ? TokenType.ARG_SEP : TokenType.ARRAY_COL_SEP);
    const isRowSep = (type: TokenType): boolean =>
      type === (commaColumns ? TokenType.ARRAY_ROW_SEP : TokenType.ARG_SEP);

    const values: Ast[][] = [];
    let row: Ast[] = [];
    for (;;) {
      row.push(this.parseArrayElement());
      const next = this.advance();
      if (isColSep(next.type)) {
        continue;
      }
      if (isRowSep(next.type)) {
        values.push(row);
        row = [];
        continue;
      }
      if (next.type === TokenType.ARRAY_CLOSE) {
        values.push(row);
        break;
      }
      throw new FormulaSyntaxError(`Unexpected "${next.text}" in array constant`);
    }
    if (values.some((cells) => cells.length !== values[0]!.length)) {
      throw new FormulaSyntaxError('Array constant rows must have the same length');
    }
    return { type: 'ARRAY_LITERAL', values };
  }

  /** Array constants allow only scalar literals (optionally negated numbers). */
  private parseArrayElement(): Ast {
    const token = this.advance();
    switch (token.type) {
      case TokenType.NUMBER:
        return { type: 'NUMBER', value: this.parseNumber(token.text) };
      case TokenType.OP_MINUS: {
        const next = this.advance();
        if (next.type !== TokenType.NUMBER) {
          throw new FormulaSyntaxError('Only numbers can be negated in an array constant');
        }
        return { type: 'NUMBER', value: -this.parseNumber(next.text) };
      }
      case TokenType.STRING:
        return { type: 'STRING', value: token.text.slice(1, -1).replace(/""/g, '"') };
      case TokenType.BOOLEAN:
        return {
          type: 'BOOLEAN',
          value: booleanLiteralValue(token.text.toUpperCase(), this.config.locale) === true,
        };
      case TokenType.ERROR_LITERAL:
        return {
          type: 'ERROR',
          error: new CellError(errorLiteralToType(token.text, this.config.locale)),
        };
      default:
        throw new FormulaSyntaxError(
          `Array constants allow only numbers, text, booleans and errors, got "${token.text}"`,
        );
    }
  }

  private parseFunctionCall(name: string): Ast {
    this.expect(TokenType.LPAREN);
    const args: Ast[] = [];
    if (this.peek().type !== TokenType.RPAREN) {
      for (;;) {
        const next = this.peek().type;
        if (next === TokenType.ARG_SEP || next === TokenType.RPAREN) {
          args.push({ type: 'EMPTY_ARG' }); // omitted argument: =IF(A1,,2)
        } else {
          args.push(this.parseExpression(0));
        }
        if (this.peek().type === TokenType.ARG_SEP) {
          this.advance();
          continue;
        }
        break;
      }
    }
    this.expect(TokenType.RPAREN);
    return { type: 'FUNCTION_CALL', name, args };
  }

  private parseNumber(text: string): number {
    return Number(
      this.config.decimalSeparator === '.' ? text : text.replace(this.config.decimalSeparator, '.'),
    );
  }
}

/**
 * Parses a formula (with or without the leading "=") into an AST.
 * Never throws on bad input: returns a PARSE_ERROR node instead.
 */
export function parseFormula(
  formula: string,
  config: EngineConfig = DEFAULT_CONFIG,
  sheetLookup: SheetLookup = NO_SHEETS,
): Ast {
  try {
    const body = formula.startsWith('=') ? formula.slice(1) : formula;
    const parser = new Parser(tokenize(body, config), config, sheetLookup);
    const ast = parser.parseExpression(0);
    parser.expect(TokenType.END);
    return ast;
  } catch (error) {
    if (error instanceof FormulaSyntaxError) {
      return { type: 'PARSE_ERROR', error: new CellError(CellErrorType.ERROR, error.message) };
    }
    throw error;
  }
}
