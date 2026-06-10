/**
 * Core value system: every cell and every expression in the engine
 * produces one of these values.
 */

export enum CellErrorType {
  DIV_BY_ZERO = 'DIV/0', // #DIV/0!
  VALUE = 'VALUE', // #VALUE!
  REF = 'REF', // #REF!
  NAME = 'NAME', // #NAME?
  NUM = 'NUM', // #NUM!
  NA = 'NA', // #N/A
  NULL = 'NULL', // #NULL!
  SPILL = 'SPILL', // #SPILL! (phase 3)
  CIRCULAR = 'CIRCULAR', // circular reference
}

const ERROR_DISPLAY: Record<CellErrorType, string> = {
  [CellErrorType.DIV_BY_ZERO]: '#DIV/0!',
  [CellErrorType.VALUE]: '#VALUE!',
  [CellErrorType.REF]: '#REF!',
  [CellErrorType.NAME]: '#NAME?',
  [CellErrorType.NUM]: '#NUM!',
  [CellErrorType.NA]: '#N/A',
  [CellErrorType.NULL]: '#NULL!',
  [CellErrorType.SPILL]: '#SPILL!',
  [CellErrorType.CIRCULAR]: '#CIRCULAR!',
};

export class CellError {
  constructor(
    public readonly type: CellErrorType,
    public readonly message?: string,
  ) {}

  /** The string Excel shows for this error, e.g. "#DIV/0!". */
  toString(): string {
    return ERROR_DISPLAY[this.type];
  }
}

export function isCellError(value: unknown): value is CellError {
  return value instanceof CellError;
}

/** Scalar value that can live in a cell or be produced by an expression. */
export type ScalarValue = number | string | boolean | CellError;

/**
 * Result of an evaluation: a scalar, or a 2D array
 * (dynamic arrays / spilling, phase 3).
 */
export type InterpreterValue = ScalarValue | InterpreterValue[][];

/** An empty cell is distinct from 0 and from "" (ISBLANK must tell them apart). */
export const EmptyValue = Symbol('empty');
export type EmptyValueType = typeof EmptyValue;

/** Scalar as seen by coercion: includes the empty-cell marker. */
export type RawScalarValue = ScalarValue | EmptyValueType;
