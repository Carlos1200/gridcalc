export {
  CellError,
  CellErrorType,
  EmptyValue,
  isCellError,
  type EmptyValueType,
  type InterpreterValue,
  type RawScalarValue,
  type ScalarValue,
} from './value/types';
export {
  coerceToBoolean,
  coerceToNumber,
  coerceToString,
  numberToText,
  parseNumericString,
} from './value/coercion';
export {
  dateToSerial,
  fractionToTime,
  isValidDate,
  serialToDate,
  timeToFraction,
  type SimpleDate,
  type SimpleTime,
} from './value/dates';
export { buildConfig, DEFAULT_CONFIG, type EngineConfig } from './config/types';
