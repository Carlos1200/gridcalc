/** Common signature and metadata shared by every spreadsheet function. */

import type { Ast } from '../ast/nodes';
import type { EvaluationContext } from '../evaluator/context';
import type { RawInterpreterValue } from '../value/types';

export interface FunctionMetadata {
  /** Canonical English name, e.g. "SUM" (i18n maps localized names to it). */
  name: string;
  minArgs: number;
  /** Infinity for variadic functions. */
  maxArgs: number;
  /** Recalculated on every cycle even if inputs did not change (NOW, RAND...). */
  volatile?: boolean;
  /**
   * scalar (default): args evaluated eagerly; the implementation expects scalars.
   * range-aware: args evaluated eagerly; ranges arrive as 2D arrays (SUM, COUNT...).
   * lazy: the implementation receives unevaluated ASTs and decides what to
   * evaluate — required for short-circuiting (IF, IFERROR, AND, OR).
   */
  argHandling?: 'scalar' | 'range-aware' | 'lazy';
}

export interface EagerFunction {
  metadata: FunctionMetadata & { argHandling?: 'scalar' | 'range-aware' };
  fn: (args: RawInterpreterValue[], context: EvaluationContext) => RawInterpreterValue;
}

export interface LazyFunction {
  metadata: FunctionMetadata & { argHandling: 'lazy' };
  fn: (args: Ast[], context: EvaluationContext) => RawInterpreterValue;
}

export type RegisteredFunction = EagerFunction | LazyFunction;

export function isLazyFunction(entry: RegisteredFunction): entry is LazyFunction {
  return entry.metadata.argHandling === 'lazy';
}
