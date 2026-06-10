export enum TokenType {
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  ERROR_LITERAL = 'ERROR_LITERAL',
  CELL_REF = 'CELL_REF',
  /** Sheet qualifier before a reference: `Sheet2!` or `'My Sheet'!` (text excludes the `!`). */
  SHEET_NAME = 'SHEET_NAME',
  FUNCTION_NAME = 'FUNCTION_NAME',
  NAMED_EXPR = 'NAMED_EXPR',
  RANGE_OP = 'RANGE_OP',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  ARG_SEP = 'ARG_SEP',
  OP_PLUS = 'OP_PLUS',
  OP_MINUS = 'OP_MINUS',
  OP_MULT = 'OP_MULT',
  OP_DIV = 'OP_DIV',
  OP_POW = 'OP_POW',
  OP_CONCAT = 'OP_CONCAT',
  OP_PERCENT = 'OP_PERCENT',
  OP_EQ = 'OP_EQ',
  OP_NEQ = 'OP_NEQ',
  OP_LT = 'OP_LT',
  OP_GT = 'OP_GT',
  OP_LTE = 'OP_LTE',
  OP_GTE = 'OP_GTE',
  ARRAY_OPEN = 'ARRAY_OPEN',
  ARRAY_CLOSE = 'ARRAY_CLOSE',
  END = 'END',
}

export interface Token {
  type: TokenType;
  /** Raw slice of the formula text. */
  text: string;
  /** Offset into the formula body (after the leading "="). */
  start: number;
}
