import type { CellError } from '../value/types';
import type { CellReference } from '../reference/types';

export interface NumberLiteral {
  type: 'NUMBER';
  value: number;
}

export interface StringLiteral {
  type: 'STRING';
  value: string;
}

export interface BooleanLiteral {
  type: 'BOOLEAN';
  value: boolean;
}

/** An error typed literally in the formula, e.g. `=#N/A`. */
export interface ErrorLiteral {
  type: 'ERROR';
  error: CellError;
}

export interface CellReferenceAst {
  type: 'CELL_REFERENCE';
  reference: CellReference;
}

export interface RangeReferenceAst {
  type: 'RANGE_REFERENCE';
  start: CellReference;
  end: CellReference;
}

export interface NamedExpressionAst {
  type: 'NAMED_EXPRESSION';
  name: string;
}

export interface FunctionCallAst {
  type: 'FUNCTION_CALL';
  /** Always the canonical English name, uppercase (i18n happens at parse time). */
  name: string;
  args: Ast[];
}

export type UnaryOperator = '-' | '+' | '%';

export interface UnaryOpAst {
  type: 'UNARY_OP';
  op: UnaryOperator;
  operand: Ast;
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '&'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>=';

export interface BinaryOpAst {
  type: 'BINARY_OP';
  op: BinaryOperator;
  left: Ast;
  right: Ast;
}

/** An omitted argument, as in `=IF(A1,,2)`. */
export interface EmptyArgAst {
  type: 'EMPTY_ARG';
}

/** Array literal `{1,2;3,4}` (phase 3). */
export interface ArrayLiteralAst {
  type: 'ARRAY_LITERAL';
  /** rows x cols */
  values: Ast[][];
}

/**
 * Produced instead of throwing when a formula does not parse (error-tolerant
 * parsing, like Excel storing a broken formula). Evaluates to #ERROR!.
 */
export interface ParseErrorAst {
  type: 'PARSE_ERROR';
  error: CellError;
}

export type Ast =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ErrorLiteral
  | CellReferenceAst
  | RangeReferenceAst
  | NamedExpressionAst
  | FunctionCallAst
  | UnaryOpAst
  | BinaryOpAst
  | EmptyArgAst
  | ArrayLiteralAst
  | ParseErrorAst;
