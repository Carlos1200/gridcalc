/**
 * AST evaluator: walks a parsed formula and produces a raw value.
 *
 * Error semantics (Excel): operands are evaluated left to right; an error
 * VALUE in an operand wins over a coercion failure of the other operand.
 * Functions receive their arguments as-is (eager) or as ASTs (lazy) and are
 * responsible for their own coercions and error handling — SUM propagates
 * errors, COUNT ignores them, IFERROR catches them.
 */

import type { Ast, BinaryOpAst, FunctionCallAst, UnaryOpAst } from '../ast/nodes';
import type { CellReference, SimpleCellAddress, SimpleCellRange } from '../reference/types';
import { coerceToNumber, coerceToString } from '../value/coercion';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
  type RawScalarValue,
} from '../value/types';
import { isLazyFunction } from '../functions/types';
import type { EvaluationContext } from './context';

export function evaluateAst(ast: Ast, context: EvaluationContext): RawInterpreterValue {
  switch (ast.type) {
    case 'NUMBER':
    case 'STRING':
      return ast.value;
    case 'BOOLEAN':
      return ast.value;
    case 'ERROR':
    case 'PARSE_ERROR':
      return ast.error;
    case 'EMPTY_ARG':
      return EmptyValue;
    case 'CELL_REFERENCE':
      return context.getCellValue(resolveAddress(ast.reference, context.formulaAddress));
    case 'RANGE_REFERENCE':
      return context.getRangeValues(
        resolveRange(ast.start, ast.end, context.formulaAddress),
      );
    case 'NAMED_EXPRESSION': {
      const value = context.getNamedExpressionValue(ast.name);
      return value === undefined
        ? new CellError(CellErrorType.NAME, `Unknown name "${ast.name}"`)
        : value;
    }
    case 'FUNCTION_CALL':
      return evaluateFunctionCall(ast, context);
    case 'UNARY_OP':
      return evaluateUnaryOp(ast, context);
    case 'BINARY_OP':
      return evaluateBinaryOp(ast, context);
    case 'ARRAY_LITERAL':
      return ast.values.map((row) => row.map((item) => evaluateAst(item, context)));
  }
}

function resolveAddress(ref: CellReference, formulaAddress: SimpleCellAddress): SimpleCellAddress {
  return { sheet: ref.sheet ?? formulaAddress.sheet, col: ref.col, row: ref.row };
}

function resolveRange(
  start: CellReference,
  end: CellReference,
  formulaAddress: SimpleCellAddress,
): SimpleCellRange {
  const a = resolveAddress(start, formulaAddress);
  const b = resolveAddress(end, formulaAddress);
  return {
    start: { sheet: a.sheet, col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
    end: { sheet: a.sheet, col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
  };
}

/** A range where a single value is required -> #VALUE! (no implicit intersection in phase 1). */
function toScalar(value: RawInterpreterValue): RawScalarValue {
  if (Array.isArray(value)) {
    return new CellError(CellErrorType.VALUE, 'Expected a single value, got a range');
  }
  return value;
}

function evaluateFunctionCall(ast: FunctionCallAst, context: EvaluationContext): RawInterpreterValue {
  const registered = context.functions.get(ast.name);
  if (!registered) {
    return new CellError(CellErrorType.NAME, `Unknown function ${ast.name}`);
  }
  const { minArgs, maxArgs, name } = registered.metadata;
  if (ast.args.length < minArgs || ast.args.length > maxArgs) {
    return new CellError(
      CellErrorType.NA,
      `${name} expects ${minArgs === maxArgs ? minArgs : `${minArgs}..${maxArgs}`} argument(s), got ${ast.args.length}`,
    );
  }
  if (isLazyFunction(registered)) {
    return registered.fn(ast.args, context);
  }
  return registered.fn(
    ast.args.map((arg) => evaluateAst(arg, context)),
    context,
  );
}

function evaluateUnaryOp(ast: UnaryOpAst, context: EvaluationContext): RawInterpreterValue {
  const value = evaluateAst(ast.operand, context);
  if (value instanceof CellError) {
    return value;
  }
  switch (ast.op) {
    case '+':
      // Excel's unary plus is a no-op on any operand, even text: =+"abc" -> "abc".
      return value;
    case '-': {
      const n = coerceToNumber(toScalar(value));
      return n instanceof CellError ? n : -n;
    }
    case '%': {
      const n = coerceToNumber(toScalar(value));
      return n instanceof CellError ? n : n / 100;
    }
  }
}

function evaluateBinaryOp(ast: BinaryOpAst, context: EvaluationContext): RawInterpreterValue {
  const leftValue = evaluateAst(ast.left, context);
  const rightValue = evaluateAst(ast.right, context);
  if (leftValue instanceof CellError) {
    return leftValue;
  }
  if (rightValue instanceof CellError) {
    return rightValue;
  }
  const left = toScalar(leftValue);
  if (left instanceof CellError) {
    return left;
  }
  const right = toScalar(rightValue);
  if (right instanceof CellError) {
    return right;
  }

  switch (ast.op) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '^':
      return arithmetic(ast.op, left, right, context.config.precisionRounding);
    case '&': {
      const l = coerceToString(left);
      if (l instanceof CellError) {
        return l;
      }
      const r = coerceToString(right);
      return r instanceof CellError ? r : l + r;
    }
    case '=':
    case '<>':
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const cmp = compareScalars(left, right);
      switch (ast.op) {
        case '=':
          return cmp === 0;
        case '<>':
          return cmp !== 0;
        case '<':
          return cmp < 0;
        case '>':
          return cmp > 0;
        case '<=':
          return cmp <= 0;
        case '>=':
          return cmp >= 0;
      }
    }
  }
}

