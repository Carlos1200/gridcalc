/** Math functions: SUM, PRODUCT, rounding, logs, trigonometry, FACT/COMBIN/GCD/LCM, ROMAN... */

import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import { asMatrix, asNumber, asScalar, asString, forEachNumber, roundScaled } from './helpers';
import type { RegisteredFunction } from './types';

/** Snap the quotient to 15 significant digits to undo binary noise before rounding. */
function cleanQuotient(n: number, significance: number): number {
  return Number((n / significance).toPrecision(15));
}

/**
 * GCD/LCM: every argument truncated, negatives rejected, folded pairwise.
 */
function integerFold(
  name: 'GCD' | 'LCM',
  initial: number,
  fold: (acc: number, value: number) => number,
): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let acc = initial;
      let invalid = false;
      const error = forEachNumber(args, (n) => {
        if (n < 0) {
          invalid = true;
        }
        acc = fold(acc, Math.trunc(n));
      });
      if (error) {
        return error;
      }
      return invalid ? new CellError(CellErrorType.NUM, `${name} needs non-negative numbers`) : acc;
    },
  };
}

function gcd2(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

const ROMAN_VALUES: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const ROMAN_DIGITS: Record<string, number> = {
  M: 1000,
  D: 500,
  C: 100,
  L: 50,
  X: 10,
  V: 5,
  I: 1,
};

/** Excel's BIT* functions only accept integers in [0, 2^48). */
const BIT_LIMIT = 2 ** 48;

function asBitOperand(value: number): bigint | CellError {
  if (!Number.isInteger(value) || value < 0 || value >= BIT_LIMIT) {
    return new CellError(CellErrorType.NUM, 'Bitwise operands must be integers in [0, 2^48)');
  }
  return BigInt(value);
}

function bitwise(name: string, op: (a: bigint, b: bigint) => bigint): RegisteredFunction {
  return numeric2(name, (a, b) => {
    const left = asBitOperand(a);
    if (left instanceof CellError) {
      return left;
    }
    const right = asBitOperand(b);
    return right instanceof CellError ? right : Number(op(left, right));
  });
}

/** BITLSHIFT/BITRSHIFT: a negative shift reverses direction; overflow -> #NUM!. */
function bitShift(name: 'BITLSHIFT' | 'BITRSHIFT', direction: 1 | -1): RegisteredFunction {
  return numeric2(name, (value, shiftNum) => {
    const operand = asBitOperand(value);
    if (operand instanceof CellError) {
      return operand;
    }
    const shift = Math.trunc(shiftNum) * direction;
    if (Math.abs(shift) > 53) {
      return new CellError(CellErrorType.NUM, `${name} shift is out of range`);
    }
    const result = shift >= 0 ? operand << BigInt(shift) : operand >> BigInt(-shift);
    if (result >= BigInt(BIT_LIMIT)) {
      return new CellError(CellErrorType.NUM, `${name} result does not fit in 48 bits`);
    }
    return Number(result);
  });
}

/** One coerced numeric argument. */
function numeric1(name: string, fn: (x: number) => number | CellError): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const x = asNumber(args[0]!);
      return x instanceof CellError ? x : fn(x);
    },
  };
}

/** Two coerced numeric arguments. */
function numeric2(name: string, fn: (x: number, y: number) => number | CellError): RegisteredFunction {
  return {
    metadata: { name, minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const x = asNumber(args[0]!);
      if (x instanceof CellError) {
        return x;
      }
      const y = asNumber(args[1]!);
      return y instanceof CellError ? y : fn(x, y);
    },
  };
}

