/**
 * Spanish (es-ES Excel) function names for the built-in library,
 * canonical -> localized. Both spellings are accepted on input; this map
 * also drives localized serialization.
 */
export const ES_FUNCTION_NAMES: Readonly<Record<string, string>> = {
  // math
  SUM: 'SUMA',
  ROUND: 'REDONDEAR',
  ROUNDUP: 'REDONDEAR.MAS',
  ROUNDDOWN: 'REDONDEAR.MENOS',
  ABS: 'ABS',
  SQRT: 'RAIZ',
  POWER: 'POTENCIA',
  MOD: 'RESIDUO',
  INT: 'ENTERO',
  // statistical
  AVERAGE: 'PROMEDIO',
  COUNT: 'CONTAR',
  COUNTA: 'CONTARA',
  MIN: 'MIN',
  MAX: 'MAX',
  SUMIF: 'SUMAR.SI',
  COUNTIF: 'CONTAR.SI',
  // logical
  IF: 'SI',
  IFS: 'SI.CONJUNTO',
  AND: 'Y',
  OR: 'O',
  NOT: 'NO',
  IFERROR: 'SI.ERROR',
  // text
  CONCAT: 'CONCAT',
  LEFT: 'IZQUIERDA',
  RIGHT: 'DERECHA',
  MID: 'EXTRAE',
  LEN: 'LARGO',
  UPPER: 'MAYUSC',
  LOWER: 'MINUSC',
  TRIM: 'ESPACIOS',
  TEXT: 'TEXTO',
  VALUE: 'VALOR',
  // lookup
  VLOOKUP: 'BUSCARV',
  HLOOKUP: 'BUSCARH',
  INDEX: 'INDICE',
  MATCH: 'COINCIDIR',
  // information
  ISBLANK: 'ESBLANCO',
  ISNUMBER: 'ESNUMERO',
  ISTEXT: 'ESTEXTO',
  ISERROR: 'ESERROR',
  // datetime
  TODAY: 'HOY',
  NOW: 'AHORA',
  DATE: 'FECHA',
};
