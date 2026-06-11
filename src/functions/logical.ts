/** Logical functions: IF, IFS, AND/OR/XOR, NOT, TRUE/FALSE, IFERROR/IFNA, SWITCH. */

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
 * AND/OR/XOR: direct arguments must coerce to logical (#VALUE! otherwise);
 * inside ranges only booleans and numbers participate, text and empties are
 * skipped. Excel does NOT short-circuit: =AND(FALSE,1/0) is #DIV/0!, so they
 * are eager. XOR is TRUE when the count of TRUE values is odd.
 */
function logicalFold(
  name: 'AND' | 'OR' | 'XOR',
  initial: boolean,
  fold: (acc: boolean, value: boolean) => boolean,
): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let result = initial;
      let seen = false;
      const error = forEachScalar(args, (value, fromRange) => {
        if (value instanceof CellError) {
          return value;
        }
        if (fromRange) {
          if (typeof value === 'boolean' || typeof value === 'number') {
            seen = true;
            result = fold(result, Boolean(value));
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
        result = fold(result, logical);
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
  logicalFold('AND', true, (acc, value) => acc && value),
  logicalFold('OR', false, (acc, value) => acc || value),
  logicalFold('XOR', false, (acc, value) => acc !== value),
  {
    metadata: { name: 'NOT', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const logical = asBoolean(args[0]!);
      return logical instanceof CellError ? logical : !logical;
    },
  },
  {
    metadata: { name: 'TRUE', minArgs: 0, maxArgs: 0 },
    fn: () => true,
  },
  {
    metadata: { name: 'FALSE', minArgs: 0, maxArgs: 0 },
    fn: () => false,
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
  {
    // Like IFERROR, but only #N/A triggers the fallback.
    metadata: { name: 'IFNA', minArgs: 2, maxArgs: 2, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      const value = evaluateAst(args[0]!, context);
      const scalar = asScalar(value);
      if (scalar instanceof CellError && scalar.type === CellErrorType.NA) {
        return evaluateBranch(args[1]!, context);
      }
      return value;
    },
  },
  {
    // Lazy so only the matched result is evaluated, like CHOOSE.
    metadata: { name: 'SWITCH', minArgs: 3, maxArgs: Infinity, argHandling: 'lazy' },
    fn: (args: Ast[], context: EvaluationContext) => {
      const expression = asScalar(evaluateAst(args[0]!, context));
      if (expression instanceof CellError) {
        return expression;
      }
      // (value, result) pairs; a trailing unpaired argument is the default.
      for (let i = 1; i + 1 < args.length; i += 2) {
        const candidate = asScalar(evaluateAst(args[i]!, context));
        if (candidate instanceof CellError) {
          return candidate;
        }
        const matches =
          typeof candidate === 'string' && typeof expression === 'string'
            ? candidate.toLowerCase() === expression.toLowerCase()
            : candidate === expression;
        if (matches) {
          return evaluateBranch(args[i + 1]!, context);
        }
      }
      const hasDefault = (args.length - 1) % 2 === 1;
      return hasDefault
        ? evaluateBranch(args[args.length - 1]!, context)
        : new CellError(CellErrorType.NA, 'No SWITCH case matched');
    },
  },
];