/**
 * Excel hides binary float noise in additions and subtractions (=0.1+0.2=0.3
 * is TRUE) by snapping the result to `precisionRounding` significant digits.
 * Multiplication and division results are NOT snapped, also like Excel.
 */
function smartRound(value: number, significantDigits: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(significantDigits));
}

function arithmetic(
  op: '+' | '-' | '*' | '/' | '^',
  left: RawScalarValue,
  right: RawScalarValue,
  precisionRounding: number,
): number | CellError {
  const l = coerceToNumber(left);
  if (l instanceof CellError) {
    return l;
  }
  const r = coerceToNumber(right);
  if (r instanceof CellError) {
    return r;
  }
  let result: number;
  switch (op) {
    case '+':
      result = smartRound(l + r, precisionRounding);
      break;
    case '-':
      result = smartRound(l - r, precisionRounding);
      break;
    case '*':
      result = l * r;
      break;
    case '/':
      if (r === 0) {
        return new CellError(CellErrorType.DIV_BY_ZERO);
      }
      result = l / r;
      break;
    case '^':
      if (l === 0 && r === 0) {
        return new CellError(CellErrorType.NUM, '0^0 is undefined');
      }
      result = Math.pow(l, r);
      break;
  }
  // Overflow and NaN (e.g. (-8)^0.5) -> #NUM!, like Excel.
  return Number.isFinite(result) ? result : new CellError(CellErrorType.NUM, 'Numeric overflow');
}

/**
 * Excel comparison semantics, shared by all six comparison operators (and by
 * lookup/criteria matching in the function library):
 * - cross-type values never coerce; they order as number < text < logical
 *   (so ="1"=1 is FALSE and =1<"a" is TRUE);
 * - text compares case-insensitively;
 * - an empty cell adopts the other side's type: 0, "" or FALSE.
 * Returns negative / zero / positive.
 */
export function compareScalars(leftRaw: RawScalarValue, rightRaw: RawScalarValue): number {
  let left = leftRaw === EmptyValue ? neutralFor(rightRaw) : leftRaw;
  const right = rightRaw === EmptyValue ? neutralFor(left) : rightRaw;
  left = left === EmptyValue ? neutralFor(right) : left;
  // Errors were propagated before comparison; only plain scalars remain.
  const l = left as number | string | boolean;
  const r = right as number | string | boolean;

  const rankDiff = typeRank(l) - typeRank(r);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (typeof l === 'string' && typeof r === 'string') {
    const a = l.toLowerCase();
    const b = r.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = Number(l);
  const b = Number(r);
  return a < b ? -1 : a > b ? 1 : 0;
}

function typeRank(value: number | string | boolean): number {
  switch (typeof value) {
    case 'number':
      return 0;
    case 'string':
      return 1;
    case 'boolean':
      return 2;
  }
}

/** What an empty cell counts as when compared against `other`. */
function neutralFor(other: RawScalarValue): RawScalarValue {
  switch (typeof other) {
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
    default:
      // empty vs empty
      return 0;
  }
}