export const mathFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'SUM', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let total = 0;
      const error = forEachNumber(args, (n) => {
        total += n;
      });
      return error ?? total;
    },
  },
  numeric2('ROUND', (n, digits) => roundScaled(n, digits, 'half-away')),
  numeric2('ROUNDUP', (n, digits) => roundScaled(n, digits, 'up')),
  numeric2('ROUNDDOWN', (n, digits) => roundScaled(n, digits, 'down')),
  numeric1('ABS', Math.abs),
  numeric1('SQRT', (n) =>
    n < 0 ? new CellError(CellErrorType.NUM, 'SQRT of a negative number') : Math.sqrt(n),
  ),
  numeric2('POWER', (base, exponent) => {
    if (base === 0 && exponent === 0) {
      return new CellError(CellErrorType.NUM, '0^0 is undefined');
    }
    const result = Math.pow(base, exponent);
    return Number.isFinite(result)
      ? result
      : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric2('MOD', (n, divisor) => {
    if (divisor === 0) {
      return new CellError(CellErrorType.DIV_BY_ZERO);
    }
    // Excel: result takes the divisor's sign (MOD(-10,3)=2, MOD(10,-3)=-2).
    const result = n - divisor * Math.floor(n / divisor);
    return result === 0 ? 0 : result;
  }),
  numeric1('INT', Math.floor),
  {
    metadata: { name: 'PRODUCT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let product = 1;
      let sawNumber = false;
      const error = forEachNumber(args, (n) => {
        product *= n;
        sawNumber = true;
      });
      // No numbers at all -> 0, like Excel (=PRODUCT(A1:A2) over text cells).
      return error ?? (sawNumber ? product : 0);
    },
  },
  numeric2('CEILING', (n, significance) => {
    if (significance === 0) {
      return 0; // Excel quirk: CEILING(x,0) is 0, while FLOOR(x,0) is #DIV/0!
    }
    if (n > 0 && significance < 0) {
      return new CellError(CellErrorType.NUM, 'CEILING significance must match the sign of the number');
    }
    const result = Math.ceil(cleanQuotient(n, significance)) * significance;
    return result === 0 ? 0 : result;
  }),
  numeric2('FLOOR', (n, significance) => {
    if (significance === 0) {
      return n === 0 ? 0 : new CellError(CellErrorType.DIV_BY_ZERO, 'FLOOR significance cannot be 0');
    }
    if (n > 0 && significance < 0) {
      return new CellError(CellErrorType.NUM, 'FLOOR significance must match the sign of the number');
    }
    const result = Math.floor(cleanQuotient(n, significance)) * significance;
    return result === 0 ? 0 : result;
  }),
  {
    // TRUNC is ROUNDDOWN with an optional digit count (default 0).
    metadata: { name: 'TRUNC', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      let digits = 0;
      if (args.length > 1) {
        const digitsNum = asNumber(args[1]!);
        if (digitsNum instanceof CellError) {
          return digitsNum;
        }
        digits = digitsNum;
      }
      return roundScaled(n, digits, 'down');
    },
  },
  numeric1('SIGN', (n) => (n === 0 ? 0 : Math.sign(n))),
  numeric1('EXP', (n) => {
    const result = Math.exp(n);
    return Number.isFinite(result) ? result : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric1('LN', (n) =>
    n <= 0 ? new CellError(CellErrorType.NUM, 'LN needs a positive number') : Math.log(n),
  ),
  numeric1('LOG10', (n) =>
    n <= 0 ? new CellError(CellErrorType.NUM, 'LOG10 needs a positive number') : Math.log10(n),
  ),
  {
    metadata: { name: 'LOG', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      let base = 10;
      if (args.length > 1) {
        const baseNum = asNumber(args[1]!);
        if (baseNum instanceof CellError) {
          return baseNum;
        }
        base = baseNum;
      }
      if (n <= 0 || base <= 0) {
        return new CellError(CellErrorType.NUM, 'LOG needs positive arguments');
      }
      if (base === 1) {
        return new CellError(CellErrorType.DIV_BY_ZERO, 'LOG base cannot be 1');
      }
      return Math.log(n) / Math.log(base);
    },
  },
  {
    metadata: { name: 'PI', minArgs: 0, maxArgs: 0 },
    fn: () => Math.PI,
  },
  // EVEN/ODD round away from zero to the next even/odd integer.
  numeric1('EVEN', (n) => {
    const result = (n < 0 ? -1 : 1) * 2 * Math.ceil(Math.abs(n) / 2);
    return result === 0 ? 0 : result;
  }),
  numeric1('ODD', (n) => (n < 0 ? -1 : 1) * (2 * Math.ceil((Math.abs(n) - 1) / 2) + 1)),
  {
    metadata: { name: 'SUMPRODUCT', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const matrices = args.map(asMatrix);
      const rows = matrices[0]!.length;
      const cols = matrices[0]![0]?.length ?? 0;
      for (const matrix of matrices) {
        if (matrix.length !== rows || (matrix[0]?.length ?? 0) !== cols) {
          return new CellError(CellErrorType.VALUE, 'SUMPRODUCT ranges must have the same shape');
        }
      }
      let total = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          let term = 1;
          for (const matrix of matrices) {
            const value = asScalar(matrix[row]![col]!);
            if (value instanceof CellError) {
              return value;
            }
            // Non-numeric entries (text, booleans, empties) count as 0.
            term *= typeof value === 'number' ? value : 0;
          }
          total += term;
        }
      }
      return total;
    },
  },
  numeric1('SIN', Math.sin),
  numeric1('COS', Math.cos),
  numeric1('TAN', Math.tan),
  numeric1('ASIN', (n) =>
    n < -1 || n > 1 ? new CellError(CellErrorType.NUM, 'ASIN needs a number in [-1, 1]') : Math.asin(n),
  ),
  numeric1('ACOS', (n) =>
    n < -1 || n > 1 ? new CellError(CellErrorType.NUM, 'ACOS needs a number in [-1, 1]') : Math.acos(n),
  ),
  numeric1('ATAN', Math.atan),
  // Excel's argument order is (x, y), the reverse of Math.atan2.
  numeric2('ATAN2', (x, y) =>
    x === 0 && y === 0
      ? new CellError(CellErrorType.DIV_BY_ZERO, 'ATAN2(0,0) is undefined')
      : Math.atan2(y, x),
  ),
  numeric1('RADIANS', (n) => (n * Math.PI) / 180),
  numeric1('DEGREES', (n) => (n * 180) / Math.PI),
  numeric1('SQRTPI', (n) =>
    n < 0 ? new CellError(CellErrorType.NUM, 'SQRTPI needs a non-negative number') : Math.sqrt(n * Math.PI),
  ),
  numeric1('FACT', (n) => {
    const k = Math.trunc(n);
    if (k < 0) {
      return new CellError(CellErrorType.NUM, 'FACT needs a non-negative number');
    }
    if (k > 170) {
      return new CellError(CellErrorType.NUM, 'Numeric overflow'); // 171! overflows a double
    }
    let result = 1;
    for (let i = 2; i <= k; i++) {
      result *= i;
    }
    return result;
  }),
  numeric2('COMBIN', (nNum, kNum) => {
    const n = Math.trunc(nNum);
    const k = Math.trunc(kNum);
    if (n < 0 || k < 0 || n < k) {
      return new CellError(CellErrorType.NUM, 'COMBIN needs 0 <= chosen <= number');
    }
    // Multiplicative form keeps intermediates small enough for Excel's ranges.
    let result = 1;
    const span = Math.min(k, n - k);
    for (let i = 1; i <= span; i++) {
      result = (result * (n - span + i)) / i;
    }
    return Math.round(result);
  }),
  integerFold('GCD', 0, gcd2),
  integerFold('LCM', 1, (a, b) => (a === 0 || b === 0 ? 0 : (a / gcd2(a, b)) * b)),
  {
    // Classic (form 0) roman numerals only; 0 is the empty string, like Excel.
    metadata: { name: 'ROMAN', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      let value = Math.trunc(n);
      if (value < 0 || value > 3999) {
        return new CellError(CellErrorType.VALUE, 'ROMAN needs a number between 0 and 3999');
      }
      let out = '';
      for (const [amount, digits] of ROMAN_VALUES) {
        while (value >= amount) {
          out += digits;
          value -= amount;
        }
      }
      return out;
    },
  },
  numeric1('SINH', (n) => {
    const result = Math.sinh(n);
    return Number.isFinite(result) ? result : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric1('COSH', (n) => {
    const result = Math.cosh(n);
    return Number.isFinite(result) ? result : new CellError(CellErrorType.NUM, 'Numeric overflow');
  }),
  numeric1('TANH', Math.tanh),
  numeric1('ASINH', Math.asinh),
  numeric1('ACOSH', (n) =>
    n < 1 ? new CellError(CellErrorType.NUM, 'ACOSH needs a number >= 1') : Math.acosh(n),
  ),
  numeric1('ATANH', (n) =>
    n <= -1 || n >= 1
      ? new CellError(CellErrorType.NUM, 'ATANH needs a number in (-1, 1)')
      : Math.atanh(n),
  ),
  numeric2('MROUND', (n, multiple) => {
    if (multiple === 0) {
      return 0;
    }
    if ((n > 0 && multiple < 0) || (n < 0 && multiple > 0)) {
      return new CellError(CellErrorType.NUM, 'MROUND arguments must share their sign');
    }
    // Halves round away from zero, like Excel.
    const sign = n < 0 ? -1 : 1;
    const result =
      sign * Math.round(cleanQuotient(Math.abs(n), Math.abs(multiple))) * Math.abs(multiple);
    return result === 0 ? 0 : result;
  }),
  {
    metadata: { name: 'SUMSQ', minArgs: 1, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      let total = 0;
      const error = forEachNumber(args, (n) => {
        total += n * n;
      });
      return error ?? total;
    },
  },
  {
    // BASE(number, radix, minLength=0) -> text in the given radix.
    metadata: { name: 'BASE', minArgs: 2, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      const radixNum = asNumber(args[1]!);
      if (radixNum instanceof CellError) {
        return radixNum;
      }
      let minLength = 0;
      if (args[2] !== undefined) {
        const minLengthNum = asNumber(args[2]);
        if (minLengthNum instanceof CellError) {
          return minLengthNum;
        }
        minLength = Math.trunc(minLengthNum);
      }
      const value = Math.trunc(n);
      const radix = Math.trunc(radixNum);
      if (value < 0 || radix < 2 || radix > 36 || minLength < 0) {
        return new CellError(CellErrorType.NUM, 'BASE needs a non-negative number and a radix in [2, 36]');
      }
      return value.toString(radix).toUpperCase().padStart(minLength, '0');
    },
  },
  {
    // DECIMAL(text, radix) parses text as a number in the given radix.
    metadata: { name: 'DECIMAL', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const text = asString(args[0]!);
      if (text instanceof CellError) {
        return text;
      }
      const radixNum = asNumber(args[1]!);
      if (radixNum instanceof CellError) {
        return radixNum;
      }
      const radix = Math.trunc(radixNum);
      if (radix < 2 || radix > 36) {
        return new CellError(CellErrorType.NUM, 'DECIMAL radix must be in [2, 36]');
      }
      if (text === '') {
        return 0;
      }
      let total = 0;
      for (const char of text.toUpperCase()) {
        const digit = parseInt(char, 36);
        if (Number.isNaN(digit) || digit >= radix) {
          return new CellError(CellErrorType.NUM, `"${text}" is not a base-${radix} number`);
        }
        total = total * radix + digit;
      }
      return total;
    },
  },
  bitwise('BITAND', (a, b) => a & b),
  bitwise('BITOR', (a, b) => a | b),
  bitwise('BITXOR', (a, b) => a ^ b),
  bitShift('BITLSHIFT', 1),
  bitShift('BITRSHIFT', -1),
  {
    // DELTA(a, b=0): 1 when equal, 0 otherwise.
    metadata: { name: 'DELTA', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const a = asNumber(args[0]!);
      if (a instanceof CellError) {
        return a;
      }
      const b = args[1] !== undefined ? asNumber(args[1]) : 0;
      return b instanceof CellError ? b : a === b ? 1 : 0;
    },
  },
  {
    // GESTEP(n, step=0): 1 when n >= step, 0 otherwise.
    metadata: { name: 'GESTEP', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      const step = args[1] !== undefined ? asNumber(args[1]) : 0;
      return step instanceof CellError ? step : n >= step ? 1 : 0;
    },
  },
  {
    metadata: { name: 'ARABIC', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const raw = asString(args[0]!);
      if (raw instanceof CellError) {
        return raw;
      }
      let text = raw.trim().toUpperCase();
      let sign = 1;
      if (text.startsWith('-')) {
        sign = -1;
        text = text.slice(1);
        if (text === '') {
          return new CellError(CellErrorType.VALUE, 'ARABIC cannot parse a lone minus sign');
        }
      }
      let total = 0;
      for (let i = 0; i < text.length; i++) {
        const value = ROMAN_DIGITS[text[i]!];
        if (value === undefined) {
          return new CellError(CellErrorType.VALUE, `ARABIC cannot parse "${raw}"`);
        }
        const next = ROMAN_DIGITS[text[i + 1] ?? ''];
        total += next !== undefined && value < next ? -value : value;
      }
      return sign * total;
    },
  },
];
