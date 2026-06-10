/** Logical functions: IF, IFS, AND, OR, NOT, IFERROR. */

import type { Ast } from '../ast/nodes';
import type { EvaluationContext } from '../evaluator/context';
import { evaluateAst } from '../evaluator/interpreter';
import {
  CellError,
  CellErrorType,
  EmptyValue,
  type RawInterpreterValue,
} from '../value/types';
import { asBoolean, asScalar, forEachScalar } from './helpers';
import type { RegisteredFunction } from './types';

/** A chosen IF/IFS branch; an omitted argument (`=IF(x,,2)`) yields 0. */
function evaluateBranch(branch: Ast, context: EvaluationContext): RawInterpreterValue {
  const result = evaluateAst(branch, context);
  return result === EmptyValue ? 0 : result;
}

/**
 * AND/OR: direct arguments must coerce to logical (#VALUE! otherwise); inside
 * ranges only booleans and numbers participate, text and empties are skipped.
 * Excel does NOT short-circuit: =AND(FALSE,1/0) is #DIV/0!, so they are eager.
 */
function andOr(name: 'AND' | 'OR'): RegisteredFunction {
  const isOr = name === 'OR';
  return {
    metadata: { name, minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let result = isOr ? false : true;
      let seen = false;
      const error = forEachScalar(args, (value, fromRange) => {
        if (value instanceof CellError) {
          return value;
        }
        if (fromRange) {
          if (typeof value === 'boolean' || typeof value === 'number') {
            seen = true;
            result = isOr ? result || Boolean(value) : result && Boolean(value);
          }
          return undefined;
        }
        if (value === EmptyValue) {
          return undefined;
        }
        const logical = asBoolean(value);
        if (logical instanceof CellError) {
          return logical;
        }
        seen = true;
        result = isOr ? result || logical : result && logical;
        return undefined;
      });
      if (error) {
        return error;
      }
      return seen ? result : new CellError(CellErrorType.VALUE, `${name} needs a logical value`);
    },
  };
}

export const logicalFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'IF', minArgs: 2, maxArgs: 3, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      const condition = asBoolean(evaluateAst(args[0]!, context));
      if (condition instanceof CellError) {
        return condition;
      }
      const branch = condition ? args[1] : args[2];
      if (branch === undefined) {
        return false; // =IF(FALSE,"yes") -> FALSE
      }
      return evaluateBranch(branch, context);
    },
  },
  {
    metadata: { name: 'IFS', minArgs: 2, maxArgs: Infinity, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const condition = asBoolean(evaluateAst(args[i]!, context));
        if (condition instanceof CellError) {
          return condition;
        }
        if (condition) {
          return evaluateBranch(args[i + 1]!, context);
        }
      }
      return new CellError(CellErrorType.NA, 'No IFS condition was TRUE');
    },
  },
  andOr('AND'),
  andOr('OR'),
  {
    metadata: { name: 'NOT', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const logical = asBoolean(args[0]!);
      return logical instanceof CellError ? logical : !logical;
    },
  },
  {
    metadata: { name: 'IFERROR', minArgs: 2, maxArgs: 2, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      const value = evaluateAst(args[0]!, context);
      if (asScalar(value) instanceof CellError) {
        return evaluateBranch(args[1]!, context);
      }
      return value;
    },
  },
];
