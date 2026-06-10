/**
 * AST -> formula text (the inverse of the parser), and the reference
 * adjustment used when copying formulas between cells.
 *
 * Serialization emits minimal parentheses based on the same binding powers
 * the parser uses, so parse(serialize(ast)) always yields `ast` back.
 */

import { DEFAULT_CONFIG, type EngineConfig } from '../config/types';
import { toLocalizedName } from '../i18n/index';
import { formatCellReference, parseCellReference } from '../reference/addressing';
import type { CellReference } from '../reference/types';
import { CellError, CellErrorType } from '../value/types';
import type { Ast, BinaryOperator } from './nodes';

/** Resolves a sheet id to its name; undefined = removed sheet -> #REF!. */
export type SheetNameLookup = (sheet: number) => string | undefined;

const NO_SHEET_NAMES: SheetNameLookup = () => undefined;

/** Mirrors the parser's BINARY_BINDING_POWER. */
const BINARY_POWER: Record<BinaryOperator, number> = {
  '=': 2,
  '<>': 2,
  '<': 2,
  '>': 2,
  '<=': 2,
  '>=': 2,
  '&': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '^': 6,
};
const PERCENT_POWER = 7;
const UNARY_POWER = 8;
const RANGE_POWER = 9;
const ATOM_POWER = 10;

function nodePower(ast: Ast): number {
  switch (ast.type) {
    case 'BINARY_OP':
      return BINARY_POWER[ast.op];
    case 'UNARY_OP':
      return ast.op === '%' ? PERCENT_POWER : UNARY_POWER;
    case 'RANGE_REFERENCE':
      return RANGE_POWER;
    default:
      return ATOM_POWER;
  }
}

function sheetPrefix(sheet: number | undefined, sheetName: SheetNameLookup): string | undefined {
  if (sheet === undefined) {
    return '';
  }
  const name = sheetName(sheet);
  if (name === undefined) {
    return undefined;
  }
  const unquoted = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !parseCellReference(name);
  return (unquoted ? name : `'${name.replace(/'/g, "''")}'`) + '!';
}

/** Serializes a parsed formula back to text (without the leading "="). */
export function serializeAst(
  ast: Ast,
  config: EngineConfig = DEFAULT_CONFIG,
  sheetName: SheetNameLookup = NO_SHEET_NAMES,
): string {
  const wrap = (child: Ast, needsParens: boolean): string => {
    const text = serializeAst(child, config, sheetName);
    return needsParens ? `(${text})` : text;
  };

  switch (ast.type) {
    case 'NUMBER':
      return String(ast.value).replace('.', config.decimalSeparator);
    case 'STRING':
      return `"${ast.value.replace(/"/g, '""')}"`;
    case 'BOOLEAN':
      return ast.value ? 'TRUE' : 'FALSE';
    case 'ERROR':
    case 'PARSE_ERROR':
      return ast.error.toString();
    case 'CELL_REFERENCE': {
      const prefix = sheetPrefix(ast.reference.sheet, sheetName);
      return prefix === undefined ? '#REF!' : prefix + formatCellReference(ast.reference);
    }
    case 'RANGE_REFERENCE': {
      // Parser invariant: both ends are on the same sheet.
      const prefix = sheetPrefix(ast.start.sheet, sheetName);
      return prefix === undefined
        ? '#REF!'
        : `${prefix}${formatCellReference(ast.start)}:${formatCellReference(ast.end)}`;
    }
    case 'NAMED_EXPRESSION':
      return ast.name;
    case 'FUNCTION_CALL':
      return `${toLocalizedName(ast.name, config.locale)}(${ast.args
        .map((arg) => (arg.type === 'EMPTY_ARG' ? '' : serializeAst(arg, config, sheetName)))
        .join(config.argumentSeparator)})`;
    case 'UNARY_OP':
      if (ast.op === '%') {
        return wrap(ast.operand, nodePower(ast.operand) < PERCENT_POWER) + '%';
      }
      return ast.op + wrap(ast.operand, nodePower(ast.operand) < UNARY_POWER);
    case 'BINARY_OP': {
      const power = BINARY_POWER[ast.op];
      // Left-associative: the right child needs parens at equal power too.
      const left = wrap(ast.left, nodePower(ast.left) < power);
      const right = wrap(ast.right, nodePower(ast.right) <= power);
      return left + ast.op + right;
    }
    case 'EMPTY_ARG':
      return '';
    case 'ARRAY_LITERAL':
      return `{${ast.values
        .map((row) => row.map((item) => serializeAst(item, config, sheetName)).join(config.argumentSeparator))
        .join(';')}}`;
  }
}

function adjustReference(
  ref: CellReference,
  deltaRow: number,
  deltaCol: number,
): CellReference | undefined {
  const col = ref.colAbsolute ? ref.col : ref.col + deltaCol;
  const row = ref.rowAbsolute ? ref.row : ref.row + deltaRow;
  if (col < 0 || row < 0) {
    return undefined; // walked off the top/left edge of the grid
  }
  return { ...ref, col, row };
}

const REF_ERROR: Ast = {
  type: 'ERROR',
  error: new CellError(CellErrorType.REF, 'Reference shifted outside the grid'),
};

/**
 * Shifts every relative reference by the copy offset, like Excel's
 * copy-paste: absolute parts ($) stay put, and a reference pushed off the
 * grid becomes #REF!.
 */
export function adjustReferences(ast: Ast, deltaRow: number, deltaCol: number): Ast {
  const adjust = (node: Ast): Ast => {
    switch (node.type) {
      case 'CELL_REFERENCE': {
        const reference = adjustReference(node.reference, deltaRow, deltaCol);
        return reference ? { ...node, reference } : REF_ERROR;
      }
      case 'RANGE_REFERENCE': {
        const start = adjustReference(node.start, deltaRow, deltaCol);
        const end = adjustReference(node.end, deltaRow, deltaCol);
        return start && end ? { ...node, start, end } : REF_ERROR;
      }
      case 'FUNCTION_CALL':
        return { ...node, args: node.args.map(adjust) };
      case 'UNARY_OP':
        return { ...node, operand: adjust(node.operand) };
      case 'BINARY_OP':
        return { ...node, left: adjust(node.left), right: adjust(node.right) };
      case 'ARRAY_LITERAL':
        return { ...node, values: node.values.map((row) => row.map(adjust)) };
      default:
        return node;
    }
  };
  return adjust(ast);
}
